import { defineConfig } from 'vitest/config';

/**
 * Configuración base de Vitest.
 *
 * Los tests de lógica crítica (corrección, jornada, saldos) corren contra un
 * PostgreSQL real vía Testcontainers. El `globalSetup` que levanta ese
 * contenedor efímero se añade en la Tarea 1.2, cuando aparece el primer test
 * que lo necesita. En la Tarea 0.1 no hay tests todavía.
 */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['test/**/*.test.ts'],
  },
});
