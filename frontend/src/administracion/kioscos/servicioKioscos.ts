/**
 * Servicio de gestión de kioscos. Encapsula las llamadas al backend (asistencia).
 */

import { api } from '../../core/api';
import type { Kiosco, CuerpoCrearKiosco } from './tipos';

/** Lista los kioscos activos (con su sede). */
export function obtenerKioscos(): Promise<Kiosco[]> {
  return api.get<Kiosco[]>('/kioscos');
}

/** Crea un kiosco en una sede existente. Requiere rol administrador. */
export function crearKiosco(cuerpo: CuerpoCrearKiosco): Promise<Kiosco> {
  return api.post<Kiosco>('/kioscos', cuerpo);
}
