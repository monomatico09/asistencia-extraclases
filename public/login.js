document.getElementById('loginForm').addEventListener('submit', async (event) => {
  event.preventDefault();

  const usuario = document.getElementById('usuario').value.trim();
  const contrasena = document.getElementById('contrasena').value;
  const mensajeError = document.getElementById('mensajeError');

  // Ocultar cualquier mensaje de error previo
  mensajeError.style.display = 'none';
  mensajeError.textContent = '';

  try {
    const respuesta = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, contraseña: contrasena })
    });

    const datos = await respuesta.json();

    if (!respuesta.ok) {
      // El servidor respondió con error (401, 400, 500, etc.)
      mensajeError.textContent = datos.error || 'Error al iniciar sesión';
      mensajeError.style.display = 'block';
      return;
    }

    // Login exitoso: guardar token y datos del usuario
    localStorage.setItem('token', datos.token);
    localStorage.setItem('usuario', JSON.stringify(datos.usuario));

    // Redirigir al dashboard
    window.location.href = '/dashboard.html';
  } catch (err) {
    // Error de red (servidor no responde, sin internet, etc.)
    mensajeError.textContent = 'No se pudo conectar al servidor. Verifica tu conexión.';
    mensajeError.style.display = 'block';
  }
});
