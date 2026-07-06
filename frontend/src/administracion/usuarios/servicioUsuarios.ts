/**
 * Servicio de gestión de usuarios del tenant. Encapsula las llamadas al backend
 * (core/usuarios). Todas requieren rol administrador (o super-admin que ENTRÓ a
 * la empresa vía cambiar-empresa); el backend lo refuerza con `autorizar`.
 */

import { api } from '../../core/api';
import type { CuerpoCrearUsuario, RolAsignable, UsuarioCreado, UsuarioListado } from './tipos';

/** Lista los usuarios de la empresa del token (GET /usuarios). */
export function listarUsuariosApi(): Promise<UsuarioListado[]> {
  return api.get<UsuarioListado[]>('/usuarios');
}

/** Crea un usuario del tenant con contraseña temporal (POST /usuarios). 409 si el email ya existe. */
export function crearUsuarioApi(cuerpo: CuerpoCrearUsuario): Promise<UsuarioCreado> {
  return api.post<UsuarioCreado>('/usuarios', cuerpo);
}

/**
 * Baja / reactivación LÓGICA de un usuario del tenant (PATCH /usuarios/:id → 200 con
 * la fila actualizada). Desactivar expulsa todas sus sesiones. La propia cuenta no se
 * puede tocar (400) y una cuenta multi-empresa devuelve 409 (se gestiona en plataforma).
 */
export function cambiarEstadoUsuarioApi(usuarioId: string, activo: boolean): Promise<UsuarioListado> {
  return api.patch<UsuarioListado>(`/usuarios/${usuarioId}`, { activo });
}

/**
 * Cambia el ROL de la membresía de un usuario en ESTA empresa (M3b, PATCH
 * /usuarios/:id/rol → 200 con la fila actualizada). Solo afecta la Membresia de la
 * empresa del token, nunca el Usuario.rol global ni otras empresas. La propia cuenta
 * la rechaza el backend (400); un rol fuera de la lista blanca → 400; multi-empresa
 * SÍ permitido (el cambio es per-membresía).
 */
export function cambiarRolUsuarioApi(usuarioId: string, rol: RolAsignable): Promise<UsuarioListado> {
  return api.patch<UsuarioListado>(`/usuarios/${usuarioId}/rol`, { rol });
}

/**
 * Restablece la contraseña de un usuario del tenant con una temporal
 * (POST /usuarios/:id/restablecer-contrasena → 204). El backend revoca todas las
 * sesiones del usuario; la propia cuenta va por /auth/cambiar-contrasena (400 aquí).
 */
export function restablecerContrasenaApi(
  usuarioId: string,
  contrasenaTemporal: string,
): Promise<void> {
  return api.post<void>(`/usuarios/${usuarioId}/restablecer-contrasena`, { contrasenaTemporal });
}
