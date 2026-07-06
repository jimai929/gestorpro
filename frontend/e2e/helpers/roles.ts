import { expect, type Page } from '@playwright/test';
import { login } from './auth';
import { goto } from './nav';
import { nuevoUsuario } from './test-data';

/**
 * Helpers para probar PERMISOS por rol. Crean usuarios `e2e-*` de tenant, resuelven el
 * cambio de contraseña FORZADO del primer login (POST /usuarios crea con
 * `debeCambiarContrasena=true`), y navegan tolerando la carrera de rehidratación de las
 * sesiones "frías" (contextos nuevos, sin el storageState calentado del admin).
 * Sin data-testid: role/name/label/texto (español) + ids estables.
 */

/** Crea un usuario `e2e-*` con el rol dado usando la sesión de admin (storageState). */
export async function crearUsuarioConRol(pageAdmin: Page, rol: 'supervisor' | 'empleado' | 'administrador') {
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
 * Inicia sesión como un rol recién creado: login con la clave inicial → resuelve el cambio
 * de contraseña FORZADO → re-login con la clave nueva → sesión desbloqueada.
 */
export async function loginConCambioForzado(page: Page, email: string, iniPass: string, nuevaPass: string) {
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
export async function irComoRol(page: Page, ruta: string): Promise<string> {
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
