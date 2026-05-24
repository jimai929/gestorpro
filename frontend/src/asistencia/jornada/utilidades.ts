/**
 * Utilidades de presentación para el módulo de jornadas.
 */

/**
 * Convierte minutos a formato legible "Xh Ym".
 * Ejemplos: 90 → "1h 30m", 60 → "1h 0m", 30 → "0h 30m"
 */
export function minutosAHorasMinutos(minutos: number): string {
  const horas = Math.floor(minutos / 60);
  const mins = minutos % 60;
  return `${horas}h ${mins}m`;
}

/**
 * Formatea un valor numérico como moneda panameña (balboa).
 * Siempre muestra 2 decimales con prefijo B/.
 */
export function formatearDinero(valor: number): string {
  return `B/. ${valor.toFixed(2)}`;
}

/**
 * Formatea una fecha ISO (YYYY-MM-DD) a "DD/MM/AAAA".
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
