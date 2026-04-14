require('dotenv').config();
const express = require('express');
const path = require('path');
const db = require('./src/database');
const router = require('./src/routes');

const app = express();

app.use(express.json());
app.use(express.static('public'));
app.use('/api', router);

app.get('/', (req, res) => res.redirect('/login.html'));

app.get('/health', (req, res) => {
  const usuarios    = db.prepare('SELECT COUNT(*) as total FROM usuarios').get().total;
  const grupos      = db.prepare('SELECT COUNT(*) as total FROM grupos').get().total;
  const estudiantes = db.prepare('SELECT COUNT(*) as total FROM estudiantes').get().total;
  const asistencias = db.prepare('SELECT COUNT(*) as total FROM asistencias').get().total;

  res.json({
    ok: true,
    mensaje: 'Servidor funcionando',
    hora: new Date().toISOString(),
    stats: { usuarios, grupos, estudiantes, asistencias }
  });
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint no encontrado' });
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
