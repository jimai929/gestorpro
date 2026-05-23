// Cargar el entorno antes de importar el cliente Prisma (que lee DATABASE_URL).
import '../src/core/entorno.js';
import { prisma } from '../src/core/prisma.js';
import { hashearContrasena } from '../src/core/auth/contrasena.js';
import { Rol } from '../src/generated/prisma/enums.js';

/**
 * Semilla de la base de datos de GestorPro.
 *
 * Crea una sede base y el usuario administrador inicial (los usuarios los crea
 * un administrador; no hay registro abierto). Idempotente: se puede correr
 * varias veces sin duplicar.
 */
async function main(): Promise<void> {
  // Sede base (idempotente por nombre).
  let sede = await prisma.sede.findFirst({ where: { nombre: 'Sede Central' } });
  if (!sede) {
    sede = await prisma.sede.create({ data: { nombre: 'Sede Central' } });
  }

  // Usuario administrador inicial.
  const email = 'admin@gestorpro.local';
  const passwordHash = await hashearContrasena('Admin1234*');
  await prisma.usuario.upsert({
    where: { email },
    update: {},
    create: {
      nombre: 'Administrador',
      email,
      rol: Rol.administrador,
      passwordHash,
    },
  });

  console.log('Semilla aplicada:');
  console.log(`  Sede:    ${sede.nombre} (${sede.id})`);
  console.log(`  Usuario: ${email}  /  Admin1234*  (rol administrador)`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
