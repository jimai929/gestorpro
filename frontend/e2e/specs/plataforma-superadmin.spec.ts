import { test, expect } from '@playwright/test';
import { requireWritesAllowed, requireAdmin, requireSuperAdmin, env } from '../helpers/env';
import { login } from '../helpers/auth';
import { irComoRol } from '../helpers/roles';
import { nuevaEmpresa } from '../helpers/test-data';

/**
 * @full — PLATAFORMA / super-admin.
 *
 * DOS partes:
 *  1) Caso NEGATIVO (CORRE con el admin de tenant de global-setup): un admin de tenant es
 *     redirigido de /plataforma a "/" (RutaSoloPlataforma refuerza en UI; el backend
 *     responde 404 anti-enumeración con `soloPlataforma`).
 *  2) Flujo SUPER-ADMIN (requiere credenciales de super-admin): accede a /plataforma, ve la
 *     lista de empresas, crea una empresa `e2e-*` y la suspende↔reactiva (transición de
 *     estado REVERSIBLE y segura). NUNCA ejecuta "Cancelar empresa" (TERMINAL, irreversible)
 *     ni "Restablecer admin" (destruye sesiones): fuera del alcance seguro del E2E.
 *
 * ESTADO: hoy NO hay super-admin sembrado en dev local (backend/.env sin SUPER_ADMIN_EMAIL;
 * global-setup solo crea storageState de admin de tenant). Por eso la parte 2 va tras
 * `requireSuperAdmin()` y se AUTO-SKIPEA sin E2E_SUPERADMIN_EMAIL/PASSWORD + cuenta sembrada.
 * Es andamiaje LISTO (aún NO verificado en local por falta de cuenta). Ver docs §10.
 */
test.describe('@full — plataforma / super-admin', () => {
  requireWritesAllowed();

  test.describe('acceso denegado a NO super-admin', () => {
    requireAdmin();

    test('admin de tenant: /plataforma redirige a inicio (RutaSoloPlataforma)', async ({ page }) => {
      // El admin de tenant NO es super-admin → el guard lo devuelve a "/".
      expect(await irComoRol(page, '/plataforma')).toBe('/');
    });
  });

  test.describe('flujo super-admin (requiere credenciales de super-admin)', () => {
    requireSuperAdmin();

    test('super-admin: accede a /plataforma, ve empresas, crea una empresa e2e y la suspende↔reactiva', async ({ page }) => {
      test.setTimeout(120_000);

      // El super-admin es redirigido a /plataforma tras el login (RutaNegocio).
      await login(page, env.superAdminEmail, env.superAdminPassword);
      await expect(page.getByRole('heading', { name: 'Empresas' })).toBeVisible();

      // Crear empresa e2e: tenant nuevo AISLADO (no toca datos existentes), reversible por estado.
      const emp = nuevaEmpresa();
      await page.getByLabel('Nombre de la empresa').fill(emp.nombre);
      await page.getByLabel('Identificador (slug)').fill(emp.slug);
      await page.getByLabel('Nombre del administrador').fill(emp.adminNombre);
      await page.getByLabel('Correo del administrador').fill(emp.adminEmail);
      await page.getByLabel('Contraseña inicial').fill(emp.adminPassword);
      await page.getByRole('button', { name: 'Crear empresa' }).click();
      await expect(page.getByRole('heading', { name: 'Empresa creada' })).toBeVisible();

      // La empresa aparece en la lista (Actualizar refresca la tabla).
      await page.getByRole('button', { name: 'Actualizar' }).click();
      const fila = page.getByRole('row').filter({ hasText: emp.slug });
      await expect(fila).toBeVisible();
      await expect(fila.getByText('Activa', { exact: true })).toBeVisible();

      // SUSPENDER (reversible): dos clics (armar → confirmar).
      await fila.getByRole('button', { name: 'Suspender', exact: true }).click();
      await fila.getByRole('button', { name: '¿Confirmar suspensión?' }).click();
      await expect(fila.getByText('Suspendida', { exact: true })).toBeVisible();

      // REACTIVAR (vuelve a Activa). Fin del alcance SEGURO: no se cancela ni se resetea admin.
      await fila.getByRole('button', { name: 'Reactivar', exact: true }).click();
      await expect(fila.getByText('Activa', { exact: true })).toBeVisible();
    });
  });
});
