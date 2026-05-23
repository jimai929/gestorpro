/**
 * Carga las variables de entorno desde `.env` lo antes posible (Node 20.12+).
 *
 * Este módulo se importa de PRIMERO en `server.ts` por su efecto secundario,
 * de modo que el resto de módulos —en particular el cliente Prisma, que lee
 * DATABASE_URL al evaluarse— vean las variables ya disponibles.
 */
try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan las variables del sistema o los valores por defecto.
}
