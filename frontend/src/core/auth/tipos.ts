/**
 * Tipos del dominio de autenticación del frontend.
 * Coinciden exactamente con el contrato de la API de auth del backend.
 */

export type Rol = 'empleado' | 'supervisor' | 'administrador';

/** Membresía visible (solo empresas ACTIVAS): alimenta el selector de la barra. */
export interface MembresiaPublica {
  empresaId: string;
  empresaNombre: string;
  rol: Rol;
}

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
   * Empresa activa de la sesión. `null` si no hay (super-admin en la vista plataforma).
   * SOLO experiencia de UI (marcar la empresa actual, mostrar "volver a plataforma"):
   * el aislamiento real sale del token en el backend, nunca de este campo.
   */
  empresaId: string | null;
  /**
   * Nombre de la empresa activa (para mostrar en la barra superior). `null` si no hay
   * empresa activa (p. ej. super-admin). Lo envía el backend en login/refresh y /auth/me.
   */
  empresaNombre: string | null;
  /** true si la cuenta tiene una contraseña temporal y debe cambiarla antes de operar. */
  debeCambiarContrasena: boolean;
  /**
   * Membresías del usuario en empresas ACTIVAS (predeterminada primero). El selector
   * de empresa de la barra se muestra solo con más de una. Super-admin: []. SOLO
   * experiencia de UI: el cambio real lo valida el backend (cambiar-empresa).
   */
  membresias: MembresiaPublica[];
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

/**
 * Respuesta de POST /auth/cambiar-empresa. SIN refreshToken: la sesión se conserva
 * (solo cambia su empresa activa); el refresh guardado sigue siendo válido.
 */
export interface RespuestaCambioEmpresa {
  accessToken: string;
  usuario: Usuario;
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
