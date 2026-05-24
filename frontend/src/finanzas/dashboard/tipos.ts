/**
 * Tipos del dominio del dashboard de ganancias y ventas diarias.
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

// ── Venta diaria ───────────────────────────────────────────────────────────

/** Elemento de la lista de GET /ventas */
export interface VentaDiaria {
  id: string;
  sedeId: string;
  fechaOperacion: string;   // YYYY-MM-DD
  monto: number;
  tipo: string;
}

// ── Cuerpo de petición ────────────────────────────────────────────────────

export interface CuerpoRegistrarVenta {
  sedeId: string;
  fechaOperacion: string;   // YYYY-MM-DD
  monto: number;
}

// ── Filtros de listado ────────────────────────────────────────────────────

export interface FiltrosDashboard {
  desde: string;            // YYYY-MM-DD
  hasta: string;            // YYYY-MM-DD
  sedeId?: string;
}
