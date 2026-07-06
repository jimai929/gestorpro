import { expect, type Page } from '@playwright/test';

/**
 * Helpers de sesión. Los selectores usan ids estables (#email/#password, no
 * dependientes del idioma) y el rol del botón. El proyecto NO tiene data-testid, así
 * que el resto de la suite usa role/name/text (español, el idioma por defecto).
 */

/** Inicia sesión y espera a salir de /login (a "/" o, para super-admin, a "/plataforma"). */
export async function login(page: Page, email: string, password: string): Promise<void> {
  await page.goto('/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(password);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  // Login correcto navega fuera de /login; un fallo deja el 401 visible en /login.
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15_000 });
}

/** Afirma que hay sesión activa: NO estamos en /login y la barra principal está montada. */
export async function assertLoggedIn(page: Page): Promise<void> {
  expect(new URL(page.url()).pathname).not.toBe('/login');
  // La marca de la app (logo/título en la barra) confirma que renderizó autenticado.
  await expect(page.getByText('GestorPro').first()).toBeVisible();
}

/** Cierra sesión desde el menú de la barra superior. Best-effort (no rompe si cambia el label). */
export async function logout(page: Page): Promise<void> {
  const salir = page.getByRole('button', { name: /cerrar sesión|salir|logout/i });
  if (await salir.count()) {
    await salir.first().click();
    await page.waitForURL((url) => url.pathname.startsWith('/login'), { timeout: 10_000 });
  }
}
