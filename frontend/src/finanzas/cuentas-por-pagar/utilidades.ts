/**
 * Utilidades de presentación para el módulo de cuentas por pagar.
 */

import type { EstadoCuenta } from './tipos';

/**
 * Formatea un valor numérico como moneda panameña (balboa).
 * Siempre muestra 2 decimales con prefijo B/.
 */
export function formatearDinero(valor: number): string {
  return `B/. ${valor.toFixed(2)}`;
}

/**
 * Formatea una fecha ISO (YYYY-MM-DD o ISO 8601) a formato legible en español.
 * Ejemplo: "2024-01-15" → "15/01/2024"
 */
export function formatearFecha(fechaIso: string): string {
  // Tomar solo la parte de fecha (YYYY-MM-DD) para evitar problemas de zona horaria
  const soloFecha = fechaIso.slice(0, 10);
  const [anio, mes, dia] = soloFecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

/** Etiquetas legibles para cada estado de cuenta. */
export const ETIQUETA_ESTADO: Record<EstadoCuenta, string> = {
  debido: 'Por pagar',
  vencida: 'Vencida',
  parcial: 'Parcial',
  pagado: 'Pagado',
};
