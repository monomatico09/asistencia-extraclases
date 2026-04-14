const pool = require('./database');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

async function main() {
  // a) Limpiar tablas y reiniciar secuencias (CASCADE respeta foreign keys)
  await pool.query('TRUNCATE asistencias, estudiantes, grupos, usuarios RESTART IDENTITY CASCADE');

  // b) Insertar usuarios
  const hashAdmin    = await bcrypt.hash('admin123',    SALT_ROUNDS);
  const hashCperez   = await bcrypt.hash('cperez123',   SALT_ROUNDS);
  const hashAgomez   = await bcrypt.hash('agomez123',   SALT_ROUNDS);
  const hashLramirez = await bcrypt.hash('lramirez123', SALT_ROUNDS);

  await pool.query(
    'INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES ($1, $2, $3, $4)',
    ['Administrador', 'admin', hashAdmin, 'admin']
  );
  const { rows: [{ id: idCarlos }] } = await pool.query(
    'INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES ($1, $2, $3, $4) RETURNING id',
    ['Carlos Pérez', 'cperez', hashCperez, 'entrenador']
  );
  const { rows: [{ id: idAna }] } = await pool.query(
    'INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES ($1, $2, $3, $4) RETURNING id',
    ['Ana Gómez', 'agomez', hashAgomez, 'entrenador']
  );
  const { rows: [{ id: idLuis }] } = await pool.query(
    'INSERT INTO usuarios (nombre, usuario, password_hash, rol) VALUES ($1, $2, $3, $4) RETURNING id',
    ['Luis Ramírez', 'lramirez', hashLramirez, 'entrenador']
  );

  // c) Insertar grupos
  const { rows: [{ id: idFutbol }] } = await pool.query(
    'INSERT INTO grupos (nombre, actividad, entrenador_id, horario, lugar) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    ['Fútbol Masculino', 'Fútbol', idCarlos, 'Lunes y Miércoles 3pm', 'Cancha principal']
  );
  const { rows: [{ id: idBaloncesto }] } = await pool.query(
    'INSERT INTO grupos (nombre, actividad, entrenador_id, horario, lugar) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    ['Baloncesto', 'Baloncesto', idAna, 'Martes y Jueves 3pm', 'Polideportivo']
  );
  const { rows: [{ id: idNatacion }] } = await pool.query(
    'INSERT INTO grupos (nombre, actividad, entrenador_id, horario, lugar) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    ['Natación', 'Natación', idLuis, 'Viernes 2pm', 'Piscina']
  );

  // d) Insertar estudiantes
  // Fútbol
  await pool.query(
    'INSERT INTO estudiantes (nombre_completo, grado, grupo_id, activo) VALUES ($1, $2, $3, 1)',
    ['Sebastián Morales Ríos', '8°', idFutbol]
  );
  await pool.query(
    'INSERT INTO estudiantes (nombre_completo, grado, grupo_id, activo) VALUES ($1, $2, $3, 1)',
    ['Andrés Felipe Torres', '9°', idFutbol]
  );
  await pool.query(
    'INSERT INTO estudiantes (nombre_completo, grado, grupo_id, activo) VALUES ($1, $2, $3, 1)',
    ['Camilo Alejandro Vargas', '7°', idFutbol]
  );

  // Baloncesto
  await pool.query(
    'INSERT INTO estudiantes (nombre_completo, grado, grupo_id, activo) VALUES ($1, $2, $3, 1)',
    ['Valentina Ospina Herrera', '10°', idBaloncesto]
  );
  await pool.query(
    'INSERT INTO estudiantes (nombre_completo, grado, grupo_id, activo) VALUES ($1, $2, $3, 1)',
    ['Isabella Castillo Mendoza', '11°', idBaloncesto]
  );
  await pool.query(
    'INSERT INTO estudiantes (nombre_completo, grado, grupo_id, activo) VALUES ($1, $2, $3, 1)',
    ['Daniela Suárez Patiño', '9°', idBaloncesto]
  );

  // Natación
  await pool.query(
    'INSERT INTO estudiantes (nombre_completo, grado, grupo_id, activo) VALUES ($1, $2, $3, 1)',
    ['Juan Pablo Restrepo Gómez', '6°', idNatacion]
  );
  await pool.query(
    'INSERT INTO estudiantes (nombre_completo, grado, grupo_id, activo) VALUES ($1, $2, $3, 1)',
    ['Miguel Ángel Cárdenas Ruiz', '8°', idNatacion]
  );
  await pool.query(
    'INSERT INTO estudiantes (nombre_completo, grado, grupo_id, activo) VALUES ($1, $2, $3, 1)',
    ['Santiago Romero Aguilar', '7°', idNatacion]
  );

  console.log('Seed completado: 4 usuarios, 3 grupos, 9 estudiantes');
  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
