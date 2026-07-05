/**
 * Servicio de plataforma (super-admin). Encapsula las llamadas al backend.
 */

import { api, peticion } from '../core/api';
import type {
  AdminRestablecido,
  DatosNuevaEmpresa,
  EmpresaCreada,
  EmpresaEstado,
  EmpresaListada,
  MembresiaCreada,
  RolMembresia,
} from './tipos';

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

/**
 * Añade una MEMBRESÍA a un usuario EXISTENTE (por email) en la empresa dada
 * (POST /empresas/:id/membresias → 201). Solo super-admin. 404 si el email no
 * existe; 409 si ya es miembro o la cuenta/empresa está desactivada.
 */
export function crearMembresiaApi(
  empresaId: string,
  email: string,
  rol: RolMembresia,
): Promise<MembresiaCreada> {
  return api.post<MembresiaCreada>(`/empresas/${empresaId}/membresias`, { email, rol });
}

/**
 * Restablece la contraseña del admin PRINCIPAL de una empresa SIN entrar al tenant
 * (POST /empresas/:id/restablecer-admin → 200). Solo super-admin. El servidor GENERA la
 * contraseña temporal y la devuelve EN CLARO UNA vez. 404 si la empresa/admin no existe;
 * 409 si la empresa o la cuenta admin están desactivadas.
 *
 * SIN BODY REAL: se usa `peticion` con solo `method: 'POST'` (no `api.post`, que forzaría
 * `JSON.stringify(cuerpo)`). Así no se envía ni cuerpo ni `Content-Type: application/json`
 * (ver construirCabeceras): la ruta no acepta datos del cliente y un body vacío con ese
 * header daría 400 en Fastify.
 */
export function restablecerAdminApi(empresaId: string): Promise<AdminRestablecido> {
  return peticion<AdminRestablecido>(`/empresas/${empresaId}/restablecer-admin`, { method: 'POST' });
}
