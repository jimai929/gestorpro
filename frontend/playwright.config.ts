import { defineConfig, devices } from '@playwright/test';

/**
 * Configuración de la suite E2E VISIBLE de GestorPro.
 *
 * Modos (E2E_MODE): dev | staging | production. La PROTECCIÓN de escritura vive en
 * e2e/helpers/env.ts y en cada spec @full (se auto-skipean si NO hay permiso de
 * escritura o si el modo es production). Aquí solo se configura el runner + los
 * artefactos visibles (screenshot / video / trace / HTML report).
 *
 * Selección por etiqueta (ver scripts de package.json):
 *   @smoke / @readonly → solo navegación/lectura (seguro en producción)
 *   @full              → flujos que ESCRIBEN datos (solo dev/staging con E2E_ALLOW_WRITES=true)
 */
const baseURL = process.env.E2E_BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './e2e/specs',
  // Inicia sesión UNA vez y guarda el estado (localStorage con refresh token): todos los
  // tests arrancan autenticados, sin la carrera de rehidratación por-test.
  globalSetup: './e2e/global-setup.ts',
  // Teardown dev-only: da de BAJA LÓGICA (reversible, nunca borra) las cuentas/empleados
  // e2e-* al terminar. Fail-safe: no hace nada en producción ni sin E2E_ALLOW_WRITES.
  globalTeardown: './e2e/global-teardown.ts',
  // Reintentos: la "flakiness de entorno" que justificaba 2 reintentos tenía DOS
  // causas raíz, ambas arregladas el 2026-07-23: (1) el catch del refresh borraba el
  // token ante cualquier fallo transitorio (ContextoAuth distingue ahora el 401 real)
  // y (2) el rate limit de /auth/refresh (30/min) se agotaba con las recargas de la
  // suite → 429 → /login; el stack de E2E debe correr el backend con
  // RATE_LIMIT_REFRESH_MAX alto (p. ej. 2000). Con ambo arreglos la suite corre
  // 0-flaky; queda UN reintento como red para hipos reales del entorno dev — si algo
  // reintenta, aparece como "flaky" en el reporte y hay que MIRARLO, no subir esto.
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 7_000 },

  // Artefactos VISIBLES tras un fallo.
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
  ],
  outputDir: 'test-results',

  use: {
    baseURL,
    // Sesión pre-cargada por global-setup (los tests que necesitan estar SIN sesión la
    // sobrescriben con test.use({ storageState: { cookies: [], origins: [] } })).
    storageState: './e2e/.auth/state.json',
    // Solo se guardan cuando el test FALLA (o al reintentar): no ensucian corridas verdes.
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
