import type { Rol } from '../../generated/prisma/enums.js';

/** Datos del usuario que viajan al cliente. Sin hash ni secretos. */
export interface UsuarioPublico {
  id: string;
  nombre: string;
  email: string;
  /** Rol efectivo en la empresa activa. */
  rol: Rol;
  /**
   * Empresa activa. SOLO para mostrar en el front: el aislamiento del backend
   * NUNCA confía en un `empresaId` que venga del cliente; sale del token/sesión
   * (misma regla que `usuarioId`).
   */
  empresaId: string | null;
  esSuperAdmin: boolean;
  /** true si la cuenta tiene una contraseña temporal y debe rotarla antes de operar. */
  debeCambiarContrasena: boolean;
}

/** Contenido firmado dentro del access token. No lleva datos sensibles. */
export interface PayloadAccess {
  sub: string;
  /** Rol EFECTIVO en la empresa activa (de la membresía), no el global. */
  rol: Rol;
  /** Empresa activa de ESTE token. `null` solo para super-admin sin empresa activa. */
  empresaId: string | null;
  /** Operador de plataforma. Su poder viene de aquí, no del `rol`. */
  esSuperAdmin: boolean;
  /**
   * true si debe cambiar la contraseña: el guard bloquea todo salvo /auth/* (Commit 2).
   * OPCIONAL: login/refresh SIEMPRE lo emiten, pero un token viejo (emitido antes de este
   * deploy) puede no traerlo → se trata como `false` (no se bloquea; evita lockout en deploy).
   */
  debeCambiarContrasena?: boolean;
}

/** Resultado de un inicio de sesión correcto. */
export interface ResultadoLogin {
  accessToken: string;
  refreshToken: string;
  usuario: UsuarioPublico;
}
