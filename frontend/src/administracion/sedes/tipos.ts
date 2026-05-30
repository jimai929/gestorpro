/**
 * Tipos del dominio de gestión de sedes.
 * Coinciden con el contrato de la API del backend (núcleo).
 */

export type ModoExcepcion = 'pin' | 'supervisor' | 'ambos';

export interface Sede {
  id: string;
  nombre: string;
  activo: boolean;
  modoExcepcion: ModoExcepcion;
  creadoEn: string;
}

export interface CuerpoCrearSede {
  nombre: string;
  modoExcepcion?: ModoExcepcion;
}

/** Edición parcial: campo presente se fija, ausente se deja igual. */
export interface CuerpoEditarSede {
  nombre?: string;
  modoExcepcion?: ModoExcepcion;
  activo?: boolean;
}

/** Etiquetas legibles del modo de excepción del fichaje. */
export const MODOS_EXCEPCION: ReadonlyArray<{ valor: ModoExcepcion; etiqueta: string }> = [
  { valor: 'pin', etiqueta: 'PIN' },
  { valor: 'supervisor', etiqueta: 'Supervisor' },
  { valor: 'ambos', etiqueta: 'PIN o supervisor' },
];
