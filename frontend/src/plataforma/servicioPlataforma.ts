/**
 * Servicio de plataforma (super-admin). Encapsula las llamadas al backend.
 */

import { api } from '../core/api';
import type { DatosNuevaEmpresa, EmpresaCreada, EmpresaEstado, EmpresaListada } from './tipos';

/**
 * Crea una empresa (tenant) con su primer administrador (POST /empresas).
 * Solo super-admin: el backend lo exige con el preHandler `soloPlataforma`
 * (responde 404 a quien no lo es). Devuelve 409 si el slug o el email ya existen.
 */
export function crearEmpresaApi(cuerpo: DatosNuevaEmpresa): Promise<EmpresaCreada> {
  return api.post<EmpresaCreada>('/empresas', cuerpo);
}

/**
 * Lista todas las empresas (tenants). Solo super-admin: el backend responde 404 a
 * quien no lo es (soloPlataforma). Cada fila incluye el correo de su primer admin.
 */
export function listarEmpresasApi(): Promise<EmpresaListada[]> {
  return api.get<EmpresaListada[]>('/empresas');
}

/**
 * Baja / reactivación LÓGICA de una empresa (PATCH /empresas/:id → 200). Solo
 * super-admin. Desactivar expulsa las sesiones de los usuarios del tenant.
 */
export function cambiarEstadoEmpresaApi(empresaId: string, activo: boolean): Promise<EmpresaEstado> {
  return api.patch<EmpresaEstado>(`/empresas/${empresaId}`, { activo });
}
