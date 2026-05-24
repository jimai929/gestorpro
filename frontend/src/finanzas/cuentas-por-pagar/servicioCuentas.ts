/**
 * Servicio de cuentas por pagar.
 * Encapsula todas las llamadas al backend para este módulo.
 */

import { api } from '../../core/api';
import type {
  CuentaPorPagar,
  Proveedor,
  Sede,
  CuerpoCrearProveedor,
  CuerpoCrearCompra,
  CuerpoRegistrarPago,
  Compra,
} from './tipos';

// ── Sedes ─────────────────────────────────────────────────────────────────

/** Lista todas las sedes registradas. */
export function obtenerSedes(): Promise<Sede[]> {
  return api.get<Sede[]>('/sedes');
}

// ── Proveedores ───────────────────────────────────────────────────────────

/** Lista todos los proveedores activos. */
export function obtenerProveedores(): Promise<Proveedor[]> {
  return api.get<Proveedor[]>('/proveedores');
}

/**
 * Crea un nuevo proveedor.
 * Requiere rol supervisor o administrador.
 */
export function crearProveedor(cuerpo: CuerpoCrearProveedor): Promise<Proveedor> {
  return api.post<Proveedor>('/proveedores', cuerpo);
}

// ── Compras (facturas) ────────────────────────────────────────────────────

/** Lista todas las compras registradas. */
export function obtenerCompras(): Promise<Compra[]> {
  return api.get<Compra[]>('/compras');
}

/**
 * Registra una nueva factura de compra.
 * Devuelve 409 si el número de factura ya existe para ese proveedor.
 */
export function crearCompra(cuerpo: CuerpoCrearCompra): Promise<Compra> {
  return api.post<Compra>('/compras', cuerpo);
}

// ── Cuentas por pagar ─────────────────────────────────────────────────────

/** Obtiene la lista de cuentas por pagar, con filtros opcionales. */
export function obtenerCuentasPorPagar(filtros?: {
  sedeId?: string;
  estado?: string;
}): Promise<CuentaPorPagar[]> {
  const params = new URLSearchParams();
  if (filtros?.sedeId) params.set('sedeId', filtros.sedeId);
  if (filtros?.estado) params.set('estado', filtros.estado);
  const query = params.toString();
  return api.get<CuentaPorPagar[]>(`/cuentas-por-pagar${query ? `?${query}` : ''}`);
}

// ── Pagos ─────────────────────────────────────────────────────────────────

/**
 * Registra un abono sobre una factura existente.
 * El usuarioId lo pone el backend desde el token — no se manda.
 * Devuelve 400 si el monto excede el saldo disponible.
 */
export function registrarPago(cuerpo: CuerpoRegistrarPago): Promise<unknown> {
  return api.post<unknown>('/pagos', cuerpo);
}
