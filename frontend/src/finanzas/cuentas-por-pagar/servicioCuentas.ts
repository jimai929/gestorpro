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
  CuerpoEditarProveedor,
  CuerpoCrearCompra,
  CuerpoRegistrarPago,
  Compra,
  FiltrosPagos,
  RespuestaHistorialPagos,
} from './tipos';

// ── Sedes ─────────────────────────────────────────────────────────────────

/** Lista todas las sedes registradas. */
export function obtenerSedes(): Promise<Sede[]> {
  return api.get<Sede[]>('/sedes');
}

// ── Proveedores ───────────────────────────────────────────────────────────

/**
 * Lista proveedores. Por defecto todos (para la pantalla de gestión); con
 * `soloActivos` devuelve solo los de alta (para los selectores de factura).
 */
export function obtenerProveedores(opciones?: { soloActivos?: boolean }): Promise<Proveedor[]> {
  const query = opciones?.soloActivos ? '?activo=true' : '';
  return api.get<Proveedor[]>(`/proveedores${query}`);
}

/**
 * Crea un nuevo proveedor.
 * Requiere rol supervisor o administrador.
 */
export function crearProveedor(cuerpo: CuerpoCrearProveedor): Promise<Proveedor> {
  return api.post<Proveedor>('/proveedores', cuerpo);
}

/**
 * Edita un proveedor (incluye la baja/alta lógica vía `activo`).
 * Requiere rol supervisor o administrador.
 */
export function editarProveedor(id: string, cuerpo: CuerpoEditarProveedor): Promise<Proveedor> {
  return api.put<Proveedor>(`/proveedores/${id}`, cuerpo);
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

/**
 * Historial de pagos de la empresa (GET /cuentas-por-pagar/pagos).
 *
 * Devuelve la página pedida, su paginación y un resumen calculado sobre TODO el
 * conjunto filtrado (no solo la página): los totales de arriba son los de verdad.
 * Cada pago trae su estado de corrección (vigente / corregido / anulado) y el
 * monto que vale hoy; el monto original nunca se sobrescribe.
 */
export function obtenerHistorialPagos(
  filtros: FiltrosPagos = {},
): Promise<RespuestaHistorialPagos> {
  const params = new URLSearchParams();
  if (filtros.proveedorId) params.set('proveedorId', filtros.proveedorId);
  if (filtros.desde) params.set('desde', filtros.desde);
  if (filtros.hasta) params.set('hasta', filtros.hasta);
  if (filtros.estado) params.set('estado', filtros.estado);
  if (filtros.pagina) params.set('pagina', String(filtros.pagina));
  if (filtros.tamano) params.set('tamano', String(filtros.tamano));
  const query = params.toString();
  return api.get<RespuestaHistorialPagos>(
    `/cuentas-por-pagar/pagos${query ? `?${query}` : ''}`,
  );
}
