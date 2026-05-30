/**
 * Servicio de gestión de sedes. Encapsula las llamadas al backend (núcleo).
 */

import { api } from '../../core/api';
import type { Sede, CuerpoCrearSede, CuerpoEditarSede } from './tipos';

/**
 * Lista sedes. Por defecto solo activas; con `incluirInactivas` trae también
 * las dadas de baja (para la pantalla de gestión).
 */
export function obtenerSedes(opciones?: { incluirInactivas?: boolean }): Promise<Sede[]> {
  const query = opciones?.incluirInactivas ? '?incluirInactivas=true' : '';
  return api.get<Sede[]>(`/sedes${query}`);
}

/** Crea una sede. Requiere rol administrador. */
export function crearSede(cuerpo: CuerpoCrearSede): Promise<Sede> {
  return api.post<Sede>('/sedes', cuerpo);
}

/** Edita una sede (incluye la baja/alta lógica vía `activo`). Requiere rol administrador. */
export function editarSede(id: string, cuerpo: CuerpoEditarSede): Promise<Sede> {
  return api.put<Sede>(`/sedes/${id}`, cuerpo);
}
