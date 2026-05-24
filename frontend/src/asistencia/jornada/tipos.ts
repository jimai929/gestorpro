/**
 * Tipos del dominio de jornadas.
 * Coinciden exactamente con el contrato de la API del backend.
 */

// ── Clasificación de jornada ──────────────────────────────────────────────

export type ClasificacionJornada = 'diurna' | 'nocturna' | 'mixta' | null;
export type EstadoJornada = 'calculada' | 'anomalia' | 'corregida';

// ── Resumen de empleado embebido en la jornada ────────────────────────────

export interface EmpleadoResumen {
  numero: string;
  nombre: string;
}

// ── Jornada devuelta por GET /jornadas ────────────────────────────────────

export interface Jornada {
  id: string;
  empleadoId: string;
  fecha: string;                        // YYYY-MM-DD
  minutosPresencia: number;
  minutosPausa: number;
  minutosTrabajados: number;
  minutosOrdinarios: number;
  minutosExtra: number;
  clasificacion: ClasificacionJornada;
  montoExtra: number;
  esFestivo: boolean;
  anomalia: boolean;
  detalleAnomalia: string | null;
  estado: EstadoJornada;
  recargosDetalle: Record<string, unknown> | null;
  empleado: EmpleadoResumen;
}

// ── Cuerpo de POST /jornadas/correccion ──────────────────────────────────

export interface CuerpoCorreccion {
  jornadaId: string;
  motivo: string;
  minutosTrabajados?: number;
  minutosExtra?: number;
  montoExtra?: number;
  resolverAnomalia?: boolean;
}

// ── Respuesta de POST /jornadas/barrer-huerfanos ─────────────────────────

export interface RespuestaBarridoHuerfanos {
  marcadas: number;
}
