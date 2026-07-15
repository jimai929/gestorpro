/**
 * Servicio del dashboard de ganancias y ventas diarias.
 * Encapsula todas las llamadas al backend para este módulo.
 */

import { api, obtenerAccessToken } from '../../core/api';
import type {
  Sede,
  ResumenGanancia,
  GastoPorCategoria,
  VentaDiaria,
  EmpleadoCierre,
  CuerpoRegistrarVenta,
  FiltrosDashboard,
} from './tipos';
import type { FiltrosFlujo, RespuestaFlujoCaja } from './flujo-caja-tipos';

// ── Sedes ─────────────────────────────────────────────────────────────────

/** Lista todas las sedes registradas. */
export function obtenerSedes(): Promise<Sede[]> {
  return api.get<Sede[]>('/sedes');
}

// ── Empleados por rol operativo (selects de cajera/verificador) ─────────────

/**
 * Empleados activos con un rol operativo dado (`cajera`, `verificador`). NO se
 * filtra por sede: a veces un empleado cubre otra sede. El orden por sede del
 * cierre se aplica en el formulario.
 */
export function obtenerEmpleadosPorRol(rol: string): Promise<EmpleadoCierre[]> {
  return api.get<EmpleadoCierre[]>(`/empleados?rol=${encodeURIComponent(rol)}`);
}

// ── Dashboard ─────────────────────────────────────────────────────────────

/**
 * Obtiene el resumen de ganancia del período.
 * Ganancia = ventas − compras − gastos.
 * Las compras se contabilizan por devengado (fecha de factura).
 */
export function obtenerGanancia(filtros: FiltrosDashboard): Promise<ResumenGanancia> {
  const params = new URLSearchParams();
  params.set('desde', filtros.desde);
  params.set('hasta', filtros.hasta);
  if (filtros.sedeId) params.set('sedeId', filtros.sedeId);
  // Cajera y turno acotan solo las ventas (auditoría de descuadres).
  if (filtros.cajera) params.set('cajera', filtros.cajera);
  if (filtros.turno) params.set('turno', filtros.turno);
  return api.get<ResumenGanancia>(`/dashboard/ganancia?${params.toString()}`);
}

/**
 * Obtiene la lista de gastos desglosada por categoría en el período.
 */
export function obtenerGastosPorCategoria(
  filtros: FiltrosDashboard,
): Promise<GastoPorCategoria[]> {
  const params = new URLSearchParams();
  params.set('desde', filtros.desde);
  params.set('hasta', filtros.hasta);
  if (filtros.sedeId) params.set('sedeId', filtros.sedeId);
  return api.get<GastoPorCategoria[]>(`/dashboard/gastos-por-categoria?${params.toString()}`);
}

// ── Ventas diarias ────────────────────────────────────────────────────────

/**
 * Error especial que indica que ya existe un cierre normal para esa
 * (sede, fecha, turno, cajera). El backend devuelve 409 con { mensaje } en ese caso.
 */
export class ErrorCierreDuplicado extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorCierreDuplicado';
  }
}

const URL_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Registra el cierre de caja de un turno (con su arqueo).
 * Lanza `ErrorCierreDuplicado` si el backend responde 409 (ya existe el cierre
 * normal de esa sede, fecha, turno y cajera). Para cualquier otro error, lanza Error.
 */
export async function registrarVenta(cuerpo: CuerpoRegistrarVenta): Promise<VentaDiaria> {
  // Necesitamos acceder al status HTTP crudo para distinguir 409 del resto;
  // el cliente genérico (api.post) ya consume el cuerpo del error y lanza Error,
  // por eso usamos fetch directamente aquí.
  const token = obtenerAccessToken();
  const cabeceras: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    cabeceras['Authorization'] = `Bearer ${token}`;
  }

  const respuesta = await fetch(`${URL_BASE}/ventas`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify(cuerpo),
  });

  if (respuesta.status === 409) {
    let mensaje = 'Ya existe el cierre de esa cajera y turno; use una corrección para ajustarlo.';
    try {
      const cuerpoError = await respuesta.json() as { mensaje?: string };
      mensaje = cuerpoError.mensaje ?? mensaje;
    } catch {
      // El cuerpo no es JSON — usar el mensaje por defecto
    }
    throw new ErrorCierreDuplicado(mensaje);
  }

  if (!respuesta.ok) {
    let mensajeError = `Error ${respuesta.status}`;
    try {
      const cuerpoError = await respuesta.json() as { mensaje?: string; message?: string; error?: string };
      mensajeError = cuerpoError.mensaje ?? cuerpoError.message ?? cuerpoError.error ?? mensajeError;
    } catch {
      // El cuerpo no es JSON — mantener el mensaje genérico
    }
    throw new Error(mensajeError);
  }

  return respuesta.json() as Promise<VentaDiaria>;
}

/**
 * Lista las ventas diarias registradas en el período indicado.
 */
export function obtenerVentas(filtros: FiltrosDashboard): Promise<VentaDiaria[]> {
  const params = new URLSearchParams();
  params.set('desde', filtros.desde);
  params.set('hasta', filtros.hasta);
  if (filtros.sedeId) params.set('sedeId', filtros.sedeId);
  if (filtros.cajera) params.set('cajera', filtros.cajera);
  if (filtros.turno) params.set('turno', filtros.turno);
  return api.get<VentaDiaria[]>(`/ventas?${params.toString()}`);
}

/**
 * Valores distintos de cajera presentes en los cierres, para poblar el filtro
 * del dashboard (incluye los valores legacy/texto libre).
 */
export function obtenerCajeras(): Promise<string[]> {
  return api.get<string[]>('/ventas/cajeras');
}

// ── Flujo de caja operativo ─────────────────────────────────────────────────

/**
 * Flujo de caja operativo (GET /finanzas/flujo-caja). Solo lectura: reúne los
 * movimientos de dinero YA registrados (ventas, gastos, pagos), con su monto
 * vigente y estado. No es ganancia ni el saldo real de banco. El backend aplica el
 * mismo criterio de corrección que el resto del módulo.
 */
export function obtenerFlujoCaja(filtros: FiltrosFlujo): Promise<RespuestaFlujoCaja> {
  const params = new URLSearchParams();
  params.set('desde', filtros.desde);
  params.set('hasta', filtros.hasta);
  if (filtros.tipo && filtros.tipo !== 'todos') params.set('tipo', filtros.tipo);
  if (filtros.sedeId) params.set('sedeId', filtros.sedeId);
  if (filtros.proveedorId) params.set('proveedorId', filtros.proveedorId);
  if (filtros.categoriaId) params.set('categoriaId', filtros.categoriaId);
  if (filtros.estado && filtros.estado !== 'todos') params.set('estado', filtros.estado);
  if (filtros.texto) params.set('texto', filtros.texto);
  if (filtros.orden) params.set('orden', filtros.orden);
  if (filtros.pagina) params.set('pagina', String(filtros.pagina));
  if (filtros.tamano) params.set('tamano', String(filtros.tamano));
  return api.get<RespuestaFlujoCaja>(`/finanzas/flujo-caja?${params.toString()}`);
}
