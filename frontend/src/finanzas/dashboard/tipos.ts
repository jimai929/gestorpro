/**
 * Tipos del dominio del dashboard de ganancias y cierres de caja.
 * Coinciden exactamente con el contrato de la API del backend.
 */

// ── Sedes ─────────────────────────────────────────────────────────────────

export interface Sede {
  id: string;
  nombre: string;
  activo: boolean;
  modoExcepcion: string;
  creadoEn: string;
}

// ── Ganancia del período ───────────────────────────────────────────────────

/** Respuesta de GET /dashboard/ganancia */
export interface ResumenGanancia {
  desde: string;            // YYYY-MM-DD
  hasta: string;            // YYYY-MM-DD
  ventas: number;
  compras: number;
  gastos: number;
  ganancia: number;
}

// ── Gastos por categoría ───────────────────────────────────────────────────

/** Elemento de la lista de GET /dashboard/gastos-por-categoria */
export interface GastoPorCategoria {
  categoriaId: string;
  nombre: string;
  total: number;
}

// ── Cierre de caja con arqueo ──────────────────────────────────────────────

/** Turno del cierre de caja (operación de 24 h en tres turnos). */
export type TurnoVenta = 'manana' | 'tarde' | 'noche';

/** Tipo de componente del arqueo de caja. La lotería son premios pagados. */
export type TipoArqueo = 'efectivo' | 'tarjeta' | 'yappy' | 'loteria';

/** Una línea del arqueo: el monto contado de un tipo dentro del cierre. */
export interface LineaArqueo {
  tipoArqueo: TipoArqueo;
  monto: number;
}

/** Elemento de la lista de GET /ventas (un cierre de caja con su arqueo). */
export interface VentaDiaria {
  id: string;
  sedeId: string;
  fechaOperacion: string;   // YYYY-MM-DD
  turno: TurnoVenta;
  caja: string;
  cerradoPor: string;
  horaApertura: string | null;
  horaCierre: string | null;
  monto: number;            // total del arqueo (cuadra con Firestec)
  tipo: string;
  detalles: LineaArqueo[];
}

// ── Cuerpo de petición ────────────────────────────────────────────────────

export interface CuerpoRegistrarVenta {
  sedeId: string;
  fechaOperacion: string;   // YYYY-MM-DD
  turno: TurnoVenta;
  caja: string;
  cerradoPor: string;
  horaApertura?: string;    // "HH:MM"
  horaCierre?: string;      // "HH:MM"
  detalles: LineaArqueo[];
}

// ── Filtros de listado ────────────────────────────────────────────────────

export interface FiltrosDashboard {
  desde: string;            // YYYY-MM-DD
  hasta: string;            // YYYY-MM-DD
  sedeId?: string;
  caja?: string;
  turno?: TurnoVenta;
}

/** Las cuatro etiquetas legibles de los tipos de arqueo, en orden de captura. */
export const TIPOS_ARQUEO: ReadonlyArray<{ tipo: TipoArqueo; etiqueta: string }> = [
  { tipo: 'efectivo', etiqueta: 'Efectivo' },
  { tipo: 'tarjeta', etiqueta: 'Tarjeta' },
  { tipo: 'yappy', etiqueta: 'Yappy' },
  { tipo: 'loteria', etiqueta: 'Lotería' },
];

/** Las tres etiquetas legibles de los turnos. */
export const TURNOS: ReadonlyArray<{ turno: TurnoVenta; etiqueta: string }> = [
  { turno: 'manana', etiqueta: 'Mañana' },
  { turno: 'tarde', etiqueta: 'Tarde' },
  { turno: 'noche', etiqueta: 'Noche' },
];
