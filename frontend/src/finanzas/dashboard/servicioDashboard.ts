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
  CuerpoRegistrarVenta,
  FiltrosDashboard,
} from './tipos';

// ── Sedes ─────────────────────────────────────────────────────────────────

/** Lista todas las sedes registradas. */
export function obtenerSedes(): Promise<Sede[]> {
  return api.get<Sede[]>('/sedes');
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
 * Error especial que indica que ya existe un cierre normal para esa (sede, fecha).
 * El backend devuelve 409 con { mensaje } en ese caso.
 */
export class ErrorCierreDuplicado extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorCierreDuplicado';
  }
}

const URL_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Registra el cierre de ventas del día.
 * Lanza `ErrorCierreDuplicado` si el backend responde 409 (ya existe el cierre normal
 * de esa sede y fecha). Para cualquier otro error, lanza Error genérico.
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
    let mensaje = 'Ya existe el cierre de esa fecha; use una corrección para ajustarlo.';
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
  return api.get<VentaDiaria[]>(`/ventas?${params.toString()}`);
}
