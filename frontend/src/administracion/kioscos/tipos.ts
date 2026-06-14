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

/**
 * Respuesta del alta de kiosco: incluye el token de dispositivo en claro UNA
 * sola vez (el backend solo guarda su hash; no se puede recuperar después).
 */
export interface KioscoConToken extends Kiosco {
  token: string;
}

/** Respuesta de la regeneración de token: el id del kiosco y el nuevo token. */
export interface TokenKiosco {
  id: string;
  token: string;
}
