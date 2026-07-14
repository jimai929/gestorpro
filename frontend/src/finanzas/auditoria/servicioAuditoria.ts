/**
 * Servicio del centro de auditoría de correcciones financieras.
 * Solo lectura: GET /finanzas/auditoria-correcciones.
 */

import { api } from '../../core/api';
import type { FiltrosAuditoria, RespuestaAuditoria } from './tipos';

export function obtenerAuditoriaCorrecciones(
  filtros: FiltrosAuditoria = {},
): Promise<RespuestaAuditoria> {
  const params = new URLSearchParams();
  if (filtros.desde) params.set('desde', filtros.desde);
  if (filtros.hasta) params.set('hasta', filtros.hasta);
  if (filtros.entidad && filtros.entidad !== 'todas') params.set('entidad', filtros.entidad);
  if (filtros.accion && filtros.accion !== 'todas') params.set('accion', filtros.accion);
  if (filtros.usuarioId) params.set('usuarioId', filtros.usuarioId);
  if (filtros.texto) params.set('texto', filtros.texto);
  if (filtros.pagina) params.set('pagina', String(filtros.pagina));
  if (filtros.tamano) params.set('tamano', String(filtros.tamano));
  const query = params.toString();
  return api.get<RespuestaAuditoria>(
    `/finanzas/auditoria-correcciones${query ? `?${query}` : ''}`,
  );
}
