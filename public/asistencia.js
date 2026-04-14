// ============ Guard clause y setup inicial ============
const token = localStorage.getItem('token');
const usuarioJSON = localStorage.getItem('usuario');

if (!token || !usuarioJSON) {
  window.location.href = '/login.html';
}

const usuario = JSON.parse(usuarioJSON);
document.getElementById('saludoUsuario').textContent = `Hola, ${usuario.nombre}`;

// Botón cerrar sesión
document.getElementById('btnLogout').addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.location.href = '/login.html';
});

// ============ Leer grupo_id de la URL ============
const params = new URLSearchParams(window.location.search);
const grupoId = Number(params.get('grupo_id'));

if (!Number.isInteger(grupoId) || grupoId <= 0) {
  document.getElementById('tituloGrupo').textContent = 'Error';
  document.getElementById('subtituloGrupo').textContent = 'grupo_id inválido en la URL';
  document.getElementById('contenedorEstudiantes').innerHTML = '';
  document.getElementById('btnGuardar').style.display = 'none';
  throw new Error('grupo_id inválido');
}

// ============ Fecha por defecto: hoy (máximo hoy, sin fechas futuras) ============
const hoy = new Date().toISOString().slice(0, 10);
document.getElementById('fecha').value = hoy;
document.getElementById('fecha').max = hoy;

// ============ Función helper para redirigir si el token expiró ============
function manejarTokenExpirado() {
  localStorage.removeItem('token');
  localStorage.removeItem('usuario');
  window.location.href = '/login.html';
}

// ============ Cargar grupo y estudiantes en paralelo ============
let estudiantes = [];

async function cargarDatos() {
  const contenedor = document.getElementById('contenedorEstudiantes');
  const mensajeError = document.getElementById('mensajeError');

  try {
    const [respGrupo, respEstudiantes] = await Promise.all([
      fetch(`/api/grupos/${grupoId}`, { headers: { 'Authorization': 'Bearer ' + token } }),
      fetch(`/api/grupos/${grupoId}/estudiantes`, { headers: { 'Authorization': 'Bearer ' + token } })
    ]);

    if (respGrupo.status === 401 || respEstudiantes.status === 401) {
      manejarTokenExpirado();
      return;
    }

    const grupo = await respGrupo.json();
    const listaEstudiantes = await respEstudiantes.json();

    if (!respGrupo.ok) {
      throw new Error(grupo.error || 'Error al cargar el grupo');
    }
    if (!respEstudiantes.ok) {
      throw new Error(listaEstudiantes.error || 'Error al cargar los estudiantes');
    }

    // Pintar título del grupo
    document.getElementById('tituloGrupo').textContent = `Asistencia: ${grupo.nombre}`;
    document.getElementById('subtituloGrupo').textContent = `${grupo.actividad} — ${grupo.horario || ''}`;

    // Guardar estudiantes en variable global para usar al guardar
    estudiantes = listaEstudiantes;

    if (estudiantes.length === 0) {
      contenedor.removeAttribute('aria-busy');
      contenedor.innerHTML = '<p><em>Este grupo no tiene estudiantes activos.</em></p>';
      document.getElementById('btnGuardar').style.display = 'none';
      return;
    }

    // Pintar una fila por estudiante con 4 radio buttons (presente preseleccionado)
    contenedor.removeAttribute('aria-busy');
    contenedor.innerHTML = estudiantes.map(est => `
      <div class="fila-estudiante">
        <div>
          <strong>${est.nombre_completo}</strong><br>
          <small>${est.grado}</small>
        </div>
        <div class="opciones-estado">
          <label><input type="radio" name="estado_${est.id}" value="presente" checked> Presente</label>
          <label><input type="radio" name="estado_${est.id}" value="ausente"> Ausente</label>
          <label><input type="radio" name="estado_${est.id}" value="tarde"> Tarde</label>
        </div>
      </div>
    `).join('');
  } catch (err) {
    contenedor.removeAttribute('aria-busy');
    contenedor.innerHTML = '';
    mensajeError.textContent = err.message || 'No se pudo conectar al servidor.';
    mensajeError.style.display = 'block';
    document.getElementById('btnGuardar').style.display = 'none';
  }
}

// ============ Guardar asistencia ============
document.getElementById('formAsistencia').addEventListener('submit', async (event) => {
  event.preventDefault();

  const mensajeExito = document.getElementById('mensajeExito');
  const mensajeError = document.getElementById('mensajeError');
  const btnGuardar = document.getElementById('btnGuardar');

  // Limpiar mensajes anteriores
  mensajeExito.style.display = 'none';
  mensajeError.style.display = 'none';

  // Recolectar los estados seleccionados
  const fecha = document.getElementById('fecha').value;
  const registros = estudiantes.map(est => {
    const radioSeleccionado = document.querySelector(`input[name="estado_${est.id}"]:checked`);
    return {
      estudiante_id: est.id,
      estado: radioSeleccionado.value
    };
  });

  const body = {
    grupo_id: grupoId,
    fecha,
    registros
  };

  // Deshabilitar el botón mientras se envía
  btnGuardar.setAttribute('aria-busy', 'true');
  btnGuardar.disabled = true;

  try {
    const respuesta = await fetch('/api/asistencias', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(body)
    });

    if (respuesta.status === 401) {
      manejarTokenExpirado();
      return;
    }

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      mensajeError.textContent = datos.error || 'Error al guardar la asistencia';
      mensajeError.style.display = 'block';
      return;
    }

    mensajeExito.textContent = `✓ ${datos.mensaje} (${datos.total} estudiantes)`;
    mensajeExito.style.display = 'block';
  } catch (err) {
    mensajeError.textContent = 'No se pudo conectar al servidor.';
    mensajeError.style.display = 'block';
  } finally {
    btnGuardar.removeAttribute('aria-busy');
    btnGuardar.disabled = false;
  }
});

// ============ Iniciar ============
cargarDatos();
