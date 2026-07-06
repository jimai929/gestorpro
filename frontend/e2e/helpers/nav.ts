import { expect, type Page } from '@playwright/test';

/**
 * Navegación por rutas reales de GestorPro (ver frontend/src/App.tsx). Cada helper
 * navega por URL directa (más robusto que depender de la barra) y afirma que la página
 * cargó SIN error boundary. Las páginas de NEGOCIO exigen un usuario de tenant (el
 * super-admin es redirigido a /plataforma por RutaNegocio).
 *
 * Rutas que NO existen como página propia (se reportan en docs/E2E_VISIBLE_TESTS.md):
 *   ventas, compras, salario/nómina y auditoría NO tienen ruta dedicada; compras se
 *   registran dentro de /cuentas-por-pagar; las correcciones de dinero y la auditoría
 *   son API-only (sin UI).
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
  // La rehidratación (/auth/refresh + /auth/me) es async; si una navegación previa la
  // ABORTA (goto encadenados cancelan requests en vuelo), su catch limpia la sesión y
  // RutaProtegida cae a /login. La sesión sigue VÁLIDA en el backend (el refresh token no
  // rota), así que un reintento con la sesión ya tibia rehidrata bien. Hasta 3 intentos.
  // Señal POSITIVA de sesión activa: la barra autenticada (link "Ir al inicio",
  // LayoutPrincipal). En /login el logo es un <div> sin ese rol/nombre, así que este
  // wait distingue "autenticado en la app" de "caído a /login". Reintenta el goto si la
  // rehidratación se abortó y cayó a /login.
  const barra = page.getByRole('link', { name: 'Ir al inicio' });
  for (let intento = 1; intento <= 4; intento++) {
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
  jornadas: (p: Page) => irA(p, '/asistencia/jornadas'),
  revision: (p: Page) => irA(p, '/asistencia/revision'),
  cobros: (p: Page) => irA(p, '/asistencia/cobros'),
  plataforma: (p: Page) => irA(p, '/plataforma'),
};
