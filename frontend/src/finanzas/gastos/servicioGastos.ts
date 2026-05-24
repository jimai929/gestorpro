/**
 * Servicio de gastos.
 * Encapsula todas las llamadas al backend para este módulo.
 */

import { api } from '../../core/api';
import type {
  CategoriaGasto,
  Sede,
  Gasto,
  CuerpoRegistrarGasto,
  FiltrosGasto,
} from './tipos';

// ── Categorías de gasto ───────────────────────────────────────────────────

/** Lista todas las categorías de gasto disponibles. */
export function obtenerCategoriasGasto(): Promise<CategoriaGasto[]> {
  return api.get<CategoriaGasto[]>('/categorias-gasto');
}

// ── Sedes ─────────────────────────────────────────────────────────────────

/** Lista todas las sedes registradas. */
export function obtenerSedes(): Promise<Sede[]> {
  return api.get<Sede[]>('/sedes');
}

// ── Gastos ────────────────────────────────────────────────────────────────

/**
 * Registra un nuevo gasto.
 * El backend aplica la regla de coherencia de empleado:
 *   - Categoría de pago a empleado → empleadoId obligatorio.
 *   - Categoría normal → empleadoId y tipoPago deben estar ausentes.
 * Devuelve 400 con { mensaje } si la coherencia falla.
 */
export function registrarGasto(cuerpo: CuerpoRegistrarGasto): Promise<Gasto> {
  return api.post<Gasto>('/gastos', cuerpo);
}

/**
 * Lista los gastos registrados en el período indicado.
 * @param filtros - Rango obligatorio (desde/hasta) y sede opcional.
 */
export function obtenerGastos(filtros: FiltrosGasto): Promise<Gasto[]> {
  const params = new URLSearchParams();
  params.set('desde', filtros.desde);
  params.set('hasta', filtros.hasta);
  if (filtros.sedeId) params.set('sedeId', filtros.sedeId);
  return api.get<Gasto[]>(`/gastos?${params.toString()}`);
}
