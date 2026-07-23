import { test, expect } from '@playwright/test';
import { env, requireAdmin } from '../helpers/env';
import { login } from '../helpers/auth';
import { goto } from '../helpers/nav';

/**
 * SMOKE de SOLO LECTURA (@smoke @readonly). SEGURO en producción: la sesión de la
 * navegación la pre-carga global-setup (storageState) con un login real; los tests solo
 * NAVEGAN y verifican estructura. NO crean, editan, borran, resetean ni tocan
 * dinero/salarios. Requiere E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.
 */

// ── Flujo de LOGIN: arranca SIN sesión (sobrescribe el storageState global) ──────
test.describe('@smoke @readonly — login', () => {
  test.use({ storageState: { cookies: [], origins: [] } });
  requireAdmin();

  test('login fresco deja al usuario autenticado fuera de /login', async ({ page }) => {
    await login(page, env.adminEmail, env.adminPassword);
    await expect(page).not.toHaveURL(/\/login(\?.*)?$/);
    await expect(page.getByText('GestorPro').first()).toBeVisible();
  });
});

// ── Navegación autenticada (usa el storageState del config: ya logueado) ─────────
test.describe('@smoke @readonly — navegación de solo lectura', () => {
  requireAdmin();

  test('dashboard carga sin error boundary', async ({ page }) => {
    await goto.dashboard(page);
    await expect(page.getByText('GestorPro').first()).toBeVisible();
  });

  test('la página de usuarios muestra su encabezado', async ({ page }) => {
    await goto.usuarios(page);
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
  });

  test('empleados carga', async ({ page }) => {
    await goto.empleados(page);
    await expect(page.getByText('GestorPro').first()).toBeVisible();
  });

  test('jornadas (asistencia) carga', async ({ page }) => {
    await goto.jornadas(page);
    await expect(page.getByText('GestorPro').first()).toBeVisible();
  });

  test('gastos carga', async ({ page }) => {
    await goto.gastos(page);
    await expect(page.getByText('GestorPro').first()).toBeVisible();
  });

  test('cuentas por pagar (donde se registran compras) carga', async ({ page }) => {
    await goto.cuentasPorPagar(page);
    await expect(page.getByText('GestorPro').first()).toBeVisible();
  });

  test('cobros (asistencia) carga', async ({ page }) => {
    await goto.cobros(page);
    await expect(page.getByText('GestorPro').first()).toBeVisible();
  });

  // ── Pantallas de finanzas de la v1.0 (las más nuevas = las más propensas a
  //    romperse en producción; todas de SOLO LECTURA al cargar) ────────────────
  test('flujo de caja carga', async ({ page }) => {
    await goto.flujoCaja(page);
    await expect(page.getByText('GestorPro').first()).toBeVisible();
  });

  test('historial de pagos carga', async ({ page }) => {
    await goto.pagos(page);
    await expect(page.getByText('GestorPro').first()).toBeVisible();
  });

  test('estado de cuenta carga', async ({ page }) => {
    await goto.estadoCuenta(page);
    await expect(page.getByText('GestorPro').first()).toBeVisible();
  });

  test('auditoría financiera carga', async ({ page }) => {
    await goto.auditoriaFinanciera(page);
    await expect(page.getByText('GestorPro').first()).toBeVisible();
  });

  test('antigüedad de cuentas por pagar carga', async ({ page }) => {
    await goto.antiguedad(page);
    await expect(page.getByText('GestorPro').first()).toBeVisible();
  });

  test('plan de pagos carga (solo la pantalla; NO se genera ningún plan)', async ({ page }) => {
    await goto.planPagos(page);
    await expect(page.getByText('GestorPro').first()).toBeVisible();
  });

  test('NINGUNA página del recorrido queda en /login ni con error de aplicación', async ({ page }) => {
    for (const ir of [goto.dashboard, goto.usuarios, goto.empleados, goto.gastos, goto.jornadas]) {
      // irA() ya afirma que NO caímos a /login y que estamos en la ruta pedida.
      await ir(page);
      await expect(page.getByText(/Unexpected Application Error/i)).toHaveCount(0);
    }
  });
});
