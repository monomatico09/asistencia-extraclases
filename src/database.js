require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });

async function initDB() {
  console.log('Conectando a la base de datos...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      usuario TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL CHECK(rol IN ('entrenador', 'admin')),
      activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT NOW()::text
    )
  `);
  console.log('✓ Tabla usuarios lista');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS grupos (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      actividad TEXT NOT NULL,
      entrenador_id INTEGER NOT NULL,
      horario TEXT,
      lugar TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (entrenador_id) REFERENCES usuarios(id)
    )
  `);
  console.log('✓ Tabla grupos lista');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS estudiantes (
      id SERIAL PRIMARY KEY,
      nombre_completo TEXT NOT NULL,
      grado TEXT NOT NULL,
      grupo_id INTEGER NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (grupo_id) REFERENCES grupos(id)
    )
  `);
  console.log('✓ Tabla estudiantes lista');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS asistencias (
      id SERIAL PRIMARY KEY,
      fecha TEXT NOT NULL,
      grupo_id INTEGER NOT NULL,
      estudiante_id INTEGER NOT NULL,
      estado TEXT NOT NULL CHECK(estado IN ('presente', 'ausente', 'tarde', 'justificado')),
      observaciones TEXT,
      registrado_por INTEGER NOT NULL,
      creado_en TEXT NOT NULL DEFAULT NOW()::text,
      actualizado_en TEXT NOT NULL DEFAULT NOW()::text,
      FOREIGN KEY (grupo_id) REFERENCES grupos(id),
      FOREIGN KEY (estudiante_id) REFERENCES estudiantes(id),
      FOREIGN KEY (registrado_por) REFERENCES usuarios(id),
      UNIQUE(estudiante_id, fecha)
    )
  `);
  console.log('✓ Tabla asistencias lista');

  console.log('Base de datos lista');
}

initDB().catch(err => {
  console.error('Error al inicializar la base de datos:', err.message);
});

module.exports = pool;
