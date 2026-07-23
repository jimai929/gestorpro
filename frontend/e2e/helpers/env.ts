import { test } from '@playwright/test';
import { join } from 'node:path';

/** Ruta del estado de sesión guardado por global-setup (localStorage con el refresh token). */
export const STORAGE_STATE = join(process.cwd(), 'e2e', '.auth', 'state.json');

/**
 * Lectura y validación del entorno E2E + BARRERA DE SEGURIDAD de escritura.
 *
 * Regla de oro (§2 del encargo): PRODUCCIÓN es SOLO LECTURA. Ninguna prueba puede
 * crear/editar/borrar/resetear/cambiar dinero o salarios contra producción. La
 * escritura (specs @full) exige TRES condiciones simultáneas:
 *   1. E2E_MODE != 'production'
 *   2. E2E_ALLOW_WRITES === 'true'
 *   3. Las URLs destino (E2E_BASE_URL y E2E_API_URL) son de host LOCAL, o están
 *      explícitamente en la allowlist E2E_WRITE_HOSTS (hosts separados por coma).
 * Si falta cualquiera, los specs @full se AUTO-SKIPEAN (fail-safe: por defecto NO escribe).
 *
 * La condición 3 cierra el agujero de confiar solo en el E2E_MODE DECLARADO: correr el
 * smoke contra prod (E2E_BASE_URL=https://app.gestorpro.us) y luego, en la misma shell,
 * lanzar los @full con E2E_ALLOW_WRITES=true sin cambiar E2E_MODE habría escrito contra
 * producción. Ahora una URL no-local sin allowlist bloquea la escritura SIEMPRE,
 * declare lo que declare E2E_MODE (fail-closed).
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

/** true si el hostname de `url` es local (localhost / loopback / *.localhost). */
function esHostLocal(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost')
  );
}

/**
 * ¿Se permite ESCRIBIR contra estas URLs? Puro y exportado para poder testearlo:
 * ambas URLs deben ser de host local o estar en la allowlist explícita. Una URL
 * malformada NUNCA es escribible (fail-closed).
 */
export function sonUrlsEscribibles(
  baseURL: string,
  apiURL: string,
  allowlist: readonly string[],
): boolean {
  const esEscribible = (url: string): boolean => {
    let hostname: string;
    try {
      hostname = new URL(url).hostname.toLowerCase();
    } catch {
      return false; // URL malformada ⇒ no se escribe
    }
    return esHostLocal(hostname) || allowlist.includes(hostname);
  };
  return esEscribible(baseURL) && esEscribible(apiURL);
}

/** Allowlist explícita de hosts escribibles (staging): E2E_WRITE_HOSTS="a.com,b.com". */
const hostsEscribibles = (process.env.E2E_WRITE_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean);

/** true si las URLs destino admiten escritura (local o allowlist). */
export const urlsEscribibles = sonUrlsEscribibles(env.baseURL, env.apiURL, hostsEscribibles);

/**
 * ¿Está PERMITIDO escribir? Solo si NO es producción, el flag explícito está en true
 * Y las URLs destino son escribibles (condición 3: la URL manda sobre el modo
 * declarado). Fail-safe: cualquier ambigüedad ⇒ false (no se escribe).
 */
export const writesAllowed = !isProduction && env.allowWrites && urlsEscribibles;

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
  let motivo: string;
  if (isProduction) {
    motivo = 'BLOQUEADO: E2E_MODE=production es SOLO LECTURA (ningún @full escribe en producción).';
  } else if (!urlsEscribibles) {
    motivo =
      'BLOQUEADO: E2E_BASE_URL/E2E_API_URL apuntan a un host NO local (se trata como producción). ' +
      'Para staging escribible, añade sus hosts a E2E_WRITE_HOSTS.';
  } else {
    motivo = 'Escritura deshabilitada: exporta E2E_ALLOW_WRITES=true (solo dev/staging) para correr los @full.';
  }
  test.skip(!writesAllowed, motivo);
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
