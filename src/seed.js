const db = require('./database');
const bcrypt = require('bcrypt');

const SALT_ROUNDS = 10;

async function main() {
  // a) Limpiar tablas en orden por foreign keys
  db.prepare('DELETE FROM asistencias').run();
  db.prepare('DELETE FROM estudiantes').run();
  db.prepare('DELETE FROM grupos').run();
  db.prepare('DELETE FROM usuarios').run();
  db.prepare('DELETE FROM sqlite_sequence').run();

  // b) Insertar usuarios
  const insertUsuario = db.prepare(`
    INSERT INTO usuarios (nombre, usuario, password_hash, rol)
    VALUES (@nombre, @usuario, @password_hash, @rol)
  `);

  const hashAdmin    = await bcrypt.hash('admin123',    SALT_ROUNDS);
  const hashCperez   = await bcrypt.hash('cperez123',   SALT_ROUNDS);
  const hashAgomez   = await bcrypt.hash('agomez123',   SALT_ROUNDS);
  const hashLramirez = await bcrypt.hash('lramirez123', SALT_ROUNDS);

  insertUsuario.run({ nombre: 'Administrador', usuario: 'admin',    password_hash: hashAdmin,    rol: 'admin'       });
  const { lastInsertRowid: idCarlos } = insertUsuario.run({ nombre: 'Carlos Pérez',  usuario: 'cperez',  password_hash: hashCperez,   rol: 'entrenador'  });
  const { lastInsertRowid: idAna    } = insertUsuario.run({ nombre: 'Ana Gómez',     usuario: 'agomez',  password_hash: hashAgomez,   rol: 'entrenador'  });
  const { lastInsertRowid: idLuis   } = insertUsuario.run({ nombre: 'Luis Ramírez',  usuario: 'lramirez',password_hash: hashLramirez, rol: 'entrenador'  });

  // c) Insertar grupos
  const insertGrupo = db.prepare(`
    INSERT INTO grupos (nombre, actividad, entrenador_id, horario, lugar)
    VALUES (@nombre, @actividad, @entrenador_id, @horario, @lugar)
  `);

  const { lastInsertRowid: idFutbol }     = insertGrupo.run({ nombre: 'Fútbol Masculino', actividad: 'Fútbol',      entrenador_id: idCarlos, horario: 'Lunes y Miércoles 3pm', lugar: 'Cancha principal' });
  const { lastInsertRowid: idBaloncesto } = insertGrupo.run({ nombre: 'Baloncesto',       actividad: 'Baloncesto',  entrenador_id: idAna,    horario: 'Martes y Jueves 3pm',  lugar: 'Polideportivo'   });
  const { lastInsertRowid: idNatacion }   = insertGrupo.run({ nombre: 'Natación',         actividad: 'Natación',    entrenador_id: idLuis,   horario: 'Viernes 2pm',          lugar: 'Piscina'         });

  // d) Insertar estudiantes
  const insertEstudiante = db.prepare(`
    INSERT INTO estudiantes (nombre_completo, grado, grupo_id, activo)
    VALUES (@nombre_completo, @grado, @grupo_id, @activo)
  `);

  // Fútbol
  insertEstudiante.run({ nombre_completo: 'Sebastián Morales Ríos',    grado: '8°',  grupo_id: idFutbol,     activo: 1 });
  insertEstudiante.run({ nombre_completo: 'Andrés Felipe Torres',       grado: '9°',  grupo_id: idFutbol,     activo: 1 });
  insertEstudiante.run({ nombre_completo: 'Camilo Alejandro Vargas',    grado: '7°',  grupo_id: idFutbol,     activo: 1 });

  // Baloncesto
  insertEstudiante.run({ nombre_completo: 'Valentina Ospina Herrera',   grado: '10°', grupo_id: idBaloncesto, activo: 1 });
  insertEstudiante.run({ nombre_completo: 'Isabella Castillo Mendoza',  grado: '11°', grupo_id: idBaloncesto, activo: 1 });
  insertEstudiante.run({ nombre_completo: 'Daniela Suárez Patiño',      grado: '9°',  grupo_id: idBaloncesto, activo: 1 });

  // Natación
  insertEstudiante.run({ nombre_completo: 'Juan Pablo Restrepo Gómez',  grado: '6°',  grupo_id: idNatacion,   activo: 1 });
  insertEstudiante.run({ nombre_completo: 'Miguel Ángel Cárdenas Ruiz', grado: '8°',  grupo_id: idNatacion,   activo: 1 });
  insertEstudiante.run({ nombre_completo: 'Santiago Romero Aguilar',    grado: '7°',  grupo_id: idNatacion,   activo: 1 });

  // e) Resumen
  console.log('Seed completado: 4 usuarios, 3 grupos, 9 estudiantes');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
