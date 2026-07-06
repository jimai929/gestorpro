/**
 * Tipos de la gestión de usuarios del tenant (Fase 4c). Coinciden con el contrato
 * de GET/POST /usuarios, PATCH /usuarios/:id (baja/reactivación) y
 * POST /usuarios/:id/restablecer-contrasena del backend (core/usuarios).
 */

import type { Rol } from '../../core/auth/tipos';

/**
 * Roles INTERNOS de empresa que un admin de tenant puede asignar (lista blanca del
 * backend: POST /usuarios, PATCH /usuarios/:id/rol y POST /empresas/:id/membresias).
 * NUNCA incluye roles de plataforma ni `esSuperAdmin` (que no es un valor de rol).
 */
export type RolAsignable = 'administrador' | 'supervisor' | 'empleado';

/** Fuente ÚNICA de la lista blanca de roles asignables (orden de presentación). */
export const ROLES_ASIGNABLES: RolAsignable[] = ['administrador', 'supervisor', 'empleado'];

/** ¿`rol` es uno de los tres roles asignables conocidos? (evita mapear un valor raro a un rol seguro). */
export function esRolAsignable(rol: string): rol is RolAsignable {
  return (ROLES_ASIGNABLES as string[]).includes(rol);
}

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
