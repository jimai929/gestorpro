import { test, expect } from '@playwright/test';
import { requireWritesAllowed, requireAdmin } from '../helpers/env';
import { CLAVE_E2E, CLAVE_E2E_2 } from '../helpers/test-data';
import { goto } from '../helpers/nav';
import { crearEmpleado } from '../helpers/asistencia';
import { crearUsuarioConRol, loginConCambioForzado, irComoRol } from '../helpers/roles';

/**
 * @full — Permisos a nivel de OPERACIÓN (no solo "abre la página"). Verifica el modelo
 * REAL de permisos de gestión de empleados, confirmado por el backend
 * (`empleado.routes.ts`: POST/PUT `/empleados` = `soloGestion` → administrador Y supervisor;
 * QR/PIN = `soloAdmin`) y por la UI (`PantallaEmpleados` redirige a "/" si NO es gestión):
 *
 *  - administrador: gestiona todo (crea empleados).
 *  - supervisor: gestión AUTORIZADA — accede a /empleados y PUEDE desactivar; pero los
 *    secretos (QR / Reset PIN) son admin-only y NO se le ofrecen.
 *  - empleado: NO es gestión → la ruta /empleados lo REDIRIGE a "/" (no puede gestionarlos).
 *
 * (El 403 de GET admin-only —/usuarios— para supervisor y empleado lo cubre
 * `permisos-roles.spec.ts`; el 403 de API de PIN/QR para supervisor, `empleado-permisos.test.ts`
 * en el backend.)
 *
 * Datos e2e-*; NUNCA toca usuarios/empleados reales. Cada rol en contexto aislado.
 */
test.describe('@full — permisos a nivel de operación', () => {
  requireWritesAllowed();
  requireAdmin();

  test('admin: PUEDE crear un empleado e2e (gestión de tenant funciona)', async ({ page }) => {
    test.setTimeout(60_000);
    const emp = await crearEmpleado(page); // el helper ya afirma el éxito (modal QR)
    await goto.empleados(page);
    await expect(page.getByRole('row').filter({ hasText: emp.numero })).toBeVisible();
  });

  test('supervisor: gestión autorizada — PUEDE desactivar; NO ve los secretos admin-only', async ({ page, browser }) => {
    test.setTimeout(120_000);
    const emp = await crearEmpleado(page); // admin crea el empleado e2e objetivo
    const u = await crearUsuarioConRol(page, 'supervisor');

    const ctx = await browser.newContext(); // aislado: no toca el storageState del admin
    const sup = await ctx.newPage();
    try {
      await loginConCambioForzado(sup, u.email, CLAVE_E2E, CLAVE_E2E_2);
      // /empleados es gestión (admin/supervisor): el supervisor SÍ entra (no lo redirige).
      expect(await irComoRol(sup, '/empleados')).toBe('/empleados');

      const fila = sup.getByRole('row').filter({ hasText: emp.numero });
      await expect(fila).toBeVisible();
      await expect(fila.getByText('Activo', { exact: true })).toBeVisible();

      // Los SECRETOS (QR / Reset PIN) son admin-only: al supervisor no se le ofrecen.
      await expect(fila.getByRole('button', { name: 'QR', exact: true })).toHaveCount(0);
      await expect(fila.getByRole('button', { name: 'Reset PIN', exact: true })).toHaveCount(0);

      // Desactivar es gestión (admin+supervisor): la acción SÍ se aplica (autorizada).
      await fila.getByRole('button', { name: 'Desactivar', exact: true }).click();
      // No hay banner de permiso; tras aplicarse, el empleado queda Inactivo en la lista.
      await expect(sup.getByText('No tiene permiso para esta operación.')).toHaveCount(0);
      await expect(
        sup.getByRole('row').filter({ hasText: emp.numero }).getByText('Inactivo', { exact: true }),
      ).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('empleado: la ruta /empleados lo REDIRIGE a "/" (gestión = admin/supervisor)', async ({ page, browser }) => {
    test.setTimeout(120_000);
    const u = await crearUsuarioConRol(page, 'empleado');

    const ctx = await browser.newContext();
    const e = await ctx.newPage();
    try {
      await loginConCambioForzado(e, u.email, CLAVE_E2E, CLAVE_E2E_2);
      // PantallaEmpleados: `if (!puedeGestionar) return <Navigate to="/" />` → el empleado
      // no llega a la pantalla de gestión (no puede desactivar a nadie por UI).
      expect(await irComoRol(e, '/empleados')).toBe('/');
    } finally {
      await ctx.close();
    }
  });

  test('empleado: las pantallas soloGestion de finanzas degradan con error VISIBLE y sin acciones', async ({ page, browser }) => {
    test.setTimeout(120_000);
    const u = await crearUsuarioConRol(page, 'empleado');

    const ctx = await browser.newContext();
    const e = await ctx.newPage();
    try {
      await loginConCambioForzado(e, u.email, CLAVE_E2E, CLAVE_E2E_2);

      // El sidebar NO ofrece los destinos de gestión (gating 2026-07-23)…
      await irComoRol(e, '/dashboard');
      await expect(e.getByRole('link', { name: 'Flujo de caja' })).toHaveCount(0);
      await expect(e.getByRole('link', { name: 'Auditoría financiera' })).toHaveCount(0);
      // …ni el dashboard le ofrece registrar un cierre (backend soloGestion).
      await expect(e.getByRole('button', { name: /Registrar cierre/ })).toHaveCount(0);

      // Tecleando la URL a mano: la página carga (no crashea) y la carga de
      // datos muestra el 403 del backend como error visible, no pantalla vacía.
      await irComoRol(e, '/auditoria-financiera');
      await expect(e.getByText('No tiene permiso para esta operación.').first()).toBeVisible();

      // Flujo de caja tiene su propio gate de UI con mensaje amable (no el 403 crudo).
      await irComoRol(e, '/finanzas/flujo-caja');
      await expect(e.getByText('No tienes acceso al flujo de caja.')).toBeVisible();

      // CxP: puede CONSULTAR la lista, pero sin acciones de gestión.
      await irComoRol(e, '/cuentas-por-pagar');
      await expect(e.getByRole('button', { name: /Registrar factura/ })).toHaveCount(0);
      await expect(e.getByRole('button', { name: 'Abonar' })).toHaveCount(0);
      await expect(e.getByRole('link', { name: 'Planificar pagos' })).toHaveCount(0);
    } finally {
      await ctx.close();
    }
  });
});
