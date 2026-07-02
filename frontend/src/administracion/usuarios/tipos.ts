/**
 * Tipos de la gestión de usuarios del tenant (Fase 4c). Coinciden con el contrato
 * de GET/POST /usuarios y POST /usuarios/:id/restablecer-contrasena del backend
 * (core/usuarios).
 */

import type { Rol } from '../../core/auth/tipos';

/** Roles que un admin de tenant puede asignar (lista blanca del backend). */
export type RolAsignable = 'administrador' | 'empleado';

/** Fila de GET /usuarios. `rol` es el de la MEMBRESÍA en esta empresa; `creadoEn` ISO. */
export interface UsuarioListado {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  /** true = contraseña temporal pendiente de rotar (el usuario aún no la cambió). */
  debeCambiarContrasena: boolean;
  creadoEn: string;
}

/** Body de POST /usuarios. Todos los campos son obligatorios. */
export interface CuerpoCrearUsuario {
  nombre: string;
  email: string;
  /** Contraseña temporal: el usuario nacerá con debeCambiarContrasena=true. */
  password: string;
  rol: RolAsignable;
}

/** Respuesta 201 de POST /usuarios. */
export interface UsuarioCreado {
  id: string;
  nombre: string;
  email: string;
  rol: RolAsignable;
}
