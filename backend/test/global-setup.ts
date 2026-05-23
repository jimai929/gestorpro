import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import type { GlobalSetupContext } from 'vitest/node';

let contenedor: StartedPostgreSqlContainer;

/**
 * Setup global de los tests: levanta UN PostgreSQL efímero (Testcontainers),
 * le aplica las migraciones (incluida la vista cuenta_por_pagar) y comparte su
 * URL con los tests vía `provide`. Al terminar, detiene el contenedor.
 *
 * Requiere Docker corriendo.
 */
export default async function ({
  provide,
}: GlobalSetupContext): Promise<() => Promise<void>> {
  contenedor = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = contenedor.getConnectionUri();

  // migrate deploy aplica los archivos de migración a la base efímera. La URL se
  // pasa por entorno; prisma.config.ts (dotenv) no la sobreescribe si ya existe.
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  provide('databaseUrl', url);

  return async () => {
    await contenedor.stop();
  };
}

declare module 'vitest' {
  interface ProvidedContext {
    databaseUrl: string;
  }
}
