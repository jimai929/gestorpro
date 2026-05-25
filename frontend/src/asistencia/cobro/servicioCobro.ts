/**
 * Servicio del módulo de cobro anticipado de horas extra.
 *
 * Rutas protegidas (requieren Bearer token):
 *   GET  /empleados                   → lista de empleados
 *   GET  /saldo?empleadoId=ID         → saldo disponible del empleado
 *   GET  /configuracion-cobro         → config (% cobrable, umbral)
 *   POST /cobros                      → crear solicitud de cobro
 *   GET  /cobros?empleadoId?&estado?  → listar solicitudes
 *   POST /cobros/:id/aprobar          → aprobar solicitud (supervisor/admin)
 *   POST /cobros/:id/rechazar         → rechazar solicitud (supervisor/admin)
 *   POST /cobros/:id/pagar            → marcar como pagada (admin)
 */

import { api } from '../../core/api';
import type {
  EmpleadoResumido,
  SaldoEmpleado,
  ConfiguracionCobro,
  SolicitudCobro,
  CuerpoCrearCobro,
  CuerpoRechazarCobro,
  FiltrosCobros,
} from './tipos';

/** Obtiene todos los empleados disponibles. */
export function obtenerEmpleados(): Promise<EmpleadoResumido[]> {
  return api.get<EmpleadoResumido[]>('/empleados');
}

/** Obtiene el saldo y disponible de un empleado. */
export function obtenerSaldo(empleadoId: string): Promise<SaldoEmpleado> {
  return api.get<SaldoEmpleado>(`/saldo?empleadoId=${encodeURIComponent(empleadoId)}`);
}

/** Obtiene la configuración de cobro (% cobrable y umbral de aprobación). */
export function obtenerConfiguracionCobro(): Promise<ConfiguracionCobro> {
  return api.get<ConfiguracionCobro>('/configuracion-cobro');
}

/** Crea una nueva solicitud de cobro anticipado. */
export function crearSolicitudCobro(cuerpo: CuerpoCrearCobro): Promise<SolicitudCobro> {
  return api.post<SolicitudCobro>('/cobros', cuerpo);
}

/** Lista las solicitudes de cobro con filtros opcionales. */
export function obtenerCobros(filtros?: FiltrosCobros): Promise<SolicitudCobro[]> {
  const params = new URLSearchParams();
  if (filtros?.empleadoId) params.set('empleadoId', filtros.empleadoId);
  if (filtros?.estado) params.set('estado', filtros.estado);
  const qs = params.toString();
  return api.get<SolicitudCobro[]>(`/cobros${qs ? `?${qs}` : ''}`);
}

/** Aprueba una solicitud pendiente (supervisor/admin). Envía body vacío para evitar 415. */
export function aprobarCobro(id: string): Promise<SolicitudCobro> {
  return api.post<SolicitudCobro>(`/cobros/${id}/aprobar`, {});
}

/** Rechaza una solicitud pendiente con motivo opcional (supervisor/admin). */
export function rechazarCobro(id: string, cuerpo: CuerpoRechazarCobro): Promise<SolicitudCobro> {
  return api.post<SolicitudCobro>(`/cobros/${id}/rechazar`, cuerpo);
}

/** Marca una solicitud aprobada como pagada y genera el gasto (admin). */
export function pagarCobro(id: string): Promise<SolicitudCobro> {
  return api.post<SolicitudCobro>(`/cobros/${id}/pagar`, {});
}
