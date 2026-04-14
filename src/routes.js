const express = require('express');
const pool = require('./database');
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
    const { rows } = await pool.query('SELECT * FROM usuarios WHERE usuario = $1', [usuario]);
    const usuarioEncontrado = rows[0];
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

router.post('/seed', async (req, res) => {
  try {
    const { main } = require('./seed.js');
    await main();
    res.json({ success: true, message: 'Seed ejecutado correctamente' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.use(verificarToken);

router.get('/grupos', async (req, res) => {
  try {
    const incluirInactivos = req.query.incluir_inactivos === 'true';
    let result;
    if (req.user.rol === 'admin') {
      const sql = incluirInactivos
        ? 'SELECT * FROM grupos ORDER BY nombre'
        : 'SELECT * FROM grupos WHERE activo = 1 ORDER BY nombre';
      result = await pool.query(sql);
    } else {
      const sql = incluirInactivos
        ? 'SELECT * FROM grupos WHERE entrenador_id = $1 ORDER BY nombre'
        : 'SELECT * FROM grupos WHERE entrenador_id = $1 AND activo = 1 ORDER BY nombre';
      result = await pool.query(sql, [req.user.id]);
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener los grupos' });
  }
});

router.get('/grupos/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const incluirInactivos = req.query.incluir_inactivos === 'true';
    const { rows } = await pool.query('SELECT * FROM grupos WHERE id = $1', [id]);
    const grupo = rows[0];
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

router.get('/grupos/:id/estudiantes', async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const { rows: grupoRows } = await pool.query('SELECT id, entrenador_id FROM grupos WHERE id = $1', [id]);
    const grupo = grupoRows[0];
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }
    if (req.user.rol === 'entrenador' && grupo.entrenador_id !== req.user.id) {
      return res.status(403).json({ error: 'No tienes permiso para ver este grupo' });
    }
    const incluirInactivos = req.query.incluir_inactivos === 'true';
    const sqlEstudiantes = incluirInactivos
      ? 'SELECT * FROM estudiantes WHERE grupo_id = $1 ORDER BY nombre_completo'
      : 'SELECT * FROM estudiantes WHERE grupo_id = $1 AND activo = 1 ORDER BY nombre_completo';
    const { rows } = await pool.query(sqlEstudiantes, [id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener los estudiantes del grupo' });
  }
});

router.get('/estudiantes', async (req, res) => {
  try {
    const incluirInactivos = req.query.incluir_inactivos === 'true';
    let result;
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
      result = await pool.query(sql);
    } else {
      const sql = incluirInactivos
        ? `SELECT estudiantes.*, grupos.nombre AS grupo_nombre
           FROM estudiantes
           LEFT JOIN grupos ON estudiantes.grupo_id = grupos.id
           WHERE estudiantes.grupo_id IN (SELECT id FROM grupos WHERE entrenador_id = $1)
           ORDER BY estudiantes.nombre_completo`
        : `SELECT estudiantes.*, grupos.nombre AS grupo_nombre
           FROM estudiantes
           LEFT JOIN grupos ON estudiantes.grupo_id = grupos.id
           WHERE estudiantes.activo = 1
             AND estudiantes.grupo_id IN (SELECT id FROM grupos WHERE entrenador_id = $1)
           ORDER BY estudiantes.nombre_completo`;
      result = await pool.query(sql, [req.user.id]);
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener los estudiantes' });
  }
});

router.get('/estudiantes/:id', async (req, res) => {
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
      WHERE estudiantes.id = $1${incluirInactivos ? '' : ' AND estudiantes.activo = 1'}
    `;
    const { rows } = await pool.query(sql, [id]);
    const estudiante = rows[0];
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }
    if (req.user.rol === 'entrenador') {
      const { rows: permRows } = await pool.query(
        'SELECT 1 FROM grupos WHERE id = $1 AND entrenador_id = $2',
        [estudiante.grupo_id, req.user.id]
      );
      if (!permRows[0]) {
        return res.status(403).json({ error: 'No tienes permiso para ver este estudiante' });
      }
    }
    res.json(estudiante);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener el estudiante' });
  }
});

router.post('/asistencias', async (req, res) => {
  const client = await pool.connect();
  try {
    const { grupo_id, fecha, registros } = req.body;

    if (!Number.isInteger(grupo_id) || grupo_id <= 0) {
      return res.status(400).json({ error: 'grupo_id inválido' });
    }

    if (!fecha || typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha) || isNaN(new Date(fecha).getTime())) {
      return res.status(400).json({ error: 'fecha inválida, formato esperado YYYY-MM-DD' });
    }
    const fechaObj = new Date(fecha + 'T00:00:00');
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    if (fechaObj > hoy) {
      return res.status(400).json({ error: 'No se puede registrar asistencia para fechas futuras' });
    }

    if (!Array.isArray(registros) || registros.length === 0) {
      return res.status(400).json({ error: 'registros debe ser un array no vacío' });
    }

    const estadosValidos = ['presente', 'ausente'];

    for (let i = 0; i < registros.length; i++) {
      const r = registros[i];
      if (!Number.isInteger(r.estudiante_id) || r.estudiante_id <= 0 || typeof r.estado !== 'string') {
        return res.status(400).json({ error: `registro inválido en posición ${i}` });
      }
      if (!estadosValidos.includes(r.estado)) {
        return res.status(400).json({ error: `estado inválido en posición ${i}` });
      }
    }

    const ids = registros.map(r => r.estudiante_id);
    if (new Set(ids).size !== ids.length) {
      return res.status(400).json({ error: 'estudiante_id duplicado en la lista' });
    }

    const { rows: grupoRows } = await pool.query('SELECT id, entrenador_id FROM grupos WHERE id = $1', [grupo_id]);
    const grupo = grupoRows[0];
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    if (req.user.rol !== 'admin' && !(req.user.rol === 'entrenador' && grupo.entrenador_id === req.user.id)) {
      return res.status(403).json({ error: 'No tienes permiso para registrar asistencias en este grupo' });
    }

    const { rows: estudiantesActivos } = await pool.query(
      'SELECT id FROM estudiantes WHERE grupo_id = $1 AND activo = 1',
      [grupo_id]
    );
    const idsActivos = estudiantesActivos.map(e => e.id);
    const idsEnviados = new Set(ids);

    const faltantes = idsActivos.filter(id => !idsEnviados.has(id));
    if (faltantes.length > 0) {
      return res.status(400).json({ error: 'La lista debe incluir a todos los estudiantes activos del grupo', faltantes });
    }

    const idsActivosSet = new Set(idsActivos);
    const extraños = ids.filter(id => !idsActivosSet.has(id));
    if (extraños.length > 0) {
      return res.status(400).json({ error: 'Hay estudiantes en la lista que no pertenecen al grupo', extraños });
    }

    await client.query('BEGIN');
    for (const r of registros) {
      await client.query(`
        INSERT INTO asistencias (fecha, grupo_id, estudiante_id, estado, registrado_por)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (estudiante_id, fecha) DO UPDATE SET
          estado = EXCLUDED.estado,
          registrado_por = EXCLUDED.registrado_por,
          actualizado_en = NOW()::text
      `, [fecha, grupo_id, r.estudiante_id, r.estado, req.user.id]);
    }
    await client.query('COMMIT');

    res.status(201).json({
      ok: true,
      mensaje: 'Asistencias registradas',
      total: registros.length,
      grupo_id,
      fecha
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: 'Error al registrar asistencias' });
  } finally {
    client.release();
  }
});

router.get('/asistencias', async (req, res) => {
  try {
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

    const estadosValidos = ['presente', 'ausente'];
    if (req.query.estado !== undefined) {
      estado = req.query.estado;
      if (!estadosValidos.includes(estado)) {
        return res.status(400).json({ error: 'estado inválido' });
      }
    }

    if (req.user.rol === 'entrenador') {
      if (grupo_id !== undefined) {
        const { rows } = await pool.query('SELECT id, entrenador_id FROM grupos WHERE id = $1', [grupo_id]);
        const grupo = rows[0];
        if (!grupo) {
          return res.status(404).json({ error: 'Grupo no encontrado' });
        }
        if (grupo.entrenador_id !== req.user.id) {
          return res.status(403).json({ error: 'No tienes permiso para ver asistencias de este grupo' });
        }
      }

      if (estudiante_id !== undefined) {
        const { rows } = await pool.query(`
          SELECT estudiantes.id, grupos.entrenador_id
          FROM estudiantes
          INNER JOIN grupos ON estudiantes.grupo_id = grupos.id
          WHERE estudiantes.id = $1
        `, [estudiante_id]);
        const estudiante = rows[0];
        if (!estudiante) {
          return res.status(404).json({ error: 'Estudiante no encontrado' });
        }
        if (estudiante.entrenador_id !== req.user.id) {
          return res.status(403).json({ error: 'No tienes permiso para ver asistencias de este estudiante' });
        }
      }
    }

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
    let paramIndex = 1;

    if (grupo_id !== undefined) {
      condiciones.push(`asistencias.grupo_id = $${paramIndex++}`);
      parametros.push(grupo_id);
    }
    if (estudiante_id !== undefined) {
      condiciones.push(`asistencias.estudiante_id = $${paramIndex++}`);
      parametros.push(estudiante_id);
    }
    if (fecha_desde !== undefined) {
      condiciones.push(`asistencias.fecha >= $${paramIndex++}`);
      parametros.push(fecha_desde);
    }
    if (fecha_hasta !== undefined) {
      condiciones.push(`asistencias.fecha <= $${paramIndex++}`);
      parametros.push(fecha_hasta);
    }
    if (estado !== undefined) {
      condiciones.push(`asistencias.estado = $${paramIndex++}`);
      parametros.push(estado);
    }

    if (req.user.rol === 'entrenador') {
      condiciones.push(`asistencias.grupo_id IN (SELECT id FROM grupos WHERE entrenador_id = $${paramIndex++})`);
      parametros.push(req.user.id);
    }

    if (condiciones.length > 0) {
      sql += ' WHERE ' + condiciones.join(' AND ');
    }
    sql += ' ORDER BY asistencias.fecha DESC, asistencias.estudiante_id ASC LIMIT 501';

    const { rows: filas } = await pool.query(sql, parametros);
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

router.post('/estudiantes', soloAdmin, async (req, res) => {
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

    const { rows: grupoRows } = await pool.query('SELECT id FROM grupos WHERE id = $1', [grupo_id]);
    if (!grupoRows[0]) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const { rows } = await pool.query(
      'INSERT INTO estudiantes (nombre_completo, grado, grupo_id, activo) VALUES ($1, $2, $3, 1) RETURNING *',
      [nombre_completo.trim(), grado.trim(), grupo_id]
    );

    res.status(201).json({
      ok: true,
      mensaje: 'Estudiante creado',
      estudiante: rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear el estudiante' });
  }
});

router.put('/estudiantes/:id', soloAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { rows: existeRows } = await pool.query('SELECT id FROM estudiantes WHERE id = $1', [id]);
    if (!existeRows[0]) {
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

    const { rows: grupoRows } = await pool.query('SELECT id FROM grupos WHERE id = $1', [grupo_id]);
    if (!grupoRows[0]) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const { rows } = await pool.query(
      'UPDATE estudiantes SET nombre_completo = $1, grado = $2, grupo_id = $3 WHERE id = $4 RETURNING *',
      [nombre_completo.trim(), grado.trim(), grupo_id, id]
    );

    res.json({
      ok: true,
      mensaje: 'Estudiante actualizado',
      estudiante: rows[0]
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar el estudiante' });
  }
});

router.delete('/estudiantes/:id', soloAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { rows } = await pool.query('SELECT id, activo FROM estudiantes WHERE id = $1', [id]);
    const estudiante = rows[0];
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }

    await pool.query('UPDATE estudiantes SET activo = 0 WHERE id = $1', [id]);

    const mensaje = estudiante.activo === 1
      ? 'Estudiante desactivado'
      : 'El estudiante ya estaba desactivado';

    res.json({ ok: true, mensaje, id });
  } catch (err) {
    res.status(500).json({ error: 'Error al desactivar el estudiante' });
  }
});

router.put('/estudiantes/:id/reactivar', soloAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { rows } = await pool.query('SELECT id, activo FROM estudiantes WHERE id = $1', [id]);
    const estudiante = rows[0];
    if (!estudiante) {
      return res.status(404).json({ error: 'Estudiante no encontrado' });
    }

    await pool.query('UPDATE estudiantes SET activo = 1 WHERE id = $1', [id]);

    const mensaje = estudiante.activo === 0
      ? 'Estudiante reactivado'
      : 'El estudiante ya estaba activo';

    res.json({ ok: true, mensaje, id });
  } catch (err) {
    res.status(500).json({ error: 'Error al reactivar el estudiante' });
  }
});

router.post('/grupos', soloAdmin, async (req, res) => {
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

    const { rows: entRows } = await pool.query(
      "SELECT id FROM usuarios WHERE id = $1 AND rol = 'entrenador'",
      [entrenador_id]
    );
    if (!entRows[0]) {
      return res.status(404).json({ error: 'Entrenador no encontrado o usuario no es entrenador' });
    }

    const { rows } = await pool.query(
      'INSERT INTO grupos (nombre, actividad, entrenador_id, horario, lugar) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [nombre.trim(), actividad.trim(), entrenador_id, horario ?? null, lugar ?? null]
    );

    res.status(201).json({ ok: true, mensaje: 'Grupo creado', grupo: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear el grupo' });
  }
});

router.put('/grupos/:id', soloAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { rows: existeRows } = await pool.query('SELECT id FROM grupos WHERE id = $1', [id]);
    if (!existeRows[0]) {
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

    const { rows: entRows } = await pool.query(
      "SELECT id FROM usuarios WHERE id = $1 AND rol = 'entrenador'",
      [entrenador_id]
    );
    if (!entRows[0]) {
      return res.status(404).json({ error: 'Entrenador no encontrado o usuario no es entrenador' });
    }

    const { rows } = await pool.query(
      'UPDATE grupos SET nombre = $1, actividad = $2, entrenador_id = $3, horario = $4, lugar = $5 WHERE id = $6 RETURNING *',
      [nombre.trim(), actividad.trim(), entrenador_id, horario ?? null, lugar ?? null, id]
    );

    res.json({ ok: true, mensaje: 'Grupo actualizado', grupo: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar el grupo' });
  }
});

router.delete('/grupos/:id', soloAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { rows: grupoRows } = await pool.query('SELECT id, activo FROM grupos WHERE id = $1', [id]);
    const grupo = grupoRows[0];
    if (!grupo) {
      return res.status(404).json({ error: 'Grupo no encontrado' });
    }

    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*) AS total FROM estudiantes WHERE grupo_id = $1 AND activo = 1',
      [id]
    );
    const total = parseInt(countRows[0].total);
    if (total > 0) {
      return res.status(409).json({
        error: 'No se puede desactivar un grupo con estudiantes activos. Reasigna o desactiva a los estudiantes primero.',
        estudiantes_activos: total
      });
    }

    await pool.query('UPDATE grupos SET activo = 0 WHERE id = $1', [id]);

    const mensaje = grupo.activo === 1 ? 'Grupo desactivado' : 'El grupo ya estaba desactivado';
    res.json({ ok: true, mensaje, id });
  } catch (err) {
    res.status(500).json({ error: 'Error al desactivar el grupo' });
  }
});

router.get('/entrenadores', soloAdmin, async (req, res) => {
  try {
    const incluirInactivos = req.query.incluir_inactivos === 'true';
    const sql = incluirInactivos
      ? "SELECT id, nombre, usuario, rol, activo, creado_en FROM usuarios WHERE rol = 'entrenador' ORDER BY nombre"
      : "SELECT id, nombre, usuario, rol, activo, creado_en FROM usuarios WHERE rol = 'entrenador' AND activo = 1 ORDER BY nombre";
    const { rows } = await pool.query(sql);
    res.json(rows);
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

    const { rows: existeRows } = await pool.query('SELECT id FROM usuarios WHERE usuario = $1', [usuario.trim()]);
    if (existeRows[0]) {
      return res.status(409).json({ error: 'El nombre de usuario ya está en uso' });
    }

    const password_hash = await bcrypt.hash(contraseña, 10);

    const { rows } = await pool.query(
      "INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES ($1, $2, $3, 'entrenador') RETURNING id, nombre, usuario, rol, creado_en",
      [nombre.trim(), usuario.trim(), password_hash]
    );

    res.status(201).json({ ok: true, mensaje: 'Entrenador creado', entrenador: rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear el entrenador' });
  }
});

router.put('/entrenadores/:id', soloAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { rows: existeRows } = await pool.query("SELECT id FROM usuarios WHERE id = $1 AND rol = 'entrenador'", [id]);
    if (!existeRows[0]) {
      return res.status(404).json({ error: 'Entrenador no encontrado' });
    }

    const { nombre, usuario } = req.body;

    if (!nombre || typeof nombre !== 'string' || nombre.trim() === '') {
      return res.status(400).json({ error: 'nombre es obligatorio' });
    }
    if (!usuario || typeof usuario !== 'string' || usuario.trim() === '') {
      return res.status(400).json({ error: 'usuario es obligatorio' });
    }

    const { rows: conflictoRows } = await pool.query(
      'SELECT id FROM usuarios WHERE usuario = $1 AND id != $2',
      [usuario.trim(), id]
    );
    if (conflictoRows[0]) {
      return res.status(409).json({ error: 'El nombre de usuario ya está en uso' });
    }

    const { rows } = await pool.query(
      'UPDATE usuarios SET nombre = $1, usuario = $2 WHERE id = $3 RETURNING id, nombre, usuario, rol, creado_en',
      [nombre.trim(), usuario.trim(), id]
    );

    res.json({ ok: true, mensaje: 'Entrenador actualizado', entrenador: rows[0] });
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

    const { rows: existeRows } = await pool.query("SELECT id FROM usuarios WHERE id = $1 AND rol = 'entrenador'", [id]);
    if (!existeRows[0]) {
      return res.status(404).json({ error: 'Entrenador no encontrado' });
    }

    const { contraseña } = req.body;

    if (!contraseña || typeof contraseña !== 'string' || contraseña.length < 6) {
      return res.status(400).json({ error: 'contraseña debe tener al menos 6 caracteres' });
    }

    const password_hash = await bcrypt.hash(contraseña, 10);
    await pool.query('UPDATE usuarios SET password_hash = $1 WHERE id = $2', [password_hash, id]);

    res.json({ ok: true, mensaje: 'Contraseña actualizada' });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar la contraseña' });
  }
});

router.delete('/entrenadores/:id', soloAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }

    const { rows: entRows } = await pool.query("SELECT id, activo FROM usuarios WHERE id = $1 AND rol = 'entrenador'", [id]);
    const entrenador = entRows[0];
    if (!entrenador) {
      return res.status(404).json({ error: 'Entrenador no encontrado' });
    }

    const { rows: countRows } = await pool.query(
      'SELECT COUNT(*) AS total FROM grupos WHERE entrenador_id = $1 AND activo = 1',
      [id]
    );
    const total = parseInt(countRows[0].total);
    if (total > 0) {
      return res.status(409).json({
        error: 'No se puede desactivar un entrenador con grupos activos asignados. Reasigna sus grupos primero.',
        grupos_activos: total
      });
    }

    await pool.query('UPDATE usuarios SET activo = 0 WHERE id = $1', [id]);

    const mensaje = entrenador.activo === 1 ? 'Entrenador desactivado' : 'El entrenador ya estaba desactivado';
    res.json({ ok: true, mensaje, id });
  } catch (err) {
    res.status(500).json({ error: 'Error al desactivar el entrenador' });
  }
});

module.exports = router;
