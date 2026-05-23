import { defineConfig } from 'vitest/config';

/**
 * Configuración de Vitest.
 *
 * Los tests de lógica crítica corren contra un PostgreSQL real efímero
 * (Testcontainers). `global-setup` levanta el contenedor y aplica las
 * migraciones una vez; `setup-entorno` apunta el cliente Prisma a esa base
 * antes de cada archivo. Un solo proceso (singleFork) para compartir la base.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    setupFiles: ['test/setup-entorno.ts'],
    // Archivos de test en serie (una sola base compartida del contenedor).
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 180000,
  },
});
