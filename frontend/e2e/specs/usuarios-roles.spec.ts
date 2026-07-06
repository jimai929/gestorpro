import { test, expect } from '@playwright/test';
import { env, requireWritesAllowed, requireAdmin } from '../helpers/env';
import { goto } from '../helpers/nav';
import { nuevoUsuario } from '../helpers/test-data';

/**
 * @full — Gestión de usuarios y roles del tenant (M3a/M3b). ESCRIBE datos: crea usuarios
 * (con prefijo e2e-) y cambia roles. Se AUTO-SKIPEA si no hay permiso de escritura
 * (producción o sin E2E_ALLOW_WRITES=true). Requiere una cuenta de admin de tenant.
 *
 * Cubre: alta de empleado y de supervisor, que la lista muestra "Supervisor" (no
 * administrador), el cambio de rol vía el select, que la propia fila NO ofrece cambio de
 * rol (anti auto-degradación) y que solo aparecen roles internos de empresa (nunca
 * plataforma/root/esSuperAdmin).
 */
test.describe('@full — usuarios y roles del tenant', () => {
  requireWritesAllowed();
  requireAdmin();

  // Sesión pre-cargada por global-setup (storageState). Cada test parte en /usuarios.
  test.beforeEach(async ({ page }) => {
    await goto.usuarios(page);
  });

  /** Abre el formulario, rellena y crea; deja la vista de éxito "Usuario creado". */
  async function crearUsuario(page: import('@playwright/test').Page, rol: 'empleado' | 'supervisor' | 'administrador') {
    const u = nuevoUsuario(rol);
    await page.getByRole('button', { name: '+ Crear usuario' }).click();
    await page.getByLabel('Nombre *').fill(u.nombre);
    await page.getByLabel('Correo electrónico *').fill(u.email);
    await page.getByLabel('Contraseña temporal *').fill(u.password);
    await page.getByLabel('Rol *').selectOption(rol);
    await page.getByRole('button', { name: 'Crear usuario' }).click();
    await expect(page.getByText('Usuario creado')).toBeVisible();
    return u;
  }

  test('el select de rol del alta ofrece SOLO roles internos de empresa (sin plataforma/root)', async ({ page }) => {
    await page.getByRole('button', { name: '+ Crear usuario' }).click();
    const opciones = page.getByLabel('Rol *').locator('option');
    await expect(opciones).toHaveText(['Administrador', 'Supervisor', 'Empleado']);
  });

  test('crea un empleado y luego un supervisor; la lista muestra "Supervisor" como rol propio', async ({ page }) => {
    await crearUsuario(page, 'empleado');
    // Volver a la lista y crear el supervisor.
    await goto.usuarios(page);
    const sup = await crearUsuario(page, 'supervisor');
    await goto.usuarios(page);

    // La fila del supervisor recién creado muestra su rol. Como admin, el rol es un
    // <select> (combobox "Cambiar rol") con value=supervisor en su fila.
    const fila = page.getByRole('row').filter({ hasText: sup.email });
    await expect(fila).toBeVisible();
    const selectRol = fila.getByRole('combobox', { name: 'Cambiar rol' });
    await expect(selectRol).toHaveValue('supervisor');
  });

  test('admin cambia el rol de un empleado a administrador vía el select (y persiste tras recargar)', async ({ page }) => {
    const emp = await crearUsuario(page, 'empleado');
    await goto.usuarios(page);
    const fila = page.getByRole('row').filter({ hasText: emp.email });
    await fila.getByRole('combobox', { name: 'Cambiar rol' }).selectOption('administrador');
    // El padre recarga tras el éxito; la fila debe reflejar el rol nuevo.
    await goto.usuarios(page);
    const filaTras = page.getByRole('row').filter({ hasText: emp.email });
    await expect(filaTras.getByRole('combobox', { name: 'Cambiar rol' })).toHaveValue('administrador');
  });

  test('la fila del PROPIO admin de la sesión NO ofrece el select de cambio de rol', async ({ page }) => {
    const fila = page.getByRole('row').filter({ hasText: env.adminEmail });
    // Puede no estar si el admin de sesión no aparece en su propia lista; si aparece,
    // NO debe tener el control de cambio de rol (anti auto-degradación).
    if (await fila.count()) {
      await expect(fila.first().getByRole('combobox', { name: 'Cambiar rol' })).toHaveCount(0);
    }
  });
});
