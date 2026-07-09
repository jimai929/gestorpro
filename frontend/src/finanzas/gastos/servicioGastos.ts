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
  CuerpoCrearCategoria,
  CuerpoActualizarCategoria,
  FiltrosGasto,
} from './tipos';

// ── Categorías de gasto ───────────────────────────────────────────────────

/**
 * Lista las categorías de gasto de la empresa. Por defecto solo las activas (las
 * consume el select del formulario de gasto); con `incluirInactivas`, todas (para
 * la pantalla de gestión, que permite reactivar).
 */
export function obtenerCategoriasGasto(opciones?: {
  incluirInactivas?: boolean;
}): Promise<CategoriaGasto[]> {
  const query = opciones?.incluirInactivas ? '?incluirInactivas=true' : '';
  return api.get<CategoriaGasto[]>(`/categorias-gasto${query}`);
}

/** Crea una categoría personalizada (supervisor/administrador). */
export function crearCategoria(cuerpo: CuerpoCrearCategoria): Promise<CategoriaGasto> {
  return api.post<CategoriaGasto>('/categorias-gasto', cuerpo);
}

/** Edita una categoría: nombre y/o baja/alta lógica (`activo`). NO cambia esPagoEmpleado. */
export function actualizarCategoria(
  id: string,
  cuerpo: CuerpoActualizarCategoria,
): Promise<CategoriaGasto> {
  return api.patch<CategoriaGasto>(`/categorias-gasto/${id}`, cuerpo);
}

/** Baja LÓGICA (soft delete) de una categoría: `activo=false`. Nunca borra la fila. */
export function desactivarCategoria(id: string): Promise<CategoriaGasto> {
  return api.delete<CategoriaGasto>(`/categorias-gasto/${id}`);
}

// ── Sedes ─────────────────────────────────────────────────────────────────

/** Lista todas las sedes registradas. */
export function obtenerSedes(): Promise<Sede[]> {
  return api.get<Sede[]>('/sedes');
}

// ── Empleados (para resolver el nombre del empleado de un gasto) ───────────

/** Subconjunto del empleado que basta para mostrar "número - nombre". */
export interface EmpleadoResumen {
  id: string;
  numero: string;
  nombre: string;
}

/** Lista empleados (incluye inactivos: un gasto puede referenciar a uno dado de baja). */
export function obtenerEmpleados(): Promise<EmpleadoResumen[]> {
  return api.get<EmpleadoResumen[]>('/empleados?incluirInactivos=true');
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
