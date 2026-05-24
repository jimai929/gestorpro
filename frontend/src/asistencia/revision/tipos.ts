/**
 * Tipos del dominio de la cola de revisión de fichajes de excepción.
 * Coinciden exactamente con el contrato de la API del backend.
 */

// ── Fichaje en cola de revisión ───────────────────────────────────────────

export type TipoFichaje = 'entrada' | 'salida_comida' | 'entrada_comida' | 'salida';
export type MecanismoExcepcion = 'pin' | 'supervisor';

export interface EmpleadoResumen {
  numero: string;
  nombre: string;
}

export interface KioscoResumen {
  nombre: string;
}

export interface FichajeEnCola {
  id: string;
  tipo: TipoFichaje;
  momento: string;              // ISO 8601
  mecanismoExcepcion: MecanismoExcepcion;
  empleado: EmpleadoResumen;
  kiosco: KioscoResumen;
}

// ── Cuerpo de revisión ────────────────────────────────────────────────────

export interface CuerpoRevision {
  fichajeId: string;
  valido: boolean;
  motivo?: string;
}
