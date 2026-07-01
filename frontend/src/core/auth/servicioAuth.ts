/**
 * Servicio de autenticación — encapsula las llamadas a la API de auth.
 * No contiene estado; el estado de sesión vive en ContextoAuth.
 */

import { api } from '../api';
import type {
  CredencialesLogin,
  RespuestaCambioEmpresa,
  RespuestaLogin,
  RespuestaRefresh,
} from './tipos';

const CLAVE_REFRESH_TOKEN = 'gestorpro_refresh_token';

/** Llama a POST /auth/login y devuelve la respuesta completa. */
export async function loginApi(credenciales: CredencialesLogin): Promise<RespuestaLogin> {
  return api.post<RespuestaLogin>('/auth/login', credenciales, { omitirAuth: true });
}

/** Llama a POST /auth/refresh con el refresh token guardado. */
export async function refrescarTokenApi(refreshToken: string): Promise<RespuestaRefresh> {
  return api.post<RespuestaRefresh>('/auth/refresh', { refreshToken }, { omitirAuth: true });
}

/** Llama a POST /auth/logout. El backend invalida el refresh token. */
export async function logoutApi(refreshToken: string): Promise<void> {
  await api.post<void>('/auth/logout', { refreshToken }, { omitirAuth: true });
}

/**
 * Llama a POST /auth/cambiar-contrasena (autoservicio, AUTENTICADO). Responde 204 sin
 * cuerpo. El backend, al cambiarla, revoca todas las sesiones de refresco del usuario.
 */
export async function cambiarContrasenaApi(
  contrasenaActual: string,
  contrasenaNueva: string,
): Promise<void> {
  // `omitirRefresco`: un 401 aquí significa "contraseña actual incorrecta", no token
  // expirado; sin esto el cliente lo reintentaría (doble POST, doble rate limit).
  await api.post<void>(
    '/auth/cambiar-contrasena',
    { contrasenaActual, contrasenaNueva },
    { omitirRefresco: true },
  );
}

/**
 * Llama a POST /auth/cambiar-empresa (AUTENTICADO). `empresaId` es la empresa destino
 * (el backend valida la membresía — o super-admin —); `null` = volver a la vista
 * plataforma (solo super-admin). Devuelve el access nuevo y el usuario con la empresa
 * activa nueva; el refresh token guardado sigue siendo válido (la sesión se conserva).
 */
export async function cambiarEmpresaApi(
  empresaId: string | null,
): Promise<RespuestaCambioEmpresa> {
  return api.post<RespuestaCambioEmpresa>('/auth/cambiar-empresa', { empresaId });
}

// ── Gestión del refresh token en localStorage ──────────────────────────────

export function guardarRefreshToken(token: string): void {
  localStorage.setItem(CLAVE_REFRESH_TOKEN, token);
}

export function obtenerRefreshTokenGuardado(): string | null {
  return localStorage.getItem(CLAVE_REFRESH_TOKEN);
}

export function eliminarRefreshToken(): void {
  localStorage.removeItem(CLAVE_REFRESH_TOKEN);
}
