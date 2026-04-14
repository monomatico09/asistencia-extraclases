const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://asistencia_db_nut7_user:7k0EV2Ef5JrHuRmFxYiNvtTFUSUK0lAA@dpg-d7f3unurnols73es6k5g-a/asistencia_db_nut7',
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      usuario TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      rol TEXT NOT NULL CHECK(rol IN ('entrenador', 'admin')),
      activo INTEGER NOT NULL DEFAULT 1,
      creado_en TEXT NOT NULL DEFAULT NOW()::text
    );

    CREATE TABLE IF NOT EXISTS grupos (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      actividad TEXT NOT NULL,
      entrenador_id INTEGER NOT NULL,
      horario TEXT,
      lugar TEXT,
      activo INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (entrenador_id) REFERENCES usuarios(id)
    );

    CREATE TABLE IF NOT EXISTS estudiantes (
      id SERIAL PRIMARY KEY,
      nombre_completo TEXT NOT NULL,
      grado TEXT NOT NULL,
      grupo_id INTEGER NOT NULL,
      activo INTEGER NOT NULL DEFAULT 1,
      FOREIGN KEY (grupo_id) REFERENCES grupos(id)
    );

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
    );
  `);

  console.log('Base de datos lista');
}

initDB().catch(err => {
  console.error('Error al inicializar la base de datos:', err);
  process.exit(1);
});

module.exports = pool;
