/**
 * Servicio del módulo de jornadas.
 *
 * Rutas PROTEGIDAS (requieren Bearer token — supervisor o admin):
 *   GET  /jornadas?empleadoId?&desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *   POST /jornadas/correccion
 *   POST /jornadas/barrer-huerfanos  (solo admin)
 */

import { api } from '../../core/api';
import type { Jornada, CuerpoCorreccion, RespuestaBarridoHuerfanos } from './tipos';

export interface FiltrosJornada {
  desde: string;
  hasta: string;
  empleadoId?: string;
}

/**
 * Obtiene la lista de jornadas filtradas por período y empleado opcional.
 */
export function obtenerJornadas(filtros: FiltrosJornada): Promise<Jornada[]> {
  const params = new URLSearchParams({ desde: filtros.desde, hasta: filtros.hasta });
  if (filtros.empleadoId) params.set('empleadoId', filtros.empleadoId);
  return api.get<Jornada[]>(`/jornadas?${params.toString()}`);
}

/**
 * Registra una corrección sobre una jornada existente.
 * El backend recalcula la jornada y la marca como 'corregida'.
 */
export function corregirJornada(cuerpo: CuerpoCorreccion): Promise<Jornada> {
  return api.post<Jornada>('/jornadas/correccion', cuerpo);
}

/**
 * Dispara el barrido de fichajes huérfanos (solo admin).
 * Devuelve cuántos fichajes fueron marcados.
 */
export function barrerHuerfanos(): Promise<RespuestaBarridoHuerfanos> {
  return api.post<RespuestaBarridoHuerfanos>('/jornadas/barrer-huerfanos', {});
}
