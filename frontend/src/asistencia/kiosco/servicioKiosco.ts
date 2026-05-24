/**
 * Servicio del kiosco de fichaje.
 *
 * Las rutas de este módulo son PÚBLICAS (sin token JWT):
 *   GET  /kioscos   — lista de kioscos disponibles
 *   POST /fichajes  — registrar un fichaje
 *
 * Se usa `omitirAuth: true` para que el cliente no inyecte el header
 * Authorization aunque haya un token en memoria.
 */

import { peticion } from '../../core/api/cliente';
import type { Kiosco, CuerpoFichaje, RespuestaFichajeOk } from './tipos';

const OPCIONES_PUBLICAS = { omitirAuth: true } as const;

/**
 * Lista todos los kioscos activos del backend.
 * Endpoint público — no requiere sesión.
 */
export function obtenerKioscos(): Promise<Kiosco[]> {
  return peticion<Kiosco[]>('/kioscos', {
    method: 'GET',
    ...OPCIONES_PUBLICAS,
  });
}

/**
 * Registra un fichaje de empleado.
 * Endpoint público — no requiere sesión.
 *
 * Lanza Error con el mensaje del backend en caso de 4xx.
 * El llamador debe distinguir el código de estado para manejar el 409
 * (requiereExcepcion) de forma distinta al 401 (credencial inválida).
 * Para eso, usamos la función de bajo nivel `peticionRaw`.
 */
export async function registrarFichaje(
  cuerpo: CuerpoFichaje,
): Promise<{ ok: true; datos: RespuestaFichajeOk } | { ok: false; status: number; datos: unknown }> {
  const URL_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

  const respuesta = await fetch(`${URL_BASE}/fichajes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });

  const datos: unknown = await respuesta.json().catch(() => ({}));

  if (respuesta.ok) {
    return { ok: true, datos: datos as RespuestaFichajeOk };
  }

  return { ok: false, status: respuesta.status, datos };
}
