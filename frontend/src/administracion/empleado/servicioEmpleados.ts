/**
 * Servicio de gestión de empleados (núcleo: entidad transversal).
 */

import { api } from '../../core/api';
import type { Empleado, EmpleadoCreado, CuerpoCrearEmpleado, CuerpoEditarEmpleado } from './tipos';

/**
 * Lista empleados. Por defecto solo activos; con `incluirInactivos`, todos.
 * `sedeId` filtra por sede. Nunca trae secretos (PIN/QR).
 */
export function obtenerEmpleados(opciones?: {
  incluirInactivos?: boolean;
  sedeId?: string;
}): Promise<Empleado[]> {
  const params = new URLSearchParams();
  if (opciones?.incluirInactivos) params.set('incluirInactivos', 'true');
  if (opciones?.sedeId) params.set('sedeId', opciones.sedeId);
  const query = params.toString();
  return api.get<Empleado[]>(`/empleados${query ? `?${query}` : ''}`);
}

/** Alta. Devuelve el empleado + su qrToken (una vez, para imprimir el QR). Solo admin. */
export function crearEmpleado(cuerpo: CuerpoCrearEmpleado): Promise<EmpleadoCreado> {
  return api.post<EmpleadoCreado>('/empleados', cuerpo);
}

/** Edición (incluye baja/alta lógica vía `activo`). Solo admin. */
export function editarEmpleado(id: string, cuerpo: CuerpoEditarEmpleado): Promise<Empleado> {
  return api.put<Empleado>(`/empleados/${id}`, cuerpo);
}

/** Devuelve el qrToken actual (para reimprimir sin rotar). Solo admin. */
export function obtenerQr(id: string): Promise<{ qrToken: string }> {
  return api.get<{ qrToken: string }>(`/empleados/${id}/qr`);
}

/** Rota el QR (revoca el anterior). Solo admin. */
export function regenerarQr(id: string): Promise<{ qrToken: string }> {
  return api.post<{ qrToken: string }>(`/empleados/${id}/qr`, {});
}

/** Resetea el PIN. Solo admin. */
export function resetearPin(id: string, pin: string): Promise<void> {
  return api.post<void>(`/empleados/${id}/pin`, { pin });
}
