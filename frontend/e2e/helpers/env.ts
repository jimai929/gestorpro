import { test } from '@playwright/test';
import { join } from 'node:path';

/** Ruta del estado de sesión guardado por global-setup (localStorage con el refresh token). */
export const STORAGE_STATE = join(process.cwd(), 'e2e', '.auth', 'state.json');

/**
 * Lectura y validación del entorno E2E + BARRERA DE SEGURIDAD de escritura.
 *
 * Regla de oro (§2 del encargo): PRODUCCIÓN es SOLO LECTURA. Ninguna prueba puede
 * crear/editar/borrar/resetear/cambiar dinero o salarios contra producción. La
 * escritura (specs @full) exige DOS condiciones simultáneas:
 *   1. E2E_MODE != 'production'
 *   2. E2E_ALLOW_WRITES === 'true'
 * Si falta cualquiera, los specs @full se AUTO-SKIPEAN (fail-safe: por defecto NO escribe).
 */

type Modo = 'dev' | 'staging' | 'production';

function leerModo(): Modo {
  const m = (process.env.E2E_MODE ?? 'dev').toLowerCase();
  return m === 'production' || m === 'staging' ? m : 'dev';
}

export const env = {
  baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
  apiURL: process.env.E2E_API_URL ?? 'http://localhost:3000',
  modo: leerModo(),
  allowWrites: process.env.E2E_ALLOW_WRITES === 'true',
  adminEmail: process.env.E2E_ADMIN_EMAIL ?? '',
  adminPassword: process.env.E2E_ADMIN_PASSWORD ?? '',
  superAdminEmail: process.env.E2E_SUPERADMIN_EMAIL ?? '',
  superAdminPassword: process.env.E2E_SUPERADMIN_PASSWORD ?? '',
};

export const isProduction = env.modo === 'production';

/**
 * ¿Está PERMITIDO escribir? Solo si NO es producción Y el flag explícito está en true.
 * Fail-safe: cualquier ambigüedad ⇒ false (no se escribe).
 */
export const writesAllowed = !isProduction && env.allowWrites;

/**
 * Identificador único de la corrida: prefijo `e2e-YYYYMMDD-HHMMSS` para TODO dato de
 * prueba, de modo que sea fácilmente distinguible/limpiable y jamás colisione ni se
 * confunda con datos de clientes reales. Se calcula UNA vez por proceso.
 */
export const runId = (() => {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `e2e-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
})();

/**
 * Barrera para specs de ESCRITURA (@full). Colócala en el cuerpo del `describe`:
 *   test.describe('...', () => { requireWritesAllowed(); ... })
 * Si la escritura NO está permitida, TODOS los tests del bloque se marcan SKIP con el
 * motivo, en vez de correr y arriesgar mutar producción.
 */
export function requireWritesAllowed(): void {
  test.skip(
    !writesAllowed,
    isProduction
      ? 'BLOQUEADO: E2E_MODE=production es SOLO LECTURA (ningún @full escribe en producción).'
      : 'Escritura deshabilitada: exporta E2E_ALLOW_WRITES=true (solo dev/staging) para correr los @full.',
  );
}

/** Barrera para credenciales de admin de tenant (login de los @full de negocio). */
export function requireAdmin(): void {
  test.skip(
    !env.adminEmail || !env.adminPassword,
    'Faltan E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD.',
  );
}

/** Barrera para credenciales de super-admin de plataforma. */
export function requireSuperAdmin(): void {
  test.skip(
    !env.superAdminEmail || !env.superAdminPassword,
    'Faltan E2E_SUPERADMIN_EMAIL / E2E_SUPERADMIN_PASSWORD.',
  );
}
