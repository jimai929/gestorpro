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
}

/** Resultado de un inicio de sesión correcto. */
export interface ResultadoLogin {
  accessToken: string;
  refreshToken: string;
  usuario: UsuarioPublico;
}
