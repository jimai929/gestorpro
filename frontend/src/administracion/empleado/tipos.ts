/**
 * Tipos del dominio de gestión de empleados.
 * Coinciden con el contrato de la API del backend (núcleo, core/empleado).
 */

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
}

/** Edición parcial: campo presente se fija, ausente se deja igual. */
export interface CuerpoEditarEmpleado {
  numero?: string;
  nombre?: string;
  sedeId?: string;
  salarioFijo?: number;
  turnoId?: string | null;
  activo?: boolean;
}
