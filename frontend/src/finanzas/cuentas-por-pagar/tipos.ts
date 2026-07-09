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
