// ============ Guard clause: token + rol admin ============
const token = localStorage.getItem('token');
const usuarioJSON = localStorage.getItem('usuario');
if (!token || !usuarioJSON) { window.location.href = '/login.html'; }
const usuario = JSON.parse(usuarioJSON);
if (usuario.rol !== 'admin') { window.location.href = '/dashboard.html'; }

document.getElementById('saludoUsuario').textContent = `Hola, ${usuario.nombre}`;
document.getElementById('btnLogout').addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.location.href = '/login.html';
});

// ============ Estado ============
let tabActual = 'estudiantes';
let datosEstudiantes = [];
let datosGrupos = [];
let datosEntrenadores = [];
let modoModal = 'crear';
let idEditando = null;
let filtroEstudiantes = 'activos';
let filtroGrupo = '';
let filtroGrado = '';

// ============ Helper: fetch autenticado ============
async function api(ruta, opciones = {}) {
  const resp = await fetch(ruta, {
    ...opciones,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + token,
      ...(opciones.headers || {})
    }
  });
  if (resp.status === 401) {
    localStorage.removeItem('token');
    localStorage.removeItem('usuario');
    window.location.href = '/login.html';
    throw new Error('token_expirado');
  }
  return resp;
}

// ============ Helper: mensaje global ============
function mostrarMensaje(texto, tipo = 'exito') {
  const el = document.getElementById('mensajeGlobal');
  el.textContent = texto;
  el.style.color = tipo === 'exito'
    ? 'var(--pico-color-green-500)'
    : 'var(--pico-color-red-500)';
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

// ============ Tabs ============
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    tabActual = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('activo'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('activo'));
    btn.classList.add('activo');
    document.getElementById(`panel-${tabActual}`).classList.add('activo');
  });
});

// ============ Cerrar modales ============
['Estudiante', 'Grupo', 'Entrenador', 'Password'].forEach(nombre => {
  document.getElementById(`cerrarModal${nombre}`).addEventListener('click', () => {
    document.getElementById(`modal${nombre}`).close();
  });
  document.getElementById(`cancelarModal${nombre}`).addEventListener('click', () => {
    document.getElementById(`modal${nombre}`).close();
  });
});

// ============================================================
// ESTUDIANTES
// ============================================================
async function cargarEstudiantes() {
  const contenedor = document.getElementById('tablaEstudiantes');
  contenedor.setAttribute('aria-busy', 'true');
  contenedor.textContent = 'Cargando...';
  try {
    const resp = await api('/api/estudiantes?incluir_inactivos=true');
    const datos = await resp.json();
    if (!resp.ok) throw new Error(datos.error || 'Error al cargar');
    datosEstudiantes = datos;
    poblarFiltrosEstudiantes();
    renderEstudiantes();
  } catch (err) {
    if (err.message === 'token_expirado') return;
    contenedor.removeAttribute('aria-busy');
    contenedor.innerHTML = `<p style="color:var(--pico-color-red-500)">${err.message}</p>`;
  }
}

function poblarFiltrosEstudiantes() {
  // Grados únicos ordenados alfabéticamente
  const grados = [...new Set(datosEstudiantes.map(e => e.grado))].sort();
  const selectGrado = document.getElementById('filtroGrado');
  const gradoActual = selectGrado.value;
  selectGrado.innerHTML = '<option value="">Todos los grados</option>' +
    grados.map(g => `<option value="${g}">${g}</option>`).join('');
  selectGrado.value = gradoActual;

  // Grupos únicos que aparecen en los estudiantes cargados
  const gruposMap = new Map();
  datosEstudiantes.forEach(e => {
    if (e.grupo_id && e.grupo_nombre) gruposMap.set(e.grupo_id, e.grupo_nombre);
  });
  const selectGrupo = document.getElementById('filtroGrupo');
  const grupoActual = selectGrupo.value;
  selectGrupo.innerHTML = '<option value="">Todos los grupos</option>' +
    [...gruposMap.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([id, nombre]) => `<option value="${id}">${nombre}</option>`).join('');
  selectGrupo.value = grupoActual;
}

function renderEstudiantes() {
  const contenedor = document.getElementById('tablaEstudiantes');
  contenedor.removeAttribute('aria-busy');

  const visibles = datosEstudiantes.filter(e => {
    if (filtroEstudiantes === 'activos' && e.activo !== 1) return false;
    if (filtroEstudiantes === 'inactivos' && e.activo !== 0) return false;
    if (filtroGrupo && e.grupo_id !== Number(filtroGrupo)) return false;
    if (filtroGrado && e.grado !== filtroGrado) return false;
    return true;
  });

  if (visibles.length === 0) {
    const mensajes = { activos: 'No hay estudiantes activos.', inactivos: 'No hay estudiantes inactivos.', todos: 'No hay estudiantes.' };
    contenedor.innerHTML = `<p><em>${mensajes[filtroEstudiantes]}</em></p>`;
    return;
  }

  contenedor.innerHTML = `
    <figure><table>
      <thead><tr>
        <th>Nombre</th><th>Grado</th><th>Grupo</th><th>Estado</th><th>Acciones</th>
      </tr></thead>
      <tbody>
        ${visibles.map(e => `
          <tr>
            <td>${e.nombre_completo}</td>
            <td>${e.grado}</td>
            <td>${e.grupo_nombre || '—'}</td>
            <td>${e.activo ? 'Activo' : '<em>Inactivo</em>'}</td>
            <td class="acciones">
              <button class="outline" onclick="abrirEditarEstudiante(${e.id})">Editar</button>
              ${e.activo
                ? `<button class="secondary outline" onclick="desactivarEstudiante(${e.id})">Desactivar</button>`
                : `<button class="outline" onclick="reactivarEstudiante(${e.id})">Reactivar</button>`
              }
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table></figure>
  `;
}

async function abrirCrearEstudiante() {
  modoModal = 'crear';
  idEditando = null;
  document.getElementById('tituloModalEstudiante').textContent = 'Nuevo estudiante';
  document.getElementById('est-nombre').value = '';
  document.getElementById('est-grado').value = '';
  await poblarSelect('est-grupo', '/api/grupos', g => ({ value: g.id, label: g.nombre }));
  document.getElementById('est-grupo').value = '';
  document.getElementById('modalEstudiante').showModal();
}

async function abrirEditarEstudiante(id) {
  modoModal = 'editar';
  idEditando = id;
  const est = datosEstudiantes.find(e => e.id === id);
  document.getElementById('tituloModalEstudiante').textContent = 'Editar estudiante';
  document.getElementById('est-nombre').value = est.nombre_completo;
  document.getElementById('est-grado').value = est.grado;
  await poblarSelect('est-grupo', '/api/grupos', g => ({ value: g.id, label: g.nombre }));
  document.getElementById('est-grupo').value = est.grupo_id;
  document.getElementById('modalEstudiante').showModal();
}

async function desactivarEstudiante(id) {
  const est = datosEstudiantes.find(e => e.id === id);
  if (!confirm(`¿Desactivar a "${est.nombre_completo}"?`)) return;
  try {
    const resp = await api(`/api/estudiantes/${id}`, { method: 'DELETE' });
    const datos = await resp.json();
    if (!resp.ok) { mostrarMensaje(datos.error || 'Error al desactivar', 'error'); return; }
    mostrarMensaje(datos.mensaje);
    cargarEstudiantes();
  } catch (err) {
    if (err.message !== 'token_expirado') mostrarMensaje('Error de conexión', 'error');
  }
}

document.getElementById('formEstudiante').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    nombre_completo: document.getElementById('est-nombre').value.trim(),
    grado: document.getElementById('est-grado').value.trim(),
    grupo_id: Number(document.getElementById('est-grupo').value)
  };
  try {
    const ruta = modoModal === 'crear' ? '/api/estudiantes' : `/api/estudiantes/${idEditando}`;
    const metodo = modoModal === 'crear' ? 'POST' : 'PUT';
    const resp = await api(ruta, { method: metodo, body: JSON.stringify(body) });
    const datos = await resp.json();
    if (!resp.ok) { mostrarMensaje(datos.error || 'Error al guardar', 'error'); return; }
    document.getElementById('modalEstudiante').close();
    mostrarMensaje(datos.mensaje);
    cargarEstudiantes();
  } catch (err) {
    if (err.message !== 'token_expirado') mostrarMensaje('Error de conexión', 'error');
  }
});

async function reactivarEstudiante(id) {
  const est = datosEstudiantes.find(e => e.id === id);
  if (!confirm(`¿Reactivar a "${est.nombre_completo}"?`)) return;
  try {
    const resp = await api(`/api/estudiantes/${id}/reactivar`, { method: 'PUT' });
    const datos = await resp.json();
    if (!resp.ok) { mostrarMensaje(datos.error || 'Error al reactivar', 'error'); return; }
    mostrarMensaje(datos.mensaje);
    cargarEstudiantes();
  } catch (err) {
    if (err.message !== 'token_expirado') mostrarMensaje('Error de conexión', 'error');
  }
}

document.getElementById('filtroEstudiantes').addEventListener('change', (e) => {
  filtroEstudiantes = e.target.value;
  renderEstudiantes();
});
document.getElementById('filtroGrupo').addEventListener('change', (e) => {
  filtroGrupo = e.target.value;
  renderEstudiantes();
});
document.getElementById('filtroGrado').addEventListener('change', (e) => {
  filtroGrado = e.target.value;
  renderEstudiantes();
});

document.getElementById('btnCrearEstudiante').addEventListener('click', abrirCrearEstudiante);

// ============================================================
// GRUPOS
// ============================================================
async function cargarGrupos() {
  const contenedor = document.getElementById('tablaGrupos');
  contenedor.setAttribute('aria-busy', 'true');
  contenedor.textContent = 'Cargando...';
  try {
    const resp = await api('/api/grupos?incluir_inactivos=true');
    const datos = await resp.json();
    if (!resp.ok) throw new Error(datos.error || 'Error al cargar');
    datosGrupos = datos;
    poblarSelectReporteGrupos();
    renderGrupos();
  } catch (err) {
    if (err.message === 'token_expirado') return;
    contenedor.removeAttribute('aria-busy');
    contenedor.innerHTML = `<p style="color:var(--pico-color-red-500)">${err.message}</p>`;
  }
}

function renderGrupos() {
  const contenedor = document.getElementById('tablaGrupos');
  contenedor.removeAttribute('aria-busy');
  if (datosGrupos.length === 0) {
    contenedor.innerHTML = '<p><em>No hay grupos.</em></p>';
    return;
  }
  contenedor.innerHTML = `
    <figure><table>
      <thead><tr>
        <th>Nombre</th><th>Actividad</th><th>Horario</th><th>Lugar</th><th>Estado</th><th>Acciones</th>
      </tr></thead>
      <tbody>
        ${datosGrupos.map(g => `
          <tr>
            <td>${g.nombre}</td>
            <td>${g.actividad}</td>
            <td>${g.horario || '—'}</td>
            <td>${g.lugar || '—'}</td>
            <td>${g.activo ? 'Activo' : '<em>Inactivo</em>'}</td>
            <td class="acciones">
              <button class="outline" onclick="abrirEditarGrupo(${g.id})">Editar</button>
              ${g.activo ? `<button class="secondary outline" onclick="desactivarGrupo(${g.id})">Desactivar</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table></figure>
  `;
}

async function abrirCrearGrupo() {
  modoModal = 'crear';
  idEditando = null;
  document.getElementById('tituloModalGrupo').textContent = 'Nuevo grupo';
  document.getElementById('grp-nombre').value = '';
  document.getElementById('grp-actividad').value = '';
  document.getElementById('grp-horario').value = '';
  document.getElementById('grp-lugar').value = '';
  await poblarSelect('grp-entrenador', '/api/entrenadores', e => ({ value: e.id, label: e.nombre }));
  document.getElementById('grp-entrenador').value = '';
  document.getElementById('modalGrupo').showModal();
}

async function abrirEditarGrupo(id) {
  modoModal = 'editar';
  idEditando = id;
  const grp = datosGrupos.find(g => g.id === id);
  document.getElementById('tituloModalGrupo').textContent = 'Editar grupo';
  document.getElementById('grp-nombre').value = grp.nombre;
  document.getElementById('grp-actividad').value = grp.actividad;
  document.getElementById('grp-horario').value = grp.horario || '';
  document.getElementById('grp-lugar').value = grp.lugar || '';
  await poblarSelect('grp-entrenador', '/api/entrenadores', e => ({ value: e.id, label: e.nombre }));
  document.getElementById('grp-entrenador').value = grp.entrenador_id;
  document.getElementById('modalGrupo').showModal();
}

async function desactivarGrupo(id) {
  const grp = datosGrupos.find(g => g.id === id);
  if (!confirm(`¿Desactivar el grupo "${grp.nombre}"?`)) return;
  try {
    const resp = await api(`/api/grupos/${id}`, { method: 'DELETE' });
    const datos = await resp.json();
    if (!resp.ok) { mostrarMensaje(datos.error || 'Error al desactivar', 'error'); return; }
    mostrarMensaje(datos.mensaje);
    cargarGrupos();
  } catch (err) {
    if (err.message !== 'token_expirado') mostrarMensaje('Error de conexión', 'error');
  }
}

document.getElementById('formGrupo').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = {
    nombre: document.getElementById('grp-nombre').value.trim(),
    actividad: document.getElementById('grp-actividad').value.trim(),
    entrenador_id: Number(document.getElementById('grp-entrenador').value),
    horario: document.getElementById('grp-horario').value.trim() || null,
    lugar: document.getElementById('grp-lugar').value.trim() || null
  };
  try {
    const ruta = modoModal === 'crear' ? '/api/grupos' : `/api/grupos/${idEditando}`;
    const metodo = modoModal === 'crear' ? 'POST' : 'PUT';
    const resp = await api(ruta, { method: metodo, body: JSON.stringify(body) });
    const datos = await resp.json();
    if (!resp.ok) { mostrarMensaje(datos.error || 'Error al guardar', 'error'); return; }
    document.getElementById('modalGrupo').close();
    mostrarMensaje(datos.mensaje);
    cargarGrupos();
  } catch (err) {
    if (err.message !== 'token_expirado') mostrarMensaje('Error de conexión', 'error');
  }
});

document.getElementById('btnCrearGrupo').addEventListener('click', abrirCrearGrupo);

// ============================================================
// ENTRENADORES
// ============================================================
async function cargarEntrenadores() {
  const contenedor = document.getElementById('tablaEntrenadores');
  contenedor.setAttribute('aria-busy', 'true');
  contenedor.textContent = 'Cargando...';
  try {
    const resp = await api('/api/entrenadores?incluir_inactivos=true');
    const datos = await resp.json();
    if (!resp.ok) throw new Error(datos.error || 'Error al cargar');
    datosEntrenadores = datos;
    renderEntrenadores();
  } catch (err) {
    if (err.message === 'token_expirado') return;
    contenedor.removeAttribute('aria-busy');
    contenedor.innerHTML = `<p style="color:var(--pico-color-red-500)">${err.message}</p>`;
  }
}

function renderEntrenadores() {
  const contenedor = document.getElementById('tablaEntrenadores');
  contenedor.removeAttribute('aria-busy');
  if (datosEntrenadores.length === 0) {
    contenedor.innerHTML = '<p><em>No hay entrenadores.</em></p>';
    return;
  }
  contenedor.innerHTML = `
    <figure><table>
      <thead><tr>
        <th>Nombre</th><th>Usuario</th><th>Estado</th><th>Acciones</th>
      </tr></thead>
      <tbody>
        ${datosEntrenadores.map(ent => `
          <tr>
            <td>${ent.nombre}</td>
            <td>${ent.usuario}</td>
            <td>${ent.activo ? 'Activo' : '<em>Inactivo</em>'}</td>
            <td class="acciones">
              <button class="outline" onclick="abrirEditarEntrenador(${ent.id})">Editar</button>
              <button class="outline" onclick="abrirCambiarPassword(${ent.id})">Contraseña</button>
              ${ent.activo ? `<button class="secondary outline" onclick="desactivarEntrenador(${ent.id})">Desactivar</button>` : ''}
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table></figure>
  `;
}

function abrirCrearEntrenador() {
  modoModal = 'crear';
  idEditando = null;
  document.getElementById('tituloModalEntrenador').textContent = 'Nuevo entrenador';
  document.getElementById('ent-nombre').value = '';
  document.getElementById('ent-usuario').value = '';
  document.getElementById('ent-password').value = '';
  document.getElementById('ent-password').required = true;
  document.getElementById('ent-campo-password').style.display = 'block';
  document.getElementById('modalEntrenador').showModal();
}

function abrirEditarEntrenador(id) {
  modoModal = 'editar';
  idEditando = id;
  const ent = datosEntrenadores.find(e => e.id === id);
  document.getElementById('tituloModalEntrenador').textContent = 'Editar entrenador';
  document.getElementById('ent-nombre').value = ent.nombre;
  document.getElementById('ent-usuario').value = ent.usuario;
  document.getElementById('ent-password').required = false;
  document.getElementById('ent-campo-password').style.display = 'none';
  document.getElementById('modalEntrenador').showModal();
}

async function desactivarEntrenador(id) {
  const ent = datosEntrenadores.find(e => e.id === id);
  if (!confirm(`¿Desactivar al entrenador "${ent.nombre}"?`)) return;
  try {
    const resp = await api(`/api/entrenadores/${id}`, { method: 'DELETE' });
    const datos = await resp.json();
    if (!resp.ok) { mostrarMensaje(datos.error || 'Error al desactivar', 'error'); return; }
    mostrarMensaje(datos.mensaje);
    cargarEntrenadores();
  } catch (err) {
    if (err.message !== 'token_expirado') mostrarMensaje('Error de conexión', 'error');
  }
}

document.getElementById('formEntrenador').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = modoModal === 'crear'
    ? {
        nombre: document.getElementById('ent-nombre').value.trim(),
        usuario: document.getElementById('ent-usuario').value.trim(),
        contraseña: document.getElementById('ent-password').value
      }
    : {
        nombre: document.getElementById('ent-nombre').value.trim(),
        usuario: document.getElementById('ent-usuario').value.trim()
      };
  try {
    const ruta = modoModal === 'crear' ? '/api/entrenadores' : `/api/entrenadores/${idEditando}`;
    const metodo = modoModal === 'crear' ? 'POST' : 'PUT';
    const resp = await api(ruta, { method: metodo, body: JSON.stringify(body) });
    const datos = await resp.json();
    if (!resp.ok) { mostrarMensaje(datos.error || 'Error al guardar', 'error'); return; }
    document.getElementById('modalEntrenador').close();
    mostrarMensaje(datos.mensaje);
    cargarEntrenadores();
  } catch (err) {
    if (err.message !== 'token_expirado') mostrarMensaje('Error de conexión', 'error');
  }
});

document.getElementById('btnCrearEntrenador').addEventListener('click', abrirCrearEntrenador);

// ============================================================
// CAMBIAR CONTRASEÑA
// ============================================================
function abrirCambiarPassword(id) {
  idEditando = id;
  document.getElementById('pwd-nueva').value = '';
  document.getElementById('modalPassword').showModal();
}

document.getElementById('formPassword').addEventListener('submit', async (e) => {
  e.preventDefault();
  const body = { contraseña: document.getElementById('pwd-nueva').value };
  try {
    const resp = await api(`/api/entrenadores/${idEditando}/password`, { method: 'PUT', body: JSON.stringify(body) });
    const datos = await resp.json();
    if (!resp.ok) { mostrarMensaje(datos.error || 'Error al cambiar contraseña', 'error'); return; }
    document.getElementById('modalPassword').close();
    mostrarMensaje(datos.mensaje);
  } catch (err) {
    if (err.message !== 'token_expirado') mostrarMensaje('Error de conexión', 'error');
  }
});

// ============================================================
// HELPER: poblar <select> genérico
// ============================================================
async function poblarSelect(selectId, ruta, mapper) {
  const select = document.getElementById(selectId);
  select.innerHTML = '<option value="">Cargando...</option>';
  try {
    const resp = await api(ruta);
    const items = await resp.json();
    select.innerHTML = items.map(item => {
      const { value, label } = mapper(item);
      return `<option value="${value}">${label}</option>`;
    }).join('');
  } catch (err) {
    select.innerHTML = '<option value="">Error al cargar</option>';
  }
}

// ============================================================
// REPORTES
// ============================================================
function poblarSelectReporteGrupos() {
  const select = document.getElementById('rep-grupo');
  const actual = select.value;
  select.innerHTML = '<option value="">Todos los grupos</option>' +
    datosGrupos
      .filter(g => g.activo === 1)
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
      .map(g => `<option value="${g.id}">${g.nombre}</option>`)
      .join('');
  select.value = actual;
}

const ETIQUETAS_ESTADO = {
  presente: { label: 'Presente', color: 'var(--pico-color-green-500)'  },
  ausente:  { label: 'Ausente',  color: 'var(--pico-color-red-500)'    },
  tarde:    { label: 'Tarde',    color: 'var(--pico-color-orange-500)' }
};

let ultimasAsistenciasAdmin = [];

document.getElementById('formReporte').addEventListener('submit', async (e) => {
  e.preventDefault();

  const grupoId   = document.getElementById('rep-grupo').value;
  const desde     = document.getElementById('rep-desde').value;
  const hasta     = document.getElementById('rep-hasta').value;
  const btnBuscar = document.getElementById('btnBuscarReporte');
  const resultado = document.getElementById('resultadoReporte');
  const resumen   = document.getElementById('resumenReporte');
  const seccionPct = document.getElementById('seccionPorcentajesAdmin');

  resultado.innerHTML = '';
  resumen.style.display = 'none';
  seccionPct.style.display = 'none';
  ultimasAsistenciasAdmin = [];

  const qs = new URLSearchParams();
  if (grupoId) qs.set('grupo_id',    grupoId);
  if (desde)   qs.set('fecha_desde', desde);
  if (hasta)   qs.set('fecha_hasta', hasta);

  btnBuscar.setAttribute('aria-busy', 'true');
  btnBuscar.disabled = true;
  resultado.innerHTML = '<p>Buscando...</p>';

  try {
    const resp = await api(`/api/asistencias?${qs.toString()}`);
    const datos = await resp.json();

    if (!resp.ok) {
      resultado.innerHTML = `<p style="color:var(--pico-color-red-500)">${datos.error || 'Error al obtener el reporte'}</p>`;
      return;
    }

    const { asistencias, total, truncado } = datos;
    ultimasAsistenciasAdmin = asistencias;

    if (total === 0) {
      resultado.innerHTML = '<p><em>No hay registros para los filtros seleccionados.</em></p>';
      return;
    }

    // Resumen
    const conteo = { presente: 0, ausente: 0, tarde: 0 };
    asistencias.forEach(a => { if (conteo[a.estado] !== undefined) conteo[a.estado]++; });
    document.getElementById('rep-total').textContent     = `Total: ${total}`;
    document.getElementById('rep-presentes').textContent = `Presentes: ${conteo.presente}`;
    document.getElementById('rep-ausentes').textContent  = `Ausentes: ${conteo.ausente}`;
    document.getElementById('rep-tardes').textContent    = `Tardes: ${conteo.tarde}`;
    document.getElementById('rep-truncado').style.display = truncado ? 'block' : 'none';
    resumen.style.display = 'block';

    // Tabla
    resultado.innerHTML = `
      <figure><table>
        <thead><tr>
          <th>Fecha</th><th>Estudiante</th><th>Grupo</th><th>Estado</th><th>Registrado por</th>
        </tr></thead>
        <tbody>
          ${asistencias.map(a => {
            const est = ETIQUETAS_ESTADO[a.estado] || { label: a.estado, color: '' };
            return `<tr>
              <td>${a.fecha}</td>
              <td>${a.estudiante_nombre}</td>
              <td>${a.grupo_nombre}</td>
              <td style="color:${est.color}; font-weight:bold;">${est.label}</td>
              <td>${a.registrado_por_nombre}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table></figure>`;

    // Porcentajes
    renderPorcentajesAdmin(asistencias);
    seccionPct.style.display = 'block';

  } catch (err) {
    if (err.message !== 'token_expirado') {
      resultado.innerHTML = '<p style="color:var(--pico-color-red-500)">No se pudo conectar al servidor.</p>';
    }
  } finally {
    btnBuscar.removeAttribute('aria-busy');
    btnBuscar.disabled = false;
  }
});

function renderPorcentajesAdmin(asistencias) {
  const mapa = new Map();
  asistencias.forEach(a => {
    if (!mapa.has(a.estudiante_id)) {
      mapa.set(a.estudiante_id, { nombre: a.estudiante_nombre, presente: 0, ausente: 0, tarde: 0 });
    }
    const est = mapa.get(a.estudiante_id);
    est[a.estado]++;
  });

  const filas = [...mapa.values()]
    .map(e => {
      const total = e.presente + e.ausente + e.tarde;
      const pct   = total > 0 ? Math.round((e.presente / total) * 100) : 0;
      return { ...e, total, pct };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  document.getElementById('tablaPorcentajesAdmin').innerHTML = `
    <figure><table>
      <thead><tr>
        <th>Estudiante</th><th>Presentes</th><th>Ausentes</th><th>Tardes</th><th>Total</th><th>% Asistencia</th>
      </tr></thead>
      <tbody>
        ${filas.map(f => {
          const color = f.pct >= 80 ? 'var(--pico-color-green-500)'
                      : f.pct >= 60 ? 'var(--pico-color-orange-500)'
                      : 'var(--pico-color-red-500)';
          return `<tr>
            <td>${f.nombre}</td>
            <td>${f.presente}</td>
            <td>${f.ausente}</td>
            <td>${f.tarde}</td>
            <td>${f.total}</td>
            <td style="color:${color}; font-weight:bold;">${f.pct}%</td>
          </tr>`;
        }).join('')}
      </tbody>
    </table></figure>`;
}

document.getElementById('btnExportarAdmin').addEventListener('click', () => {
  if (ultimasAsistenciasAdmin.length === 0) return;
  const headers = ['Fecha', 'Estudiante', 'Grupo', 'Estado', 'Registrado por'];
  const rows = ultimasAsistenciasAdmin.map(a => [
    a.fecha, a.estudiante_nombre, a.grupo_nombre, a.estado, a.registrado_por_nombre
  ]);
  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `asistencia_${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
});

// Fechas por defecto: primer día del mes actual → hoy
(function setFechasDefecto() {
  const hoy = new Date();
  const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  document.getElementById('rep-hasta').value = hoy.toISOString().slice(0, 10);
  document.getElementById('rep-desde').value = primerDia.toISOString().slice(0, 10);
})();

// ============ Init ============
cargarEstudiantes();
cargarGrupos();
cargarEntrenadores();
