require('dotenv').config();
const express = require('express');
const path = require('path');
const pool = require('./src/database');
const router = require('./src/routes');

const app = express();

app.use(express.json());
app.use(express.static('public'));
app.use('/api', router);

app.get('/', (req, res) => res.redirect('/login.html'));

app.get('/health', async (req, res) => {
  try {
    const [u, g, e, a] = await Promise.all([
      pool.query('SELECT COUNT(*) AS total FROM usuarios'),
      pool.query('SELECT COUNT(*) AS total FROM grupos'),
      pool.query('SELECT COUNT(*) AS total FROM estudiantes'),
      pool.query('SELECT COUNT(*) AS total FROM asistencias'),
    ]);
    res.json({
      ok: true,
      mensaje: 'Servidor funcionando',
      hora: new Date().toISOString(),
      stats: {
        usuarios:    parseInt(u.rows[0].total),
        grupos:      parseInt(g.rows[0].total),
        estudiantes: parseInt(e.rows[0].total),
        asistencias: parseInt(a.rows[0].total),
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint no encontrado' });
  }
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => console.log(`Servidor corriendo en http://localhost:${PORT}`));
