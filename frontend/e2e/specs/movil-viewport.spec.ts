import { test, expect, type Page } from '@playwright/test';
import { requireAdmin } from '../helpers/env';
import { irComoRol } from '../helpers/roles';

/**
 * Abre `ruta` de forma robusta frente a la carrera de rehidratación del backend dev de
 * una sola instancia (documentada en E2E_VISIBLE_TESTS §setup): primero CALIENTA la sesión
 * en una página ligera ("/") y luego reintenta la ruta objetivo (páginas pesadas como
 * flujo-caja cargan muchos datos y su rehidratación puede competir bajo carga y caer a
 * /login). Devuelve el pathname final.
 */
async function abrirMovil(page: Page, ruta: string): Promise<string> {
  await irComoRol(page, '/').catch(() => '');
  let pathname = '';
  for (let intento = 0; intento < 3; intento++) {
    pathname = await irComoRol(page, ruta);
    if (pathname === ruta) return pathname;
  }
  return pathname;
}

/**
 * @readonly — Layout MÓVIL. Carga las páginas clave en viewports de teléfono
 * (390×844 y 360×740) con la sesión de admin pre-cargada (storageState) y verifica que:
 *   1. renderizan en la ruta pedida (no caen a /login), y
 *   2. no muestran el error boundary del router, y
 *   3. NO desbordan horizontalmente — el documento no scrollea de lado. Un
 *      `scrollWidth > clientWidth` a nivel de documento delata un layout roto en móvil
 *      (las tablas anchas deben scrollear DENTRO de su contenedor `overflow-x`, no el body).
 *
 * Solo lectura: navega, no escribe nada. `irComoRol` tolera la carrera de rehidratación.
 */
const VIEWPORTS = [
  { nombre: '390x844 (iPhone)', width: 390, height: 844 },
  { nombre: '360x740 (Android compacto)', width: 360, height: 740 },
];

// Páginas clave de negocio (finanzas + asistencia + administración) que un usuario
// de tenant abre en el móvil.
const RUTAS = [
  '/dashboard',
  '/finanzas/flujo-caja',
  '/cuentas-por-pagar',
  '/gastos',
  '/empleados',
  '/asistencia/cobros',
];

for (const vp of VIEWPORTS) {
  test.describe(`@readonly — layout móvil ${vp.nombre}`, () => {
    requireAdmin();
    test.use({ viewport: { width: vp.width, height: vp.height } });

    for (const ruta of RUTAS) {
      test(`${ruta} renderiza sin desbordamiento horizontal`, async ({ page }) => {
        expect(await abrirMovil(page, ruta)).toBe(ruta); // autenticado en la ruta (no /login)
        await expect(page.getByText(/Unexpected Application Error/i)).toHaveCount(0);

        // Desbordamiento horizontal a nivel de documento (1px de tolerancia por redondeos).
        const desborde = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(desborde, `desbordamiento horizontal de ${desborde}px en ${ruta}`).toBeLessThanOrEqual(1);
      });
    }
  });
}
