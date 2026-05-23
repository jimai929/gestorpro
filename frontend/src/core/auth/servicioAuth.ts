/**
 * Servicio de autenticación — encapsula las llamadas a la API de auth.
 * No contiene estado; el estado de sesión vive en ContextoAuth.
 */

import { api } from '../api';
import type {
  CredencialesLogin,
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
