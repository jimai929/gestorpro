import { test, expect } from '@playwright/test';
import { requireWritesAllowed, requireAdmin } from '../helpers/env';
import { CLAVE_E2E, CLAVE_E2E_2 } from '../helpers/test-data';
import { goto } from '../helpers/nav';
import { crearEmpleado } from '../helpers/asistencia';
import { crearUsuarioConRol, loginConCambioForzado, irComoRol } from '../helpers/roles';

/**
 * @full — Permisos a nivel de OPERACIÓN (no solo "abre la página"). Verifica que una
 * operación de ESCRITURA admin-only, disparada por un rol no autorizado, es rechazada por
 * el BACKEND con 403 "No tiene permiso para esta operación.", y que NO produce efecto.
 *
 * Superficie elegida (por su limpieza): `/empleados`. GET /empleados es solo `autenticado`
 * (no admin-only), así que supervisor y empleado CARGAN la tabla y VEN los botones de
 * acción (Editar/Desactivar/QR/PIN son ESTÁTICOS, sin gate de rol en la UI). Al pulsar
 * "Desactivar" (PUT /empleados/:id, admin-only) el backend responde 403 → banner de error;
 * el empleado sigue "Activo" (la operación no se aplicó). Como la lista NO da error al
 * cargar (no es admin-only), el mensaje 403 aparece SOLO tras la acción → assert sin ruido.
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

  test('supervisor: DESACTIVAR un empleado (admin-only) → 403; el empleado sigue Activo', async ({ page, browser }) => {
    test.setTimeout(120_000);
    const emp = await crearEmpleado(page); // admin crea el empleado e2e objetivo
    const u = await crearUsuarioConRol(page, 'supervisor');

    const ctx = await browser.newContext(); // aislado: no toca el storageState del admin
    const sup = await ctx.newPage();
    try {
      await loginConCambioForzado(sup, u.email, CLAVE_E2E, CLAVE_E2E_2);
      expect(await irComoRol(sup, '/empleados')).toBe('/empleados');

      const fila = sup.getByRole('row').filter({ hasText: emp.numero });
      await expect(fila).toBeVisible();
      await expect(fila.getByText('Activo', { exact: true })).toBeVisible();

      // El botón es visible (estático); al enviar, el backend rechaza con 403.
      await fila.getByRole('button', { name: 'Desactivar', exact: true }).click();
      await expect(sup.getByText('No tiene permiso para esta operación.')).toBeVisible();
      // El banner de error de acción OCULTA la tabla (PantallaEmpleados solo la pinta con
      // !errorCarga). Recargamos para confirmar SIN EFECTO: el empleado sigue Activo.
      expect(await irComoRol(sup, '/empleados')).toBe('/empleados');
      await expect(
        sup.getByRole('row').filter({ hasText: emp.numero }).getByText('Activo', { exact: true }),
      ).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('empleado: DESACTIVAR un empleado (admin-only) → 403; el empleado sigue Activo', async ({ page, browser }) => {
    test.setTimeout(120_000);
    const emp = await crearEmpleado(page);
    const u = await crearUsuarioConRol(page, 'empleado');

    const ctx = await browser.newContext();
    const e = await ctx.newPage();
    try {
      await loginConCambioForzado(e, u.email, CLAVE_E2E, CLAVE_E2E_2);
      expect(await irComoRol(e, '/empleados')).toBe('/empleados');

      const fila = e.getByRole('row').filter({ hasText: emp.numero });
      await expect(fila).toBeVisible();
      await expect(fila.getByText('Activo', { exact: true })).toBeVisible();

      await fila.getByRole('button', { name: 'Desactivar', exact: true }).click();
      await expect(e.getByText('No tiene permiso para esta operación.')).toBeVisible();
      // El banner de error oculta la tabla; recargar confirma SIN EFECTO (sigue Activo).
      expect(await irComoRol(e, '/empleados')).toBe('/empleados');
      await expect(
        e.getByRole('row').filter({ hasText: emp.numero }).getByText('Activo', { exact: true }),
      ).toBeVisible();
    } finally {
      await ctx.close();
    }
  });
});
