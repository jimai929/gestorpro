/**
 * Servicio del kiosco de fichaje.
 *
 * Las rutas de este módulo son PÚBLICAS (sin token JWT de usuario), pero el
 * dispositivo se autoriza con su TOKEN DE KIOSCO (header x-kiosco-token):
 *   GET  /kioscos   — lista de kioscos disponibles (sin token)
 *   POST /fichajes  — registrar un fichaje (EXIGE el token del dispositivo)
 *
 * El token de kiosco se guarda localmente en este equipo (localStorage); lo
 * genera un administrador al dar de alta el kiosco y se configura una vez.
 */

import { peticion } from '../../core/api/cliente';
import type { Kiosco, CuerpoFichaje, RespuestaFichajeOk } from './tipos';

const OPCIONES_PUBLICAS = { omitirAuth: true } as const;

/** Clave de localStorage del token de dispositivo de este kiosco. */
const CLAVE_TOKEN = 'gestorpro.kioscoToken';

/** Token de dispositivo configurado en este equipo, o null si no hay. */
export function obtenerTokenKiosco(): string | null {
  return localStorage.getItem(CLAVE_TOKEN);
}

/** Guarda el token de dispositivo en este equipo. */
export function fijarTokenKiosco(token: string): void {
  localStorage.setItem(CLAVE_TOKEN, token.trim());
}

/** Borra el token de dispositivo de este equipo. */
export function limpiarTokenKiosco(): void {
  localStorage.removeItem(CLAVE_TOKEN);
}

/**
 * Lista todos los kioscos activos del backend.
 * Endpoint público — no requiere sesión ni token de dispositivo.
 */
export function obtenerKioscos(): Promise<Kiosco[]> {
  return peticion<Kiosco[]>('/kioscos', {
    method: 'GET',
    ...OPCIONES_PUBLICAS,
  });
}

/**
 * Registra un fichaje de empleado. Envía el token de dispositivo en el header
 * x-kiosco-token; sin un token válido el backend responde 401.
 *
 * Lanza Error con el mensaje del backend en caso de 4xx.
 * El llamador debe distinguir el código de estado para manejar el 409
 * (requiereExcepcion) y el 401 (token de kiosco o credencial inválida).
 * Para eso, usamos `fetch` de bajo nivel.
 */
export async function registrarFichaje(
  cuerpo: CuerpoFichaje,
): Promise<{ ok: true; datos: RespuestaFichajeOk } | { ok: false; status: number; datos: unknown }> {
  const URL_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

  const cabeceras: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = obtenerTokenKiosco();
  if (token) {
    cabeceras['x-kiosco-token'] = token;
  }

  const respuesta = await fetch(`${URL_BASE}/fichajes`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify(cuerpo),
  });

  const datos: unknown = await respuesta.json().catch(() => ({}));

  if (respuesta.ok) {
    return { ok: true, datos: datos as RespuestaFichajeOk };
  }

  return { ok: false, status: respuesta.status, datos };
}
