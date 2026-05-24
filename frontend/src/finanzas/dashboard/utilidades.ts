/**
 * Utilidades de presentación para el módulo del dashboard.
 * Reutiliza las mismas convenciones que el módulo de gastos.
 */

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
  const soloFecha = fechaIso.slice(0, 10);
  const [anio, mes, dia] = soloFecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

/**
 * Devuelve la fecha de hoy en formato YYYY-MM-DD (zona local).
 */
export function fechaHoy(): string {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  const dia = String(hoy.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/**
 * Devuelve el primer día del mes actual en formato YYYY-MM-DD.
 */
export function primerDiaDelMes(): string {
  const hoy = new Date();
  const anio = hoy.getFullYear();
  const mes = String(hoy.getMonth() + 1).padStart(2, '0');
  return `${anio}-${mes}-01`;
}
