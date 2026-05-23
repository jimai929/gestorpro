import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

const urlBaseDatos = process.env.DATABASE_URL;
if (!urlBaseDatos) {
  throw new Error(
    'Falta DATABASE_URL en el entorno. Copia .env.example a .env y rellénalo.',
  );
}

/**
 * Cliente Prisma compartido por toda la app.
 *
 * Prisma 7 accede a la base mediante un driver adapter; aquí, PostgreSQL vía
 * `PrismaPg`. Mantener una sola instancia evita agotar el pool de conexiones:
 * el cliente se importa siempre desde este módulo, nunca se crea otro
 * `new PrismaClient` en el resto del código.
 */
const adaptador = new PrismaPg({ connectionString: urlBaseDatos });

export const prisma = new PrismaClient({ adapter: adaptador });
