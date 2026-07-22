import { test, expect } from '@playwright/test';
import { requireWritesAllowed, requireAdmin } from '../helpers/env';
import { goto } from '../helpers/nav';
import { CLAVE_E2E, CLAVE_E2E_2 } from '../helpers/test-data';
import { crearUsuarioConRol, loginConCambioForzado, irComoRol } from '../helpers/roles';

/**
 * @full — PERMISOS por rol (administrador / supervisor / empleado). ESCRIBE datos: crea
 * usuarios `e2e-*` con rol y los usa para iniciar sesión. Se AUTO-SKIPEA sin permiso de
 * escritura. NUNCA toca usuarios reales.
 *
 * COMPORTAMIENTO REAL verificado (código + observación en dev), NO asumido:
 *   - El FRONTEND guarda `/plataforma` (RutaSoloPlataforma → cualquier NO super-admin es
 *     redirigido a `/`) y `/empleados` (PantallaEmpleados: `Navigate to="/"` si no es
 *     gestión). Desde 2026-07-21 además OCULTA por rol las acciones/enlaces de gestión
 *     (registrar gasto/cierre/factura, abonar, plan-pagos, cola de revisión), pero las
 *     demás páginas CARGAN para cualquier rol; la frontera real sigue siendo el BACKEND.
 *   - `/usuarios` es admin-only en el backend (GET /usuarios → 403 para no-admin). La
 *     página monta igual (h1 "Usuarios" + botón "+ Crear usuario" son estáticos), pero la
 *     carga de datos falla y se muestra el error "No tiene permiso para esta operación.".
 *   - supervisor y empleado SÍ pueden VER /empleados y /asistencia/jornadas (no admin-only).
 *   - POST /usuarios crea con `debeCambiarContrasena=true`: el primer login de un rol nuevo
 *     exige cambio de contraseña forzado antes de entrar (se resuelve en el helper).
 *
 * Aislamiento: cada rol se prueba en un CONTEXTO nuevo (browser.newContext()), sin tocar
 * el storageState del admin. La navegación tolera la carrera de rehidratación (cold session).
 * Helpers de rol compartidos en e2e/helpers/roles.ts.
 */

test.describe('@full — permisos por rol', () => {
  requireWritesAllowed();
  requireAdmin();

  test('admin: accede a /empleados, /usuarios (con datos, sin 403) y /asistencia/jornadas', async ({ page }) => {
    await goto.empleados(page);
    await expect(page.getByRole('heading', { name: 'Empleados' })).toBeVisible();

    await goto.usuarios(page);
    await expect(page.getByRole('heading', { name: 'Usuarios' })).toBeVisible();
    await expect(page.getByRole('button', { name: '+ Crear usuario' })).toBeVisible();
    // El admin SÍ tiene permiso: NO aparece el 403 de gestión de usuarios.
    await expect(page.getByText('No tiene permiso para esta operación.')).toHaveCount(0);

    await goto.jornadas(page);
    await expect(page.getByRole('heading', { name: 'Jornadas' })).toBeVisible();
  });

  test('supervisor: /plataforma redirige a inicio; /usuarios da 403; SÍ ve /empleados y /jornadas', async ({ page, browser }) => {
    test.setTimeout(120_000);
    const u = await crearUsuarioConRol(page, 'supervisor');

    const ctx = await browser.newContext(); // contexto aislado: no toca el storageState del admin
    const rol = await ctx.newPage();
    try {
      await loginConCambioForzado(rol, u.email, CLAVE_E2E, CLAVE_E2E_2);

      // Límite DURO del frontend: /plataforma → redirige a inicio (no super-admin).
      expect(await irComoRol(rol, '/plataforma')).toBe('/');

      // /usuarios es admin-only en backend: la página monta, pero muestra el 403 de datos.
      expect(await irComoRol(rol, '/usuarios')).toBe('/usuarios');
      await expect(rol.getByText('No tiene permiso para esta operación.')).toBeVisible();

      // NO admin-only: supervisor SÍ puede VER estas páginas (comportamiento real).
      expect(await irComoRol(rol, '/empleados')).toBe('/empleados');
      await expect(rol.getByRole('heading', { name: 'Empleados' })).toBeVisible();
      expect(await irComoRol(rol, '/asistencia/jornadas')).toBe('/asistencia/jornadas');
      await expect(rol.getByRole('heading', { name: 'Jornadas' })).toBeVisible();
    } finally {
      await ctx.close();
    }
  });

  test('empleado: /plataforma redirige a inicio; /usuarios da 403 (no es admin)', async ({ page, browser }) => {
    test.setTimeout(120_000);
    const u = await crearUsuarioConRol(page, 'empleado');

    const ctx = await browser.newContext();
    const rol = await ctx.newPage();
    try {
      await loginConCambioForzado(rol, u.email, CLAVE_E2E, CLAVE_E2E_2);

      // Mismo límite de plataforma que cualquier no super-admin.
      expect(await irComoRol(rol, '/plataforma')).toBe('/');

      // Gestión de usuarios es admin-only: el empleado ve el 403.
      expect(await irComoRol(rol, '/usuarios')).toBe('/usuarios');
      await expect(rol.getByText('No tiene permiso para esta operación.')).toBeVisible();
      // NOTA: /empleados SÍ está bloqueado por rol en el frontend (PantallaEmpleados
      // redirige a "/" si no es gestión; cubierto en permisos-operaciones.spec.ts).
      // Aquí se afirma el límite de plataforma + el 403 de /usuarios.
    } finally {
      await ctx.close();
    }
  });
});
