/**
 * Tipos del dominio de gastos.
 * Coinciden exactamente con el contrato de la API del backend.
 */

// ── Entidades base ────────────────────────────────────────────────────────

export interface CategoriaGasto {
  id: string;
  nombre: string;
  esPagoEmpleado: boolean;
  activo: boolean;
  creadoEn: string;
}

export interface Sede {
  id: string;
  nombre: string;
  activo: boolean;
  modoExcepcion: string;
  creadoEn: string;
}

// ── Gasto (respuesta del backend) ─────────────────────────────────────────

/**
 * Estado de corrección de un movimiento de dinero (lo calcula el backend a partir
 * de los asientos colgados del original, que es inmutable):
 *   vigente   → sin corregir; vale su monto.
 *   anulado   → reverso sin corrección; vale 0.
 *   corregido → reverso + corrección; vale `montoVigente`.
 */
export type EstadoMovimiento = 'vigente' | 'anulado' | 'corregido';

export interface Gasto {
  id: string;
  categoriaId: string;
  sedeId: string;
  monto: number;               // monto ORIGINAL (inmutable)
  fechaOperacion: string;      // YYYY-MM-DD
  descripcion: string | null;
  empleadoId: string | null;
  tipoPago: string | null;
  tipo: string;
  estado: EstadoMovimiento;
  montoVigente: number;        // lo que vale hoy: original, 0 (anulado) o el corregido
  motivoCorreccion: string | null;
  categoria: {
    nombre: string;
    esPagoEmpleado: boolean;
  };
}

// ── Cuerpos de petición ───────────────────────────────────────────────────

export interface CuerpoRegistrarGasto {
  categoriaId: string;
  sedeId: string;
  monto: number;
  fechaOperacion: string;      // YYYY-MM-DD
  descripcion?: string;
  empleadoId?: string;
  tipoPago?: string;
}

// ── Gestión de categorías ─────────────────────────────────────────────────

export interface CuerpoCrearCategoria {
  nombre: string;
  esPagoEmpleado?: boolean;
}

/** Respuesta de crear categoría: `reactivada=true` si el nombre coincidía con una inactiva
 * y en vez de crear una fila nueva se reactivó la existente. */
export interface CategoriaGastoCreada extends CategoriaGasto {
  reactivada: boolean;
}

/** Edición parcial de una categoría (campo presente se fija, ausente se deja igual). */
export interface CuerpoActualizarCategoria {
  nombre?: string;
  esPagoEmpleado?: boolean;
  activo?: boolean;
}

// ── Filtros de listado ────────────────────────────────────────────────────

export interface FiltrosGasto {
  desde: string;   // YYYY-MM-DD
  hasta: string;   // YYYY-MM-DD
  sedeId?: string;
}
