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
