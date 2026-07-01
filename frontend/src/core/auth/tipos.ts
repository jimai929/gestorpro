/**
 * Tipos del dominio de autenticación del frontend.
 * Coinciden exactamente con el contrato de la API de auth del backend.
 */

export type Rol = 'empleado' | 'supervisor' | 'administrador';

export interface Usuario {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  /**
   * Operador de PLATAFORMA (super-admin). Lo envía el backend en login/refresh y /auth/me.
   * Solo EXPERIENCIA de UI: la frontera real de seguridad es el backend (soloPlataforma → 404).
   */
  esSuperAdmin: boolean;
  /**
   * Nombre de la empresa activa (para mostrar en la barra superior). `null` si no hay
   * empresa activa (p. ej. super-admin). Lo envía el backend en login/refresh y /auth/me.
   */
  empresaNombre: string | null;
  /** true si la cuenta tiene una contraseña temporal y debe cambiarla antes de operar. */
  debeCambiarContrasena: boolean;
}

/** Respuesta de POST /auth/login */
export interface RespuestaLogin {
  accessToken: string;
  refreshToken: string;
  usuario: Usuario;
}

/** Respuesta de POST /auth/refresh */
export interface RespuestaRefresh {
  accessToken: string;
}

/** Body de POST /auth/login */
export interface CredencialesLogin {
  email: string;
  password: string;
}

/** Body de POST /auth/logout y POST /auth/refresh */
export interface CuerpoRefresh {
  refreshToken: string;
}
