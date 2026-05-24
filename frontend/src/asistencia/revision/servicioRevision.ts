/**
 * Servicio de la cola de revisión de fichajes de excepción.
 *
 * Rutas PROTEGIDAS (requieren Bearer token — supervisor o admin):
 *   GET  /fichajes/cola-revision?sedeId?  — lista de fichajes pendientes
 *   POST /revisiones                       — validar o rechazar un fichaje
 */

import { api } from '../../core/api';
import type { FichajeEnCola, CuerpoRevision } from './tipos';

/**
 * Obtiene los fichajes de excepción pendientes de revisión.
 * @param sedeId - Filtro opcional por sede.
 */
export function obtenerColaRevision(sedeId?: string): Promise<FichajeEnCola[]> {
  const params = new URLSearchParams();
  if (sedeId) params.set('sedeId', sedeId);
  const qs = params.toString();
  return api.get<FichajeEnCola[]>(`/fichajes/cola-revision${qs ? `?${qs}` : ''}`);
}

/**
 * Registra la decisión del jefe sobre un fichaje de excepción.
 * @param cuerpo - { fichajeId, valido, motivo? }
 */
export function revisarFichaje(cuerpo: CuerpoRevision): Promise<void> {
  return api.post<void>('/revisiones', cuerpo);
}
