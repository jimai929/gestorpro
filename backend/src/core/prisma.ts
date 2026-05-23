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

/**
 * Cliente usado dentro de una transacción interactiva (`prisma.$transaction`):
 * el cliente sin sus métodos de ciclo de vida. Los repositorios y servicios que
 * operan dentro de una transacción reciben este tipo. El `tx` del callback es
 * asignable a él directamente.
 */
export type ClienteTx = Omit<
  typeof prisma,
  '$connect' | '$disconnect' | '$on' | '$use' | '$extends' | '$transaction'
>;
