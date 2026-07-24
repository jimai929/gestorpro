import { expect, type Page } from '@playwright/test';

/**
 * Navegación por rutas reales de GestorPro (ver frontend/src/App.tsx). Cada helper
 * navega por URL directa (más robusto que depender de la barra) y afirma que la página
 * cargó SIN error boundary. Las páginas de NEGOCIO exigen un usuario de tenant (el
 * super-admin es redirigido a /plataforma por RutaNegocio).
 *
 * Rutas que NO existen como página propia (se reportan en docs/E2E_VISIBLE_TESTS.md):
 *   ventas, compras y salario/nómina no tienen ruta dedicada; compras se registran
 *   dentro de /cuentas-por-pagar. OJO (actualizado 2026-07-23): desde la v1.0 las
 *   correcciones de dinero SÍ tienen UI (DialogoCorreccion en gastos/dashboard/pagos)
 *   y la auditoría tiene página propia (/auditoria-financiera), igual que flujo de
 *   caja, historial de pagos, estado de cuenta, antigüedad y plan de pagos — ver los
 *   helpers de abajo.
 */

/**
 * Navega a `ruta` (recarga completa del SPA) y espera a que la sesión REHIDRATE.
 * `ContextoAuth` rehidrata en cada carga leyendo el refresh token de localStorage y
 * llamando a /auth/refresh + /auth/me (async); `RutaProtegida` muestra <Cargando/>
 * mientras tanto. Por eso se espera a `networkidle` (que esas llamadas terminen) ANTES
 * de afirmar la URL: sin esa espera, la aserción corría durante la rehidratación. Con la
 * sesión pre-cargada (storageState) la rehidratación resuelve y NO se cae a /login.
 */
export async function irA(page: Page, ruta: string): Promise<void> {
  // Señal POSITIVA de sesión activa: la barra autenticada (link "Ir al inicio",
  // LayoutPrincipal). En /login el logo es un <div> sin ese rol/nombre, así que este
  // wait distingue "autenticado en la app" de "caído a /login". Desde 2026-07-23 la
  // rehidratación ya NO pierde la sesión ante aborts/429 transitorios (fix en
  // ContextoAuth + RATE_LIMIT_REFRESH_MAX en el backend del stack E2E); queda UN
  // reintento de goto como red mínima para el arranque frío del dev server.
  const barra = page.getByRole('link', { name: 'Ir al inicio' });
  for (let intento = 1; intento <= 2; intento++) {
    await page.goto(ruta);
    try {
      await barra.waitFor({ state: 'visible', timeout: 6_000 });
      break;
    } catch {
      await page.waitForTimeout(1_000); // cayó a /login o aún rehidrata: espera y reintenta
    }
  }
  // Debe estar en la ruta pedida (NO en /login) tras la rehidratación. Timeout holgado.
  await expect(barra).toBeVisible();
  await expect(page).toHaveURL(new RegExp(ruta.replace(/\//g, '\\/') + '(\\?.*)?$'), { timeout: 12_000 });
  // Error boundary de React Router: su texto EXACTO es "Unexpected Application Error".
  // (NO se busca "500" suelto: matchea montos legítimos como "B/. 500.00" de una factura.)
  await expect(page.getByText(/Unexpected Application Error/i)).toHaveCount(0);
}

export const goto = {
  inicio: (p: Page) => irA(p, '/'),
  dashboard: (p: Page) => irA(p, '/dashboard'),
  usuarios: (p: Page) => irA(p, '/usuarios'),
  empleados: (p: Page) => irA(p, '/empleados'),
  sedes: (p: Page) => irA(p, '/sedes'),
  kioscos: (p: Page) => irA(p, '/kioscos'),
  gastos: (p: Page) => irA(p, '/gastos'),
  cuentasPorPagar: (p: Page) => irA(p, '/cuentas-por-pagar'),
  proveedores: (p: Page) => irA(p, '/proveedores'),
  // Pantallas de finanzas de la v1.0 (todas de lectura al cargar; las de gestión
  // exigen supervisor/admin — el smoke corre con el admin del tenant).
  flujoCaja: (p: Page) => irA(p, '/finanzas/flujo-caja'),
  pagos: (p: Page) => irA(p, '/pagos'),
  estadoCuenta: (p: Page) => irA(p, '/estado-cuenta'),
  auditoriaFinanciera: (p: Page) => irA(p, '/auditoria-financiera'),
  antiguedad: (p: Page) => irA(p, '/cuentas-por-pagar/antiguedad'),
  planPagos: (p: Page) => irA(p, '/cuentas-por-pagar/plan-pagos'),
  jornadas: (p: Page) => irA(p, '/asistencia/jornadas'),
  revision: (p: Page) => irA(p, '/asistencia/revision'),
  cobros: (p: Page) => irA(p, '/asistencia/cobros'),
  plataforma: (p: Page) => irA(p, '/plataforma'),
};
