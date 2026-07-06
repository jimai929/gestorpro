import { test, expect, type Page } from '@playwright/test';
import { requireWritesAllowed, requireAdmin } from '../helpers/env';
import { login } from '../helpers/auth';
import { goto } from '../helpers/nav';
import { CLAVE_E2E, CLAVE_E2E_2, nuevoUsuario } from '../helpers/test-data';

/**
 * @full — PERMISOS por rol (administrador / supervisor / empleado). ESCRIBE datos: crea
 * usuarios `e2e-*` con rol y los usa para iniciar sesión. Se AUTO-SKIPEA sin permiso de
 * escritura. NUNCA toca usuarios reales.
 *
 * COMPORTAMIENTO REAL verificado (código + observación en dev), NO asumido:
 *   - El FRONTEND solo guarda `/plataforma` (RutaSoloPlataforma → cualquier NO super-admin
 *     es redirigido a `/`). NO restringe /empleados, /usuarios ni /asistencia/* por rol de
 *     tenant: esas páginas CARGAN para cualquier rol; la frontera real es el BACKEND.
 *   - `/usuarios` es admin-only en el backend (GET /usuarios → 403 para no-admin). La
 *     página monta igual (h1 "Usuarios" + botón "+ Crear usuario" son estáticos), pero la
 *     carga de datos falla y se muestra el error "No tiene permiso para esta operación.".
 *   - supervisor y empleado SÍ pueden VER /empleados y /asistencia/jornadas (no admin-only).
 *   - POST /usuarios crea con `debeCambiarContrasena=true`: el primer login de un rol nuevo
 *     exige cambio de contraseña forzado antes de entrar (se resuelve en el helper).
 *
 * Aislamiento: cada rol se prueba en un CONTEXTO nuevo (browser.newContext()), sin tocar
 * el storageState del admin. La navegación tolera la carrera de rehidratación (cold session).
 */

/** Crea un usuario `e2e-*` con el rol dado, usando la sesión de admin (storageState). */
async function crearUsuarioConRol(pageAdmin: Page, rol: 'supervisor' | 'empleado') {
  const u = nuevoUsuario(rol);
  await goto.usuarios(pageAdmin);
  await pageAdmin.getByRole('button', { name: '+ Crear usuario' }).click();
  await pageAdmin.getByLabel('Nombre *').fill(u.nombre);
  await pageAdmin.getByLabel('Correo electrónico *').fill(u.email);
  await pageAdmin.getByLabel('Contraseña temporal *').fill(u.password);
  await pageAdmin.getByLabel('Rol *').selectOption(rol);
  await pageAdmin.getByRole('button', { name: 'Crear usuario' }).click();
  await expect(pageAdmin.getByText('Usuario creado')).toBeVisible();
  return u;
}

/**
 * Inicia sesión como un rol recién creado: login con la clave inicial → resuelve el
 * cambio de contraseña FORZADO → re-login con la clave nueva → sesión desbloqueada.
 */
async function loginConCambioForzado(page: Page, email: string, iniPass: string, nuevaPass: string) {
  await login(page, email, iniPass); // la URL sale de /login pero RutaProtegida muestra el diálogo forzado
  const dlg = page.getByRole('dialog');
  await dlg.getByLabel('Contraseña actual').fill(iniPass);
  await dlg.getByLabel('Nueva contraseña', { exact: true }).fill(nuevaPass); // "Confirmar nueva contraseña" también contiene "Nueva contraseña"
  await dlg.getByLabel('Confirmar nueva contraseña').fill(nuevaPass);
  await dlg.getByRole('button', { name: 'Cambiar contraseña' }).click();
  await dlg.getByRole('button', { name: 'Ir a iniciar sesión' }).click();
  await page.waitForURL((u) => u.pathname.startsWith('/login'));
  await login(page, email, nuevaPass); // sesión con debeCambiarContrasena=false
}

/**
 * Navega a `ruta` en una sesión de rol y devuelve el PATHNAME final tras rehidratar y tras
 * los guards. Tolera la carrera de rehidratación (cold session, full reload → /login): si
 * cae a /login reintenta el goto. Un pathname distinto de la ruta pedida es un REDIRECT de
 * guard (p. ej. /plataforma → /).
 */
async function irComoRol(page: Page, ruta: string): Promise<string> {
  let pathname = '';
  for (let i = 0; i < 4; i++) {
    await page.goto(ruta);
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForTimeout(800); // deja resolver un posible redirect de guard
    pathname = new URL(page.url()).pathname;
    if (pathname !== '/login') return pathname;
    await page.waitForTimeout(1000); // fue la carrera de rehidratación: reintentar
  }
  return pathname;
}

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
      // NOTA (comportamiento real, honesto): el frontend NO bloquea /empleados por rol;
      // el empleado PUEDE ver /empleados (GET /empleados no es admin-only). Ese caso lo
      // documenta docs/E2E_VISIBLE_TESTS.md; aquí se afirma el límite REAL (plataforma + 403).
    } finally {
      await ctx.close();
    }
  });
});
