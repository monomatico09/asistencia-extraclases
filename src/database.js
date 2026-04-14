const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'asistencia.db'));

db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    usuario TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL CHECK(rol IN ('entrenador', 'admin')),
    activo INTEGER NOT NULL DEFAULT 1,
    creado_en TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS grupos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    actividad TEXT NOT NULL,
    entrenador_id INTEGER NOT NULL,
    horario TEXT,
    lugar TEXT,
    activo INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (entrenador_id) REFERENCES usuarios(id)
  );

  CREATE TABLE IF NOT EXISTS estudiantes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_completo TEXT NOT NULL,
    grado TEXT NOT NULL,
    grupo_id INTEGER NOT NULL,
    activo INTEGER NOT NULL DEFAULT 1,
    FOREIGN KEY (grupo_id) REFERENCES grupos(id)
  );

  CREATE TABLE IF NOT EXISTS asistencias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    fecha TEXT NOT NULL,
    grupo_id INTEGER NOT NULL,
    estudiante_id INTEGER NOT NULL,
    estado TEXT NOT NULL CHECK(estado IN ('presente', 'ausente', 'tarde', 'justificado')),
    observaciones TEXT,
    registrado_por INTEGER NOT NULL,
    creado_en TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado_en TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (grupo_id) REFERENCES grupos(id),
    FOREIGN KEY (estudiante_id) REFERENCES estudiantes(id),
    FOREIGN KEY (registrado_por) REFERENCES usuarios(id),
    UNIQUE(estudiante_id, fecha)
  );
`);

console.log('Base de datos lista');

module.exports = db;
