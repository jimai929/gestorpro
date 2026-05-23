import argon2 from 'argon2';

/**
 * Hashea una contraseña en claro con argon2id. El hash resultante incluye la
 * sal y los parámetros de cómputo. NUNCA se almacena el texto plano.
 */
export function hashearContrasena(contrasena: string): Promise<string> {
  return argon2.hash(contrasena, { type: argon2.argon2id });
}

/** Verifica una contraseña contra su hash almacenado. `true` si coincide. */
export function verificarContrasena(
  hash: string,
  contrasena: string,
): Promise<boolean> {
  return argon2.verify(hash, contrasena);
}
