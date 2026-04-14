const jwt = require('jsonwebtoken');

function verificarToken(req, res, next) {
  if (req.path === '/seed') return next();

  const authHeader = req.headers['authorization'];
  if (!authHeader) {
    return res.status(401).json({ error: 'Token no proporcionado' });
  }

  const partes = authHeader.split(' ');
  if (partes[0] !== 'Bearer' || !partes[1]) {
    return res.status(401).json({ error: 'Formato de token inválido' });
  }

  const token = partes[1];

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = payload;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expirado' });
    }
    return res.status(401).json({ error: 'Token inválido' });
  }
}

function soloAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  if (req.user.rol !== 'admin') {
    return res.status(403).json({ error: 'Acceso restringido: solo administradores' });
  }
  next();
}

module.exports = { verificarToken, soloAdmin };
