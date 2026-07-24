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
  compras: number;          // registradas (devengado, fecha de factura): informativo
  pagosProveedor: number;   // egreso REAL a proveedores (pagos crédito + contado): base caja
  gastos: number;
  ganancia: number;         // caja: ventas − pagosProveedor − gastos
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

/**
 * Estado de corrección de un movimiento de dinero (lo calcula el backend a partir
 * de los asientos colgados del original, que es inmutable):
 *   vigente   → sin corregir; vale su monto.
 *   anulado   → reverso sin corrección; vale 0.
 *   corregido → reverso + corrección; vale `montoVigente`.
 */
export type EstadoMovimiento = 'vigente' | 'anulado' | 'corregido';

/** Elemento de la lista de GET /ventas (un cierre de caja con su arqueo). */
export interface VentaDiaria {
  id: string;
  sedeId: string;
  fechaOperacion: string;   // YYYY-MM-DD
  turno: TurnoVenta;
  cajera: string;           // snapshot "E001 - Nombre" (o legacy texto libre)
  cerradoPor: string;       // snapshot del verificador
  horaApertura: string | null;
  horaCierre: string | null;
  monto: number;            // total ORIGINAL del arqueo (inmutable)
  tipo: string;
  detalles: LineaArqueo[];  // arqueo ORIGINAL
  estado: EstadoMovimiento;
  montoVigente: number;     // total que vale hoy (0 si se anuló)
  motivoCorreccion: string | null;
  detallesVigentes: LineaArqueo[]; // arqueo que vale hoy ([] si se anuló)
}

/**
 * Respuesta REAL del POST /ventas: el cierre recién creado, SIN los campos
 * que solo calcula el listado (estado, montoVigente, motivoCorreccion,
 * detallesVigentes). Tiparla como `VentaDiaria` mentía: un consumidor que
 * leyera esos campos obtendría undefined sin aviso del compilador.
 */
export interface VentaCreada {
  id: string;
  sedeId: string;
  fechaOperacion: string;
  turno: TurnoVenta;
  cajera: string;
  cerradoPor: string;
  horaApertura: string | null;
  horaCierre: string | null;
  monto: number;
  tipo: string;
  detalles: LineaArqueo[];
}

/** Empleado para los selects de cajera/verificador del cierre. */
export interface EmpleadoCierre {
  id: string;
  numero: string;
  nombre: string;
  sedeId: string;
  roles: { id: string; clave: string; nombre: string }[];
}

// ── Cuerpo de petición ────────────────────────────────────────────────────

export interface CuerpoRegistrarVenta {
  sedeId: string;
  fechaOperacion: string;   // YYYY-MM-DD
  turno: TurnoVenta;
  cajera: string;           // snapshot "E001 - Nombre"
  cerradoPor: string;       // snapshot del verificador
  horaApertura?: string;    // "HH:MM"
  horaCierre?: string;      // "HH:MM"
  detalles: LineaArqueo[];
}

// ── Filtros de listado ────────────────────────────────────────────────────

export interface FiltrosDashboard {
  desde: string;            // YYYY-MM-DD
  hasta: string;            // YYYY-MM-DD
  sedeId?: string;
  cajera?: string;
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
