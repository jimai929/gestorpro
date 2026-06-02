/**
 * Tipos del dominio de gestión de empleados.
 * Coinciden con el contrato de la API del backend (núcleo, core/empleado).
 */

/** Rol operativo del catálogo (cajera, verificador, …). */
export interface RolOperativo {
  id: string;
  clave: string;
  nombre: string;
  activo: boolean;
}

/** Rol asignado a un empleado (subconjunto del catálogo, sin `activo`). */
export type RolAsignado = Pick<RolOperativo, 'id' | 'clave' | 'nombre'>;

export interface Empleado {
  id: string;
  numero: string;
  nombre: string;
  sedeId: string;
  salarioFijo: number;
  turnoId: string | null;
  activo: boolean;
  /** Hay foto de referencia (para el reconocimiento facial futuro). */
  tieneFoto: boolean;
  /** Roles operativos asignados (cajera, verificador, …). */
  roles: RolAsignado[];
}

/** Respuesta del alta: el empleado + su qrToken (devuelto una vez, para imprimirlo). */
export interface EmpleadoCreado extends Empleado {
  qrToken: string;
}

export interface CuerpoCrearEmpleado {
  numero: string;
  nombre: string;
  sedeId: string;
  salarioFijo: number;
  turnoId?: string | null;
  pin: string;
  /** IDs de los roles operativos a asignar. */
  rolesOperativos?: string[];
}

/** Edición parcial: campo presente se fija, ausente se deja igual. */
export interface CuerpoEditarEmpleado {
  numero?: string;
  nombre?: string;
  sedeId?: string;
  salarioFijo?: number;
  turnoId?: string | null;
  activo?: boolean;
  /** Si se envía, reemplaza el conjunto de roles (lista vacía = sin roles). */
  rolesOperativos?: string[];
}
