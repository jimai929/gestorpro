/**
 * Servicio de gestión de usuarios del tenant. Encapsula las llamadas al backend
 * (core/usuarios). Todas requieren rol administrador (o super-admin que ENTRÓ a
 * la empresa vía cambiar-empresa); el backend lo refuerza con `autorizar`.
 */

import { api } from '../../core/api';
import type { CuerpoCrearUsuario, UsuarioCreado, UsuarioListado } from './tipos';

/** Lista los usuarios de la empresa del token (GET /usuarios). */
export function listarUsuariosApi(): Promise<UsuarioListado[]> {
  return api.get<UsuarioListado[]>('/usuarios');
}

/** Crea un usuario del tenant con contraseña temporal (POST /usuarios). 409 si el email ya existe. */
export function crearUsuarioApi(cuerpo: CuerpoCrearUsuario): Promise<UsuarioCreado> {
  return api.post<UsuarioCreado>('/usuarios', cuerpo);
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
