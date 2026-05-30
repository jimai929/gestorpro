/**
 * Servicio del catálogo de cajas (núcleo: catálogo transversal por sede).
 */

import { api } from '../../core/api';
import type { Caja, CuerpoCrearCaja, CuerpoEditarCaja } from './tipos';

/**
 * Lista cajas. Por defecto solo activas; con `incluirInactivas`, todas.
 * `sedeId` filtra por sede.
 */
export function obtenerCajas(opciones?: {
  sedeId?: string;
  incluirInactivas?: boolean;
}): Promise<Caja[]> {
  const params = new URLSearchParams();
  if (opciones?.sedeId) params.set('sedeId', opciones.sedeId);
  if (opciones?.incluirInactivas) params.set('incluirInactivas', 'true');
  const query = params.toString();
  return api.get<Caja[]>(`/cajas${query ? `?${query}` : ''}`);
}

/** Crea una caja. Requiere rol administrador. */
export function crearCaja(cuerpo: CuerpoCrearCaja): Promise<Caja> {
  return api.post<Caja>('/cajas', cuerpo);
}

/** Edita una caja (incluye la baja/alta lógica vía `activo`). Requiere rol administrador. */
export function editarCaja(id: string, cuerpo: CuerpoEditarCaja): Promise<Caja> {
  return api.put<Caja>(`/cajas/${id}`, cuerpo);
}
