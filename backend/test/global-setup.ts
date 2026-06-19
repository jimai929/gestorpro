import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import pg from 'pg';
// vitest 4 pasa el TestProject al global setup (GlobalSetupContext ya no existe).
import type { TestProject } from 'vitest/node';

const { Client } = pg;

let contenedor: StartedPostgreSqlContainer;

// Rol NO-owner que replica `gestorpro_app` de producción (deploy/postgres). Se
// crea para poder verificar el append-only de auditoria desde un test: el rol
// owner del contenedor (superusuario) IGNORA los GRANT/REVOKE, así que los demás
// tests no pueden comprobarlo. Credenciales solo para la base efímera del test.
const ROL_APP = 'gestorpro_app';
const PW_APP = 'app_test_pw';

/**
 * Setup global de los tests: levanta UN PostgreSQL efímero (Testcontainers),
 * le aplica las migraciones (incluida la vista cuenta_por_pagar) y comparte su
 * URL con los tests vía `provide`. Al terminar, detiene el contenedor.
 *
 * Requiere Docker corriendo.
 */
export default async function ({
  provide,
}: TestProject): Promise<() => Promise<void>> {
  contenedor = await new PostgreSqlContainer('postgres:17-alpine').start();
  const url = contenedor.getConnectionUri();

  // migrate deploy aplica los archivos de migración a la base efímera. La URL se
  // pasa por entorno; prisma.config.ts (dotenv) no la sobreescribe si ya existe.
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'inherit',
  });

  // ── Rol restringido `gestorpro_app` para el test de append-only ───────────
  // Se replica EXACTAMENTE el contrato de producción: los grants base de
  // `deploy/postgres/initdb/01-init-roles.sh` y, como fuente única de verdad, el
  // MISMO `deploy/postgres/post-migrate.sql` (GRANT de datos + REVOKE del
  // append-only de auditoria), leído del disco. Si alguien rompe ese REVOKE, el
  // test de append-only se pone en rojo.
  const postMigrateSql = readFileSync(
    new URL('../../deploy/postgres/post-migrate.sql', import.meta.url),
    'utf8',
  );
  const admin = new Client({ connectionString: url });
  await admin.connect();
  try {
    await admin.query(`DROP ROLE IF EXISTS ${ROL_APP}`);
    await admin.query(`CREATE ROLE ${ROL_APP} LOGIN PASSWORD '${PW_APP}'`);
    // Grants base del schema (igual que initdb): usar el schema, sin crear en él.
    await admin.query(`GRANT USAGE ON SCHEMA public TO ${ROL_APP}`);
    await admin.query(`REVOKE CREATE ON SCHEMA public FROM ${ROL_APP}`);
    // Grants de datos + append-only de producción, sin reinventarlos.
    await admin.query(postMigrateSql);
  } finally {
    await admin.end();
  }

  // URL del rol app: misma base, host y puerto; solo cambian las credenciales.
  const urlApp = url.replace(/\/\/[^@]+@/, `//${ROL_APP}:${PW_APP}@`);

  provide('databaseUrl', url);
  provide('databaseUrlApp', urlApp);

  return async () => {
    await contenedor.stop();
  };
}

declare module 'vitest' {
  interface ProvidedContext {
    databaseUrl: string;
    databaseUrlApp: string;
  }
}
