/**
 * Tipos del dominio de cuentas por pagar.
 * Coinciden exactamente con el contrato de la API del backend.
 */

// ── Entidades base ────────────────────────────────────────────────────────

export interface Sede {
  id: string;
  nombre: string;
  activo: boolean;
  modoExcepcion: string;
  creadoEn: string;
}

export interface Proveedor {
  id: string;
  nombre: string;
  identificacionFiscal: string | null;
  telefono: string | null;
  personaContacto: string | null;
  activo: boolean;
  creadoEn: string;
  /** Deuda viva = Σ saldo pendiente de sus facturas a crédito (0 si no debe). */
  deudaTotal: number;
}

/** Forma de pago de una compra: contado (pagada en el acto) o crédito (deuda). */
export type TipoCompra = 'contado' | 'credito';

export interface Compra {
  id: string;
  proveedorId: string;
  sedeId: string;
  numeroFactura: string;
  montoTotal: number;
  tipo: TipoCompra;
  fechaEmision: string;
  fechaVencimiento: string | null;
  // Solo el listado (GET /compras) incluye la relación; el alta no la devuelve.
  proveedor?: { nombre: string };
}

// ── Cuenta por pagar (vista derivada) ────────────────────────────────────

export type EstadoCuenta = 'debido' | 'vencida' | 'parcial' | 'pagado';

export interface CuentaPorPagar {
  compraId: string;
  proveedorId: string;
  proveedorNombre: string;
  sedeId: string;
  numeroFactura: string;
  montoTotal: number;
  fechaEmision: string;
  fechaVencimiento: string;
  totalPagado: number;
  saldo: number;
  estado: EstadoCuenta;
}

// ── Cuerpos de petición ───────────────────────────────────────────────────

export interface CuerpoCrearProveedor {
  nombre: string;
  identificacionFiscal?: string;
  telefono?: string;
  personaContacto?: string;
}

/** Edición parcial: cadena fija el valor, null lo borra, ausente lo deja igual. */
export interface CuerpoEditarProveedor {
  nombre?: string;
  identificacionFiscal?: string | null;
  telefono?: string | null;
  personaContacto?: string | null;
  activo?: boolean;
}

export interface CuerpoCrearCompra {
  proveedorId: string;
  sedeId: string;
  numeroFactura: string;
  montoTotal: number;
  tipo: TipoCompra;
  fechaEmision: string;        // YYYY-MM-DD
  fechaVencimiento?: string;   // YYYY-MM-DD (solo crédito)
}

export interface CuerpoRegistrarPago {
  compraId: string;
  monto: number;
  fechaPago?: string;         // YYYY-MM-DD
}

// ── Historial de pagos (GET /cuentas-por-pagar/pagos) ─────────────────────

/**
 * Estado de corrección de un pago (lo calcula el backend a partir de los asientos
 * colgados del original, que es INMUTABLE):
 *   vigente   → sin corregir; vale su monto.
 *   anulado   → reverso sin corrección; vale 0.
 *   corregido → reverso + corrección; vale `montoVigente`.
 */
export type EstadoPago = 'vigente' | 'corregido' | 'anulado';

/** Una fila del historial: un pago `normal` con su estado de corrección. */
export interface PagoHistorial {
  id: string;
  fechaPago: string;
  monto: number;              // monto ORIGINAL (inmutable)
  estado: EstadoPago;
  montoVigente: number;       // lo que vale hoy (0 si se anuló)
  motivoCorreccion: string | null;
  compraId: string;
  numeroFactura: string;
  montoFactura: number;
  proveedorId: string;
  proveedorNombre: string;
  /** Nombre del usuario que registró el pago (null si ya no existe). */
  registradoPor: string | null;
  creadoEn: string;
}

export interface PaginacionPagos {
  pagina: number;
  tamano: number;
  total: number;
  paginas: number;
}

/** Resumen del CONJUNTO filtrado completo (no solo de la página visible). */
export interface ResumenPagos {
  cantidad: number;
  totalOriginal: number;
  totalVigente: number;
  /** Original − vigente: lo que las correcciones quitaron (negativo si añadieron). */
  diferencia: number;
}

export interface RespuestaHistorialPagos {
  pagos: PagoHistorial[];
  paginacion: PaginacionPagos;
  resumen: ResumenPagos;
}

export interface FiltrosPagos {
  proveedorId?: string;
  desde?: string;             // YYYY-MM-DD
  hasta?: string;             // YYYY-MM-DD
  estado?: EstadoPago;
  pagina?: number;
  tamano?: number;
}

// ── Estado de cuenta (GET /cuentas-por-pagar/estado-cuenta) ───────────────

/**
 * Tipo de cada movimiento del estado de cuenta:
 *   compra          → factura a crédito (aumenta la deuda).
 *   pago            → pago vigente (la reduce).
 *   correccion_pago → pago corregido: la reduce por su importe CORREGIDO.
 *   anulacion_pago  → pago anulado: no la reduce (crédito 0).
 */
export type TipoMovimientoEC = 'compra' | 'pago' | 'correccion_pago' | 'anulacion_pago';

export interface MovimientoEstadoCuenta {
  fecha: string;              // YYYY-MM-DD
  tipo: TipoMovimientoEC;
  documento: string;          // número de factura
  concepto: string;
  debito: number;             // aumenta la deuda
  credito: number;            // la reduce (importe EFECTIVO)
  saldo: number;              // saldo corriente tras el movimiento
  compraId: string;
  pagoId: string | null;
  estado: EstadoPago | null;
  motivoCorreccion: string | null;
  registradoPor: string | null;
  creadoEn: string;
}

export interface EstadoCuentaProveedor {
  empresa: { id: string; nombre: string } | null;
  proveedor: {
    id: string;
    nombre: string;
    identificacionFiscal: string | null;
    telefono: string | null;
    personaContacto: string | null;
  };
  periodo: { desde: string; hasta: string };
  /** Deuda viva ANTES del período (no es 0 por defecto). */
  saldoInicial: number;
  movimientos: MovimientoEstadoCuenta[];
  resumen: {
    compras: number;
    pagos: number;
    correccionesAnulaciones: number;
    movimientos: number;
  };
  /** saldoInicial + débitos − créditos. */
  saldoFinal: number;
}
