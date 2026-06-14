/**
 * Servicio de gestión de kioscos. Encapsula las llamadas al backend (asistencia).
 */

import { api } from '../../core/api';
import type { Kiosco, CuerpoCrearKiosco, KioscoConToken, TokenKiosco } from './tipos';

/** Lista los kioscos activos (con su sede). */
export function obtenerKioscos(): Promise<Kiosco[]> {
  return api.get<Kiosco[]>('/kioscos');
}

/**
 * Crea un kiosco en una sede existente. Requiere rol administrador. La respuesta
 * incluye el token de dispositivo en claro UNA vez (cópiarlo al configurar el kiosco).
 */
export function crearKiosco(cuerpo: CuerpoCrearKiosco): Promise<KioscoConToken> {
  return api.post<KioscoConToken>('/kioscos', cuerpo);
}

/** Regenera el token de dispositivo de un kiosco. Requiere rol administrador. */
export function regenerarTokenKiosco(id: string): Promise<TokenKiosco> {
  return api.post<TokenKiosco>(`/kioscos/${id}/token`, {});
}
