/**
 * Tipos del dominio del catálogo de cajas registradoras.
 * Coinciden con el contrato de la API del backend (núcleo, core/caja).
 */

export interface Caja {
  id: string;
  sedeId: string;
  numero: string;
  nombre: string;
  activo: boolean;
  creadoEn: string;
}

export interface CuerpoCrearCaja {
  numero: string;
  nombre: string;
  sedeId: string;
}

/** Edición parcial: campo presente se fija, ausente se deja igual. */
export interface CuerpoEditarCaja {
  numero?: string;
  nombre?: string;
  sedeId?: string;
  activo?: boolean;
}
