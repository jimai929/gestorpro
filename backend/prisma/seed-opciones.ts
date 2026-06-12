/**
 * Opciones del seed resueltas desde el entorno. Funciones PURAS (reciben el
 * entorno, no leen `process.env`) para poder probarlas sin tocar la base.
 */

/** Contraseña del admin inicial SOLO para desarrollo/demo. En prod es obligatoria. */
export const PASSWORD_ADMIN_DEV = 'Admin1234*';

/**
 * ¿Sembrar datos de demostración? `SEED_DEMO` explícito manda ('true'/'false');
 * si no está, se infiere del entorno: SÍ en desarrollo, NO en producción.
 */
export function demoHabilitado(env: { SEED_DEMO?: string; NODE_ENV?: string }): boolean {
  if (env.SEED_DEMO !== undefined) return env.SEED_DEMO === 'true';
  return env.NODE_ENV !== 'production';
}

/**
 * Resuelve la contraseña del admin inicial. En modo producción (sin datos demo)
 * DEBE venir de `ADMIN_PASSWORD` — no se cae a un default débil; en
 * desarrollo/demo se usa la contraseña por defecto si no se define.
 */
export function resolverPasswordAdmin(env: { ADMIN_PASSWORD?: string }, demoOn: boolean): string {
  if (env.ADMIN_PASSWORD) return env.ADMIN_PASSWORD;
  if (!demoOn) {
    throw new Error(
      'Falta ADMIN_PASSWORD: en modo producción (sin datos demo) la contraseña del ' +
        'administrador inicial debe definirse explícitamente.',
    );
  }
  return PASSWORD_ADMIN_DEV;
}
