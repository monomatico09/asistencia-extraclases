// ============ Guard clause ============
const token = localStorage.getItem('token');
const usuarioJSON = localStorage.getItem('usuario');
if (!token || !usuarioJSON) { window.location.href = '/login.html'; }
const usuario = JSON.parse(usuarioJSON);

document.getElementById('saludoUsuario').textContent = `Hola, ${usuario.nombre}`;
document.getElementById('btnLogout').addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.location.href = '/login.html';
});

// ============ API helper ============
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

// ============ Fechas por defecto: 1° del mes → hoy ============
const hoy = new Date();
const primerDia = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
document.getElementById('rep-hasta').value = hoy.toISOString().slice(0, 10);
document.getElementById('rep-desde').value = primerDia.toISOString().slice(0, 10);

// ============ Estado ============
let ultimasAsistencias = [];

// ============ Helpers ============
function colorEstado(estado) {
  return { presente: 'var(--pico-color-green-500)', ausente: 'var(--pico-color-red-500)', tarde: 'var(--pico-color-orange-500)' }[estado] || '';
}

function capitalizar(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ============ Cargar grupos para el select ============
async function cargarGruposSelect() {
  try {
    const resp = await api('/api/grupos');
    const grupos = await resp.json();
    const select = document.getElementById('rep-grupo');
    select.innerHTML = '<option value="">Todos los grupos</option>' +
      grupos.map(g => `<option value="${g.id}">${g.nombre}</option>`).join('');
  } catch (err) {}
}

// ============ Buscar ============
document.getElementById('formReporte').addEventListener('submit', async (e) => {
  e.preventDefault();

  const grupoId   = document.getElementById('rep-grupo').value;
  const desde     = document.getElementById('rep-desde').value;
  const hasta     = document.getElementById('rep-hasta').value;
  const btn       = document.getElementById('btnBuscar');
  const resultado = document.getElementById('resultadoReporte');
  const resumen   = document.getElementById('resumenReporte');
  const seccionPct = document.getElementById('seccionPorcentajes');

  resultado.innerHTML = '';
  resumen.style.display = 'none';
  seccionPct.style.display = 'none';
  ultimasAsistencias = [];

  const qs = new URLSearchParams();
  if (grupoId) qs.set('grupo_id', grupoId);
  if (desde)   qs.set('fecha_desde', desde);
  if (hasta)   qs.set('fecha_hasta', hasta);

  btn.setAttribute('aria-busy', 'true');
  btn.disabled = true;
  resultado.innerHTML = '<p>Buscando...</p>';

  try {
    const resp = await api(`/api/asistencias?${qs.toString()}`);
    const datos = await resp.json();

    if (!resp.ok) {
      resultado.innerHTML = `<p style="color:var(--pico-color-red-500)">${datos.error || 'Error al obtener el reporte'}</p>`;
      return;
    }

    const { asistencias, total, truncado } = datos;
    ultimasAsistencias = asistencias;

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

    // Tabla principal
    const esAdmin = usuario.rol === 'admin';
    resultado.innerHTML = `
      <figure><table>
        <thead><tr>
          <th>Fecha</th>
          <th>Estudiante</th>
          ${esAdmin ? '<th>Grupo</th>' : ''}
          <th>Estado</th>
          <th>Registrado por</th>
        </tr></thead>
        <tbody>
          ${asistencias.map(a => `
            <tr>
              <td>${a.fecha}</td>
              <td>${a.estudiante_nombre}</td>
              ${esAdmin ? `<td>${a.grupo_nombre}</td>` : ''}
              <td style="color:${colorEstado(a.estado)}; font-weight:bold;">${capitalizar(a.estado)}</td>
              <td>${a.registrado_por_nombre}</td>
            </tr>`).join('')}
        </tbody>
      </table></figure>`;

    // Porcentajes por estudiante
    renderPorcentajes(asistencias);
    seccionPct.style.display = 'block';

  } catch (err) {
    if (err.message !== 'token_expirado') {
      resultado.innerHTML = '<p style="color:var(--pico-color-red-500)">No se pudo conectar al servidor.</p>';
    }
  } finally {
    btn.removeAttribute('aria-busy');
    btn.disabled = false;
  }
});

// ============ Porcentajes por estudiante ============
function renderPorcentajes(asistencias) {
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

  document.getElementById('tablaPorcentajes').innerHTML = `
    <figure><table>
      <thead><tr>
        <th>Estudiante</th>
        <th>Presentes</th>
        <th>Ausentes</th>
        <th>Tardes</th>
        <th>Total sesiones</th>
        <th>% Asistencia</th>
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

// ============ Exportar CSV ============
document.getElementById('btnExportar').addEventListener('click', () => {
  if (ultimasAsistencias.length === 0) return;

  const esAdmin = usuario.rol === 'admin';
  const headers = ['Fecha', 'Estudiante', ...(esAdmin ? ['Grupo'] : []), 'Estado', 'Registrado por'];
  const rows = ultimasAsistencias.map(a => [
    a.fecha,
    a.estudiante_nombre,
    ...(esAdmin ? [a.grupo_nombre] : []),
    a.estado,
    a.registrado_por_nombre
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

// ============ Init ============
cargarGruposSelect();
