import { test, expect } from '@playwright/test';
import { requireAdmin } from '../helpers/env';
import { goto } from '../helpers/nav';

/**
 * @readonly — Estructura de las páginas de NEGOCIO (finanzas + asistencia). La sesión la
 * pre-carga global-setup (storageState). `irA()` ya afirma que cada página NO cae a
 * /login y que estamos en la ruta pedida (elimina el falso-verde previo, que pasaba
 * incluso redirigido a /login). Aquí se refuerza: barra montada, algún control y sin
 * error boundary — SIN escribir nada. Andamiaje para los flujos de ESCRITURA de negocio
 * (Phase 2: crear gasto/compra/venta, fichaje→jornada→salario; requieren datos sembrados).
 */
test.describe('@readonly — estructura de páginas de negocio', () => {
  requireAdmin();

  const paginas: Array<{ nombre: string; ir: (p: import('@playwright/test').Page) => Promise<void> }> = [
    { nombre: 'dashboard', ir: goto.dashboard },
    { nombre: 'gastos', ir: goto.gastos },
    { nombre: 'cuentas por pagar', ir: goto.cuentasPorPagar },
    { nombre: 'proveedores', ir: goto.proveedores },
    { nombre: 'sedes', ir: goto.sedes },
    { nombre: 'empleados', ir: goto.empleados },
    { nombre: 'kioscos', ir: goto.kioscos },
    { nombre: 'jornadas', ir: goto.jornadas },
    { nombre: 'revisión', ir: goto.revision },
    { nombre: 'cobros', ir: goto.cobros },
  ];

  for (const { nombre, ir } of paginas) {
    test(`${nombre}: carga con la barra montada, algún control interactivo y SIN error de aplicación`, async ({ page }) => {
      await ir(page);
      // Barra principal (marca de la app) → renderizó autenticado.
      await expect(page.getByText('GestorPro').first()).toBeVisible();
      // Sin error boundary del router.
      await expect(page.getByText(/Unexpected Application Error/i)).toHaveCount(0);
      // Al menos un control interactivo (botón o enlace de navegación): la página no
      // quedó en blanco. (Read-only: NO se hace click en nada que guarde.)
      const interactivos = page.getByRole('button').or(page.getByRole('link'));
      expect(await interactivos.count()).toBeGreaterThan(0);
    });
  }
});
