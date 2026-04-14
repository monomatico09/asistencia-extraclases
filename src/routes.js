const express = require('express');
const db = require('./database');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { verificarToken, soloAdmin } = require('./auth');

const router = express.Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de inicio de sesión. Intenta de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false
});

router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { usuario, contraseña } = req.body;
    if (!usuario || !contraseña || typeof usuario !== 'string' || typeof contraseña !== 'string') {
      return res.status(400).json({ error: 'Usuario y contraseña son obligatorios' });
    }
    const usuarioEncontrado = db.prepare('SELECT * FROM usuarios WHERE usuario = ?').get(usuario);
    if (!usuarioEncontrado) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    if (usuarioEncontrado.activo === 0) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const coincide = await bcrypt.compare(contraseña, usuarioEncontrado.password_hash);
    if (!coincide) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const token = jwt.sign(
      { id: usuarioEncontrado.id, rol: usuarioEncontrado.rol },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({
      token,
      usuario: {
        id: usuarioEncontrado.id,
        nombre: usuarioEncontrado.nombre,
        usuario: usuarioEncontrado.usuario,
        rol: usuarioEncontrado.rol
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al iniciar sesión' });
  }
});

router.use(verificarToken);

router.get('/grupos', (req, res) => {
  try {
    const incluirInactivos = req.query.incluir_inactivos === 'true';
    let grupos;
    if (req.user.rol === 'admin') {
      const sql = incluirInactivos
        ? 'SELECT * FROM grupos ORDER BY nombre'
        : 'SELECT * FROM grupos WHERE activo = 1 ORDER BY nombre';
      grupos = db.prepare(sql).all();
    } else {
      const sql = incluirInactivos
        ? 'SELECT * FROM grupos WHERE entrenador_id = ? ORDER BY nombre'
        : 'SELECT * FROM grupos WHERE entrenador_id = ? AND activo = 1 ORDER BY nombre';
      grupos = db.prepare(sql).all(req.user.id);
    }
    res.json(grupos);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener los grupos' });
  }
});

router.get('/grupos/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const incluirInactivos = req.query.incluir_inactivos === 'true';
    const grupo = db.prepare('SELECT * FROM grupos WHERE id = ?').get(id);
    if (!grupo || (!incluirInactivos && grupo.activo === 0)) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    if (req.user.rol === 'entrenador' && grupo.entrenador_id !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permiso para ver este grupo' });
    }
    res.json(grupo);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener el grupo' });
  }
});

router.get('/grupos/:id/estudiantes', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const grupo = db.prepare('SELECT id, entrenador_id FROM grupos WHERE id = ?').get(id);
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    if (req.user.rol === 'entrenador' && grupo.entrenador_id !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permiso para ver este grupo' });
    }
    const incluirInactivos = req.query.incluir_inactivos === 'true';
    const sqlEstudiantes = incluirInactivos
      ? 'SELECT * FROM estudiantes WHERE grupo_id = ? ORDER BY nombre_completo'
      : 'SELECT * FROM estudiantes WHERE grupo_id = ? AND activo = 1 ORDER BY nombre_completo';
    const estudiantes = db.prepare(sqlEstudiantes).all(id);
    res.json(estudiantes);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener los estudiantes del grupo' });
  }
});

router.get('/estudiantes', (req, res) => {
  try {
    const incluirInactivos = req.query.incluir_inactivos === 'true';
    let estudiantes;
    if (req.user.rol === 'admin') {
      const sql = incluirInactivos
        ? `SELECT estudiantes.*, grupos.nombre AS grupo_nombre
           FROM estudiantes
           LEFT JOIN grupos ON estudiantes.grupo_id = grupos.id
           ORDER BY estudiantes.nombre_completo`
        : `SELECT estudiantes.*, grupos.nombre AS grupo_nombre
           FROM estudiantes
           LEFT JOIN grupos ON estudiantes.grupo_id = grupos.id
           WHERE estudiantes.activo = 1
           ORDER BY estudiantes.nombre_completo`;
      estudiantes = db.prepare(sql).all();
    } else {
      const sql = incluirInactivos
        ? `SELECT estudiantes.*, grupos.nombre AS grupo_nombre
           FROM estudiantes
           LEFT JOIN grupos ON estudiantes.grupo_id = grupos.id
           WHERE estudiantes.grupo_id IN (SELECT id FROM grupos WHERE entrenador_id = ?)
           ORDER BY estudiantes.nombre_completo`
        : `SELECT estudiantes.*, grupos.nombre AS grupo_nombre
           FROM estudiantes
           LEFT JOIN grupos ON estudiantes.grupo_id = grupos.id
           WHERE estudiantes.activo = 1
             AND estudiantes.grupo_id IN (SELECT id FROM grupos WHERE entrenador_id = ?)
           ORDER BY estudiantes.nombre_completo`;
      estudiantes = db.prepare(sql).all(req.user.id);
    }
    res.json(estudiantes);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener los estudiantes' });
  }
});

router.get('/estudiantes/:id', (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const incluirInactivos = req.query.incluir_inactivos === 'true';
    const sql = `
      SELECT estudiantes.*, grupos.nombre AS grupo_nombre
      FROM estudiantes
      LEFT JOIN grupos ON estudiantes.grupo_id = grupos.id
      WHERE estudiantes.id = ?${incluirInactivos ? '' : ' AND estudiantes.activo = 1'}
    `;
    const estudiante = db.prepare(sql).get(id);
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }
    if (req.user.rol === 'entrenador') {
      const pertenece = db.prepare(`
        SELECT 1 FROM grupos WHERE id = ? AND entrenador_id = ?
      `).get(estudiante.grupo_id, req.user.id);
      if (!pertenece) {
        return res.status(403).json({ error: 'No tienes permiso para ver este estudiante' });
      }
    }
    res.json(estudiante);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener el estudiante' });
  }
});

router.post('/asistencias', async (req, res) => {
  try {
    const { grupo_id, fecha, registros } = req.body;

    // 1. Validar grupo_id
    if (!Number.isInteger(grupo_id) || grupo_id <= 0) {
      return res.status(400).json({ error: 'grupo_id inválido' });
    }

    // 2. Validar fecha
    if (!fecha || typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(new Date(fecha).getTime())) {
      return res.status(400).json({ error: 'fecha inválida, formato esperado YYYY-MM-DD' });
    }
    const fechaObj = new Date(fecha + 'T00:00:00');
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (fechaObj > hoy) {
      return res.status(400).json({ error: 'No se puede registrar asistencia para fechas futuras' });
    }

    // 3. Validar registros
    if (!Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({ error: 'registros debe ser un array no vacío' });
    }

    const estadosValidos = ['presente', 'ausente', 'tarde'];

    // 4 y 5. Validar cada registro
    for (let i = 0; i < registros.length; i++) {
      const r = registros[i];
      if (!Number.isInteger(r.estudiante_id) || r.estudiante_id <= 0 || typeof r.estado !== 'string') {
        return res.status(400).json({ error: `registro inválido en posición ${i}` });
      }
      if (!estadosValidos.includes(r.estado)) {
        return res.status(400).json({ error: `estado inválido en posición ${i}` });
      }
    }

    // 6. Validar estudiante_id duplicados
    const ids = registros.map(r => r.estudiante_id);
    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({ error: 'estudiante_id duplicado en la lista' });
    }

    // 7. Verificar grupo
    const grupo = db.prepare('SELECT id, entrenador_id FROM grupos WHERE id = ?').get(grupo_id);
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    // 8-10. Verificar autorización
    if (req.user.rol !== 'admin' && !(req.user.rol === 'entrenador' && grupo.entrenador_id === req.user.id)) {
      return res.status(403).json({ error: 'No tienes permiso para registrar asistencias en este grupo' });
    }

    // 11. Estudiantes activos del grupo
    const estudiantesActivos = db.prepare('SELECT id FROM estudiantes WHERE grupo_id = ? AND activo = 1').all(grupo_id);
    const idsActivos = estudiantesActivos.map(e => e.id);
    const idsEnviados = new Set(ids);

    // 12. Verificar que estén todos
    const faltantes = idsActivos.filter(id => !idsEnviados.has(id));
    if (faltantes.length > 0) {
      return res.status(400).json({ error: 'La lista debe incluir a todos los estudiantes activos del grupo', faltantes });
    }

    // 13. Verificar que no haya extraños
    const idsActivosSet = new Set(idsActivos);
    const extraños = ids.filter(id => !idsActivosSet.has(id));
    if (extraños.length > 0) {
      return res.status(400).json({ error: 'Hay estudiantes en la lista que no pertenecen al grupo', extraños });
    }

    // 14-16. UPSERT transaccional
    const stmt = db.prepare(`
      INSERT INTO asistencias (fecha, grupo_id, estudiante_id, estado, registrado_por)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(estudiante_id, fecha) DO UPDATE SET
        estado = excluded.estado,
        registrado_por = excluded.registrado_por,
        actualizado_en = datetime('now')
    `);

    const transaccion = db.transaction((regs) => {
      for (const r of regs) {
        stmt.run(fecha, grupo_id, r.estudiante_id, r.estado, req.user.id);
      }
    });

    transaccion(registros);

    // 17. Respuesta exitosa
    res.status(201).json({
      ok: true,
      mensaje: 'Asistencias registradas',
      total: registros.length,
      grupo_id,
      fecha
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al registrar asistencias' });
  }
});

router.get('/asistencias', (req, res) => {
  try {
    // 1. Validación de filtros
    let grupo_id, estudiante_id, fecha_desde, fecha_hasta, estado;

    if (req.query.grupo_id !== undefined) {
      grupo_id = Number(req.query.grupo_id);
      if (!Number.isInteger(grupo_id) || grupo_id <= 0) {
        return res.status(400).json({ error: 'grupo_id inválido' });
      }
    }

    if (req.query.estudiante_id !== undefined) {
      estudiante_id = Number(req.query.estudiante_id);
      if (!Number.isInteger(estudiante_id) || estudiante_id <= 0) {
        return res.status(400).json({ error: 'estudiante_id inválido' });
      }
    }

    if (req.query.fecha_desde !== undefined) {
      fecha_desde = req.query.fecha_desde;
      if (typeof fecha_desde !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha_desde) || isNaN(new Date(fecha_desde).getTime())) {
        return res.status(400).json({ error: 'fecha_desde inválida, formato esperado YYYY-MM-DD' });
      }
    }

    if (req.query.fecha_hasta !== undefined) {
      fecha_hasta = req.query.fecha_hasta;
      if (typeof fecha_hasta !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha_hasta) || isNaN(new Date(fecha_hasta).getTime())) {
        return res.status(400).json({ error: 'fecha_hasta inválida, formato esperado YYYY-MM-DD' });
      }
    }

    if (fecha_desde !== undefined && fecha_hasta !== undefined && fecha_desde > fecha_hasta) {
      return res.status(400).json({ error: 'fecha_desde no puede ser mayor que fecha_hasta' });
    }

    const estadosValidos = ['presente', 'ausente', 'tarde'];
    if (req.query.estado !== undefined) {
      estado = req.query.estado;
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ error: 'estado inválido' });
      }
    }

    // 2. Autorización explícita para entrenadores
    if (req.user.rol === 'entrenador') {
      if (grupo_id !== undefined) {
        const grupo = db.prepare('SELECT id, entrenador_id FROM grupos WHERE id = ?').get(grupo_id);
        if (!grupo) {
          return res.status(404).json({ error: 'Grupo no encontrado' });
        }
        if (grupo.entrenador_id !== req.user.id) {
          return res.status(403).json({ error: 'No tienes permiso para ver asistencias de este grupo' });
        }
      }

      if (estudiante_id !== undefined) {
        const estudiante = db.prepare(`
          SELECT estudiantes.id, grupos.entrenador_id
          FROM estudiantes
          INNER JOIN grupos ON estudiantes.grupo_id = grupos.id
          WHERE estudiantes.id = ?
        `).get(estudiante_id);
        if (!estudiante) {
          return res.status(404).json({ error: 'Estudiante no encontrado' });
        }
        if (estudiante.entrenador_id !== req.user.id) {
          return res.status(403).json({ error: 'No tienes permiso para ver asistencias de este estudiante' });
        }
      }
    }

    // 3. Construcción dinámica de la query SQL
    let sql = `
      SELECT
        asistencias.id,
        asistencias.fecha,
        asistencias.grupo_id,
        asistencias.estudiante_id,
        asistencias.estado,
        asistencias.registrado_por,
        asistencias.creado_en,
        asistencias.actualizado_en,
        estudiantes.nombre_completo AS estudiante_nombre,
        grupos.nombre AS grupo_nombre,
        usuarios.nombre AS registrado_por_nombre
      FROM asistencias
      INNER JOIN estudiantes ON asistencias.estudiante_id = estudiantes.id
      INNER JOIN grupos ON asistencias.grupo_id = grupos.id
      INNER JOIN usuarios ON asistencias.registrado_por = usuarios.id
    `;

    const condiciones = [];
    const parametros = [];

    if (grupo_id !== undefined) {
      condiciones.push('asistencias.grupo_id = ?');
      parametros.push(grupo_id);
    }
    if (estudiante_id !== undefined) {
      condiciones.push('asistencias.estudiante_id = ?');
      parametros.push(estudiante_id);
    }
    if (fecha_desde !== undefined) {
      condiciones.push('asistencias.fecha >= ?');
      parametros.push(fecha_desde);
    }
    if (fecha_hasta !== undefined) {
      condiciones.push('asistencias.fecha <= ?');
      parametros.push(fecha_hasta);
    }
    if (estado !== undefined) {
      condiciones.push('asistencias.estado = ?');
      parametros.push(estado);
    }

    if (req.user.rol === 'entrenador') {
      condiciones.push('asistencias.grupo_id IN (SELECT id FROM grupos WHERE entrenador_id = ?)');
      parametros.push(req.user.id);
    }

    // 4. Ensamblar y ejecutar
    if (condiciones.length > 0) {
      sql += ' WHERE ' + condiciones.join(' AND ');
    }
    sql += ' ORDER BY asistencias.fecha DESC, asistencias.estudiante_id ASC LIMIT 501';

    // 5. Respuesta
    const filas = db.prepare(sql).all(...parametros);
    const truncado = filas.length > 500;
    const asistencias = truncado ? filas.slice(0, 500) : filas;

    res.json({
      total: asistencias.length,
      truncado,
      asistencias
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener asistencias' });
  }
});

router.post('/estudiantes', soloAdmin, (req, res) => {
  try {
    const { nombre_completo, grado, grupo_id } = req.body;

    if (!nombre_completo || typeof nombre_completo !== 'string' || nombre_completo.trim() === '') {
      return res.status(400).json({ error: 'nombre_completo es obligatorio' });
    }
    if (!grado || typeof grado !== 'string' || grado.trim() === '') {
      return res.status(400).json({ error: 'grado es obligatorio' });
    }
    if (!Number.isInteger(grupo_id) || grupo_id <= 0) {
      return res.status(400).json({ error: 'grupo_id inválido' });
    }

    const grupo = db.prepare('SELECT id FROM grupos WHERE id = ?').get(grupo_id);
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const { lastInsertRowid: nuevoId } = db.prepare(
      'INSERT INTO estudiantes (nombre_completo, grado, grupo_id, activo) VALUES (?, ?, ?, 1)'
    ).run(nombre_completo.trim(), grado.trim(), grupo_id);

    const estudiante = db.prepare('SELECT * FROM estudiantes WHERE id = ?').get(nuevoId);

    res.status(201).json({
      ok: true,
      mensaje: 'Estudiante creado',
      estudiante
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear el estudiante' });
  }
});

router.put('/estudiantes/:id', soloAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const existe = db.prepare('SELECT id FROM estudiantes WHERE id = ?').get(id);
    if (!existe) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }

    const { nombre_completo, grado, grupo_id } = req.body;

    if (!nombre_completo || typeof nombre_completo !== 'string' || nombre_completo.trim() === '') {
      return res.status(400).json({ error: 'nombre_completo es obligatorio' });
    }
    if (!grado || typeof grado !== 'string' || grado.trim() === '') {
      return res.status(400).json({ error: 'grado es obligatorio' });
    }
    if (!Number.isInteger(grupo_id) || grupo_id <= 0) {
      return res.status(400).json({ error: 'grupo_id inválido' });
    }

    const grupo = db.prepare('SELECT id FROM grupos WHERE id = ?').get(grupo_id);
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    db.prepare('UPDATE estudiantes SET nombre_completo = ?, grado = ?, grupo_id = ? WHERE id = ?')
      .run(nombre_completo.trim(), grado.trim(), grupo_id, id);

    const estudiante = db.prepare('SELECT * FROM estudiantes WHERE id = ?').get(id);

    res.json({
      ok: true,
      mensaje: 'Estudiante actualizado',
      estudiante
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar el estudiante' });
  }
});

router.delete('/estudiantes/:id', soloAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const estudiante = db.prepare('SELECT id, activo FROM estudiantes WHERE id = ?').get(id);
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }

    db.prepare('UPDATE estudiantes SET activo = 0 WHERE id = ?').run(id);

    const mensaje = estudiante.activo === 1
      ? 'Estudiante desactivado'
      : 'El estudiante ya estaba desactivado';

    res.json({ ok: true, mensaje, id });
  } catch (err) {
    res.status(500).json({ error: 'Error al desactivar el estudiante' });
  }
});

router.put('/estudiantes/:id/reactivar', soloAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const estudiante = db.prepare('SELECT id, activo FROM estudiantes WHERE id = ?').get(id);
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }

    db.prepare('UPDATE estudiantes SET activo = 1 WHERE id = ?').run(id);

    const mensaje = estudiante.activo === 0
      ? 'Estudiante reactivado'
      : 'El estudiante ya estaba activo';

    res.json({ ok: true, mensaje, id });
  } catch (err) {
    res.status(500).json({ error: 'Error al reactivar el estudiante' });
  }
});

router.post('/grupos', soloAdmin, (req, res) => {
  try {
    const { nombre, actividad, entrenador_id, horario, lugar } = req.body;

    if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
      return res.status(400).json({ error: 'nombre es obligatorio' });
    }
    if (!actividad || typeof actividad !== 'string' || actividad.trim() === '') {
      return res.status(400).json({ error: 'actividad es obligatoria' });
    }
    if (!Number.isInteger(entrenador_id) || entrenador_id <= 0) {
      return res.status(400).json({ error: 'entrenador_id inválido' });
    }
    if (horario !== undefined && horario !== null && typeof horario !== 'string') {
      return res.status(400).json({ error: 'horario debe ser string' });
    }
    if (lugar !== undefined && lugar !== null && typeof lugar !== 'string') {
      return res.status(400).json({ error: 'lugar debe ser string' });
    }

    const entrenador = db.prepare('SELECT id FROM usuarios WHERE id = ? AND rol = ?').get(entrenador_id, 'entrenador');
    if (!entrenador) {
      return res.status(404).json({ error: 'Entrenador no encontrado o usuario no es entrenador' });
    }

    const { lastInsertRowid: nuevoId } = db.prepare(
      'INSERT INTO grupos (nombre, actividad, entrenador_id, horario, lugar) VALUES (?, ?, ?, ?, ?)'
    ).run(nombre.trim(), actividad.trim(), entrenador_id, horario ?? null, lugar ?? null);

    const grupo = db.prepare('SELECT * FROM grupos WHERE id = ?').get(nuevoId);

    res.status(201).json({ ok: true, mensaje: 'Grupo creado', grupo });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear el grupo' });
  }
});

router.put('/grupos/:id', soloAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const existe = db.prepare('SELECT id FROM grupos WHERE id = ?').get(id);
    if (!existe) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const { nombre, actividad, entrenador_id, horario, lugar } = req.body;

    if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
      return res.status(400).json({ error: 'nombre es obligatorio' });
    }
    if (!actividad || typeof actividad !== 'string' || actividad.trim() === '') {
      return res.status(400).json({ error: 'actividad es obligatoria' });
    }
    if (!Number.isInteger(entrenador_id) || entrenador_id <= 0) {
      return res.status(400).json({ error: 'entrenador_id inválido' });
    }
    if (horario !== undefined && horario !== null && typeof horario !== 'string') {
      return res.status(400).json({ error: 'horario debe ser string' });
    }
    if (lugar !== undefined && lugar !== null && typeof lugar !== 'string') {
      return res.status(400).json({ error: 'lugar debe ser string' });
    }

    const entrenador = db.prepare('SELECT id FROM usuarios WHERE id = ? AND rol = ?').get(entrenador_id, 'entrenador');
    if (!entrenador) {
      return res.status(404).json({ error: 'Entrenador no encontrado o usuario no es entrenador' });
    }

    db.prepare('UPDATE grupos SET nombre = ?, actividad = ?, entrenador_id = ?, horario = ?, lugar = ? WHERE id = ?')
      .run(nombre.trim(), actividad.trim(), entrenador_id, horario ?? null, lugar ?? null, id);

    const grupo = db.prepare('SELECT * FROM grupos WHERE id = ?').get(id);

    res.json({ ok: true, mensaje: 'Grupo actualizado', grupo });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar el grupo' });
  }
});

router.delete('/grupos/:id', soloAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const grupo = db.prepare('SELECT id, activo FROM grupos WHERE id = ?').get(id);
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const { total } = db.prepare(
      'SELECT COUNT(*) as total FROM estudiantes WHERE grupo_id = ? AND activo = 1'
    ).get(id);
    if (total > 0) {
      return res.status(409).json({
        error: 'No se puede desactivar un grupo con estudiantes activos. Reasigna o desactiva a los estudiantes primero.',
        estudiantes_activos: total
      });
    }

    db.prepare('UPDATE grupos SET activo = 0 WHERE id = ?').run(id);

    const mensaje = grupo.activo === 1 ? 'Grupo desactivado' : 'El grupo ya estaba desactivado';
    res.json({ ok: true, mensaje, id });
  } catch (err) {
    res.status(500).json({ error: 'Error al desactivar el grupo' });
  }
});

router.get('/entrenadores', soloAdmin, (req, res) => {
  try {
    const incluirInactivos = req.query.incluir_inactivos === 'true';
    const sql = incluirInactivos
      ? "SELECT id, nombre, usuario, rol, activo, creado_en FROM usuarios WHERE rol = 'entrenador' ORDER BY nombre"
      : "SELECT id, nombre, usuario, rol, activo, creado_en FROM usuarios WHERE rol = 'entrenador' AND activo = 1 ORDER BY nombre";
    const entrenadores = db.prepare(sql).all();
    res.json(entrenadores);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener los entrenadores' });
  }
});

router.post('/entrenadores', soloAdmin, async (req, res) => {
  try {
    const { nombre, usuario, contraseña } = req.body;

    if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
      return res.status(400).json({ error: 'nombre es obligatorio' });
    }
    if (!usuario || typeof usuario !== 'string' || usuario.trim() === '') {
      return res.status(400).json({ error: 'usuario es obligatorio' });
    }
    if (!contraseña || typeof contraseña !== 'string' || contraseña.length < 6) {
      return res.status(400).json({ error: 'contraseña debe tener al menos 6 caracteres' });
    }

    const existe = db.prepare('SELECT id FROM usuarios WHERE usuario = ?').get(usuario.trim());
    if (existe) {
      return res.status(409).json({ error: 'El nombre de usuario ya está en uso' });
    }

    const password_hash = await bcrypt.hash(contraseña, 10);

    const { lastInsertRowid: nuevoId } = db.prepare(
      "INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES (?, ?, ?, 'entrenador')"
    ).run(nombre.trim(), usuario.trim(), password_hash);

    const entrenador = db.prepare(
      'SELECT id, nombre, usuario, rol, creado_en FROM usuarios WHERE id = ?'
    ).get(nuevoId);

    res.status(201).json({ ok: true, mensaje: 'Entrenador creado', entrenador });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear el entrenador' });
  }
});

router.put('/entrenadores/:id', soloAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const existe = db.prepare("SELECT id FROM usuarios WHERE id = ? AND rol = 'entrenador'").get(id);
    if (!existe) {
      return res.status(404).json({ error: 'Entrenador no encontrado' });
    }

    const { nombre, usuario } = req.body;

    if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
      return res.status(400).json({ error: 'nombre es obligatorio' });
    }
    if (!usuario || typeof usuario !== 'string' || usuario.trim() === '') {
      return res.status(400).json({ error: 'usuario es obligatorio' });
    }

    const conflicto = db.prepare('SELECT id FROM usuarios WHERE usuario = ? AND id != ?').get(usuario.trim(), id);
    if (conflicto) {
      return res.status(409).json({ error: 'El nombre de usuario ya está en uso' });
    }

    db.prepare('UPDATE usuarios SET nombre = ?, usuario = ? WHERE id = ?')
      .run(nombre.trim(), usuario.trim(), id);

    const entrenador = db.prepare(
      'SELECT id, nombre, usuario, rol, creado_en FROM usuarios WHERE id = ?'
    ).get(id);

    res.json({ ok: true, mensaje: 'Entrenador actualizado', entrenador });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar el entrenador' });
  }
});

router.put('/entrenadores/:id/password', soloAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const existe = db.prepare("SELECT id FROM usuarios WHERE id = ? AND rol = 'entrenador'").get(id);
    if (!existe) {
      return res.status(404).json({ error: 'Entrenador no encontrado' });
    }

    const { contraseña } = req.body;

    if (!contraseña || typeof contraseña !== 'string' || contraseña.length < 6) {
      return res.status(400).json({ error: 'contraseña debe tener al menos 6 caracteres' });
    }

    const password_hash = await bcrypt.hash(contraseña, 10);
    db.prepare('UPDATE usuarios SET password_hash = ? WHERE id = ?').run(password_hash, id);

    res.json({ ok: true, mensaje: 'Contraseña actualizada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar la contraseña' });
  }
});

router.delete('/entrenadores/:id', soloAdmin, (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const entrenador = db.prepare("SELECT id, activo FROM usuarios WHERE id = ? AND rol = 'entrenador'").get(id);
    if (!entrenador) {
      return res.status(404).json({ error: 'Entrenador no encontrado' });
    }

    const { total } = db.prepare(
      'SELECT COUNT(*) as total FROM grupos WHERE entrenador_id = ? AND activo = 1'
    ).get(id);
    if (total > 0) {
      return res.status(409).json({
        error: 'No se puede desactivar un entrenador con grupos activos asignados. Reasigna sus grupos primero.',
        grupos_activos: total
      });
    }

    db.prepare('UPDATE usuarios SET activo = 0 WHERE id = ?').run(id);

    const mensaje = entrenador.activo === 1 ? 'Entrenador desactivado' : 'El entrenador ya estaba desactivado';
    res.json({ ok: true, mensaje, id });
  } catch (err) {
    res.status(500).json({ error: 'Error al desactivar el entrenador' });
  }
});

module.exports = router;
