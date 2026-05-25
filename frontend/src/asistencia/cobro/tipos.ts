/**
 * Tipos del módulo de cobro anticipado de horas extra.
 * Coinciden con el contrato de la API del backend.
 */

/** Estado posible de una solicitud de cobro. */
export type EstadoCobro = 'pendiente' | 'aprobada' | 'rechazada' | 'pagada';

/** Empleado resumido (listado de selección). */
export interface EmpleadoResumido {
  id: string;
  numero: string;
  nombre: string;
  sedeId: string;
}

/** Saldo de horas extra de un empleado. */
export interface SaldoEmpleado {
  empleadoId: string;
  saldo: number;
  porcentajeCobrable: number;
  disponible: number;
}

/** Configuración global del cobro (umbral y % cobrable). */
export interface ConfiguracionCobro {
  porcentajeCobrable: number;
  umbralAprobacion: number;
}

/** Solicitud de cobro devuelta por el backend. */
export interface SolicitudCobro {
  id: string;
  empleadoId: string;
  monto: number;
  estado: EstadoCobro;
  creadoEn: string;
  resueltoEn: string | null;
  pagadoEn: string | null;
  empleado: {
    numero: string;
    nombre: string;
  };
}

/** Body para crear una solicitud (POST /cobros). */
export interface CuerpoCrearCobro {
  empleadoId: string;
  monto: number;
}

/** Body para rechazar una solicitud (POST /cobros/:id/rechazar). */
export interface CuerpoRechazarCobro {
  motivo?: string;
}

/** Filtros opcionales para listar solicitudes. */
export interface FiltrosCobros {
  empleadoId?: string;
  estado?: EstadoCobro;
}
