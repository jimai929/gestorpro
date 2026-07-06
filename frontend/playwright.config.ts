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
  // Reintentos: la rehidratación de sesión (async, /auth/refresh + /auth/me) puede
  // abortarse bajo carga del backend dev de una sola instancia → caída transitoria a
  // /login. Es flakiness de ENTORNO (en aislamiento la página carga bien, verificado),
  // no un bug: 2 reintentos la absorben. En verde no reintenta (coste 0).
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 2,
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
