/**
 * Tipos del dominio del kiosco de fichaje.
 * Coinciden exactamente con el contrato de la API del backend.
 */

// ── Kiosco ────────────────────────────────────────────────────────────────

export type ModoExcepcion = 'pin' | 'supervisor' | 'ambos';

// Sede anidada en el listado público GET /kioscos: solo `nombre`. El
// `modoExcepcion` NO se expone en esa ruta pública (L5, seguridad: sería
// divulgación de info); el modo de excepción llega al kiosco en el 409 de
// POST /fichajes (ver `RespuestaExcepcion`).
export interface Sede {
  nombre: string;
}

export interface Kiosco {
  id: string;
  nombre: string;
  sedeId: string;
  activo: boolean;
  sede: Sede;
}

// ── Fichaje ───────────────────────────────────────────────────────────────

export type TipoFichaje = 'entrada' | 'salida_comida' | 'entrada_comida' | 'salida';

/** Valores simulados de verificación facial (sin cámara real en dev). */
export type ResultadoFacialSimulado = 'sim:match' | 'sim:nomatch' | 'sim:nolive';

export interface CuerpoFichaje {
  kioscoId: string;
  tipo: TipoFichaje;
  /** Número de empleado (se envía uno de los dos: numero o qrToken). */
  numero?: string;
  /** Token QR del empleado. */
  qrToken?: string;
  /** Foto capturada o valor simulado. */
  fotoCaptura: string;
  /** PIN del empleado (para fichaje de excepción por PIN). */
  pin?: string;
  /** Correo del supervisor (para fichaje de excepción por supervisor). */
  supervisorEmail?: string;
  /** Contraseña del supervisor (para fichaje de excepción por supervisor). */
  supervisorPassword?: string;
}

// ── Respuestas ─────────────────────────────────────────────────────────────

export interface DatosFichaje {
  id: string;
  tipo: TipoFichaje;
  esExcepcion: boolean;
  requiereRevision: boolean;
  momento: string;
}

/** Respuesta 201 — fichaje registrado correctamente. */
export interface RespuestaFichajeOk {
  estado: 'registrado';
  mecanismo: 'facial' | 'pin' | 'supervisor';
  fichaje: DatosFichaje;
  alertaRRHH?: boolean;
}

/** Respuesta 409 — el facial falló y se requiere excepción. */
export interface RespuestaExcepcion {
  requiereExcepcion: true;
  modoExcepcion: ModoExcepcion;
  mensaje: string;
}

/** Respuesta 401 — PIN o supervisor inválido. */
export interface RespuestaNoAutorizado {
  mensaje: string;
}

// ── Pasos internos del flujo del kiosco ───────────────────────────────────

export type PasoKiosco =
  | 'seleccion'        // Seleccionar kiosco y tipo de fichaje
  | 'identificacion'   // El empleado teclea número o QR
  | 'facial'           // Verificación facial simulada
  | 'excepcion'        // El facial falló — pedir PIN o supervisor
  | 'resultado';       // Mostrar resultado final

export type EstadoResultado = 'exito' | 'error';

export interface ResultadoFichaje {
  estado: EstadoResultado;
  mensaje: string;
  esExcepcion: boolean;
  alertaRRHH: boolean;
}
