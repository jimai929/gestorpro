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
  activo: boolean;
  creadoEn: string;
}

export interface Compra {
  id: string;
  proveedorId: string;
  sedeId: string;
  numeroFactura: string;
  montoTotal: number;
  fechaEmision: string;
  fechaVencimiento: string;
  proveedor: { nombre: string };
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
}

export interface CuerpoCrearCompra {
  proveedorId: string;
  sedeId: string;
  numeroFactura: string;
  montoTotal: number;
  fechaEmision: string;       // YYYY-MM-DD
  fechaVencimiento: string;   // YYYY-MM-DD
}

export interface CuerpoRegistrarPago {
  compraId: string;
  monto: number;
  fechaPago?: string;         // YYYY-MM-DD
}
