/**
 * Tipos del dominio de gestión de kioscos.
 * Coinciden con el contrato de la API del backend (asistencia).
 */

export interface Kiosco {
  id: string;
  nombre: string;
  sedeId: string;
  activo: boolean;
  creadoEn: string;
  /** Presente en el listado (GET incluye la sede); ausente en la respuesta del alta. */
  sede?: { nombre: string; modoExcepcion: string };
}

export interface CuerpoCrearKiosco {
  nombre: string;
  sedeId: string;
}
