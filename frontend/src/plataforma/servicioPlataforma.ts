/**
 * Servicio de plataforma (super-admin). Encapsula las llamadas al backend.
 */

import { api } from '../core/api';
import type { DatosNuevaEmpresa, EmpresaCreada } from './tipos';

/**
 * Crea una empresa (tenant) con su primer administrador (POST /empresas).
 * Solo super-admin: el backend lo exige con el preHandler `soloPlataforma`
 * (responde 404 a quien no lo es). Devuelve 409 si el slug o el email ya existen.
 */
export function crearEmpresaApi(cuerpo: DatosNuevaEmpresa): Promise<EmpresaCreada> {
  return api.post<EmpresaCreada>('/empresas', cuerpo);
}
