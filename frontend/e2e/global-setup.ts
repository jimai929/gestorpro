import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { env, STORAGE_STATE } from './helpers/env';

/**
 * Global setup: inicia sesión UNA vez con el admin de tenant y guarda el estado
 * (localStorage con el refresh token) en STORAGE_STATE, para que TODOS los tests
 * arranquen ya autenticados. Esto elimina la carrera de rehidratación por-test: con el
 * refresh token ya en localStorage, `ContextoAuth` rehidrata la sesión en cada carga y
 * `RutaProtegida` muestra <Cargando/> hasta que termina (no redirige a /login).
 *
 * Si faltan credenciales, escribe un estado VACÍO (sin sesión): los specs con
 * `requireAdmin()` se skipean solos, así que la corrida no rompe por falta de auth.
 */
export default async function globalSetup(): Promise<void> {
  mkdirSync(dirname(STORAGE_STATE), { recursive: true });

  // Sin credenciales → estado vacío; los @full/@readonly con requireAdmin se skipean.
  if (!env.adminEmail || !env.adminPassword) {
    const browser = await chromium.launch();
    const ctx = await browser.newContext();
    await ctx.storageState({ path: STORAGE_STATE });
    await browser.close();
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL: env.baseURL });
  try {
    await page.goto('/login');
    await page.locator('#email').fill(env.adminEmail);
    await page.locator('#password').fill(env.adminPassword);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    // Espera a salir de /login Y a que la barra autenticada esté montada (sesión firme).
    await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
    await page.waitForLoadState('networkidle');
    // Persistir localStorage (incluye el refresh token) + cookies.
    await page.context().storageState({ path: STORAGE_STATE });
  } finally {
    await browser.close();
  }
}
