// Guard clause: si no hay token, redirigir al login
const token = localStorage.getItem('token');
const usuarioJSON = localStorage.getItem('usuario');

if (!token || !usuarioJSON) {
  window.location.href = '/login.html';
}

const usuario = JSON.parse(usuarioJSON);

// Mostrar saludo con el nombre del usuario
document.getElementById('saludoUsuario').textContent = `Hola, ${usuario.nombre}`;

// Mostrar enlace de administración solo para admins
if (usuario.rol === 'admin') {
  document.getElementById('liAdmin').style.display = 'list-item';
}

// Botón de cerrar sesión
document.getElementById('btnLogout').addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.location.href = '/login.html';
});

// Cargar los grupos del usuario
async function cargarGrupos() {
  const contenedor = document.getElementById('contenedorGrupos');
  const mensajeError = document.getElementById('mensajeError');
  const fechaHoy = new Date().toISOString().slice(0, 10);

  try {
    const [respGrupos, respHoy] = await Promise.all([
      fetch('/api/grupos', { headers: { 'Authorization': 'Bearer ' + token } }),
      fetch(`/api/asistencias?fecha_desde=${fechaHoy}&fecha_hasta=${fechaHoy}`, { headers: { 'Authorization': 'Bearer ' + token } })
    ]);

    if (respGrupos.status === 401 || respHoy.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('usuario');
      window.location.href = '/login.html';
      return;
    }

    const datos = await respGrupos.json();
    const datosHoy = await respHoy.json();

    if (!respGrupos.ok) {
      mensajeError.textContent = datos.error || 'Error al cargar los grupos';
      mensajeError.style.display = 'block';
      contenedor.removeAttribute('aria-busy');
      contenedor.innerHTML = '';
      return;
    }

    // Set de grupo_ids que ya tienen asistencia hoy
    const gruposConAsistenciaHoy = new Set(
      (datosHoy.asistencias || []).map(a => a.grupo_id)
    );

    contenedor.removeAttribute('aria-busy');

    if (datos.length === 0) {
      contenedor.innerHTML = '<p><em>No tienes grupos asignados.</em></p>';
      return;
    }

    contenedor.innerHTML = datos.map(grupo => {
      const tomadaHoy = gruposConAsistenciaHoy.has(grupo.id);
      return `
        <article>
          <header style="display:flex; justify-content:space-between; align-items:center;">
            <strong>${grupo.nombre}</strong>
            ${tomadaHoy ? '<small style="color:var(--pico-color-green-500);">Asistencia tomada hoy</small>' : ''}
          </header>
          <p>
            <strong>Actividad:</strong> ${grupo.actividad}<br>
            <strong>Horario:</strong> ${grupo.horario || 'Sin definir'}<br>
            <strong>Lugar:</strong> ${grupo.lugar || 'Sin definir'}
          </p>
          <footer>
            <a href="/asistencia.html?grupo_id=${grupo.id}" role="button"
               class="${tomadaHoy ? 'secondary' : ''}">
              ${tomadaHoy ? 'Editar asistencia' : 'Tomar asistencia'}
            </a>
          </footer>
        </article>`;
    }).join('');
  } catch (err) {
    contenedor.removeAttribute('aria-busy');
    contenedor.innerHTML = '';
    mensajeError.textContent = 'No se pudo conectar al servidor.';
    mensajeError.style.display = 'block';
  }
}

cargarGrupos();
