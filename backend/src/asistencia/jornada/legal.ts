/**
 * Capa LEGAL FIJA — Código de Trabajo de Panamá.
 *
 * ✅ VALIDADO (2026-06-17): un asesor laboral panameño confirmó estos valores
 * (divisor horario, recargos, franja nocturna, jornadas, topes y el manejo de
 * festivos) SIN cambios. Detalle del veredicto en docs/VALIDACION_LEGAL.md.
 * Si el asesor corrigiera algún valor, cambiar SOLO la constante de aquí y
 * recalcular las jornadas afectadas.
 *
 * Regla de diseño innegociable: los recargos NO son configurables. No debe
 * existir ninguna opción que permita pagar por debajo de estos mínimos.
 */

/** Franja nocturna: de las 18:00 a las 06:00. */
export const FRANJA_NOCTURNA = { inicioHora: 18, finHora: 6 } as const;

/** Jornada legal máxima por clasificación, en minutos (diurna 8h, nocturna 7h, mixta 7.5h). */
export const JORNADA_LEGAL_MIN = {
  diurna: 8 * 60,
  nocturna: 7 * 60,
  mixta: 7.5 * 60,
} as const;

/** Recargos de hora extra (fracción sobre la hora ordinaria). FIJOS. */
export const RECARGOS = {
  diurna: 0.25,
  nocturna: 0.5,
  mixtaNocturna: 0.75,
  festivo: 1.5,
} as const;

/**
 * Topes de horas extra, en minutos: 3h/día y 9h/semana. Ambos se aplican en
 * `calculo.ts` (el semanal vía la extra pagable acumulada de la semana). El
 * excedente no se paga sin revisión del jefe. ⚠️ Valores y tratamiento PENDIENTES
 * de validación legal — ver docs/VALIDACION_LEGAL.md (puntos 10-11).
 */
export const TOPES_EXTRA_MIN = {
  dia: 3 * 60,
  semana: 9 * 60,
} as const;

/**
 * Divisor para el valor-hora: valorHora = salarioMensual ÷ este número.
 * ⚠️ INTERPRETACIÓN (240 = 30 días × 8 h diarias), asumiendo salario MENSUAL.
 * PENDIENTE de validación por un asesor laboral panameño. Cambiar SOLO aquí.
 */
export const DIVISOR_HORAS_MES = 240;

export type Clasificacion = 'diurna' | 'nocturna' | 'mixta';

/** Recargo (fracción) aplicable a la hora extra según clasificación y festivo. */
export function recargoExtra(clasificacion: Clasificacion, esFestivo: boolean): number {
  if (esFestivo) return RECARGOS.festivo;
  if (clasificacion === 'nocturna') return RECARGOS.nocturna;
  if (clasificacion === 'mixta') return RECARGOS.mixtaNocturna;
  return RECARGOS.diurna;
}

/** Valor de la hora ordinaria a partir del salario mensual (ver DIVISOR_HORAS_MES). */
export function valorHora(salarioMensual: number): number {
  return salarioMensual / DIVISOR_HORAS_MES;
}

/**
 * Minutos que caen en la franja nocturna (18:00–06:00) entre dos instantes.
 * Se recorre minuto a minuto: las jornadas están acotadas (≤ ~16h), así que es
 * barato y evita errores de borde con la ventana que cruza medianoche.
 */
export function minutosNocturnos(inicio: Date, fin: Date): number {
  const totalMin = Math.round((fin.getTime() - inicio.getTime()) / 60000);
  if (totalMin <= 0) return 0;

  let nocturnos = 0;
  for (let i = 0; i < totalMin; i++) {
    const hora = new Date(inicio.getTime() + i * 60000).getHours();
    const esNocturno = hora >= FRANJA_NOCTURNA.inicioHora || hora < FRANJA_NOCTURNA.finHora;
    if (esNocturno) nocturnos++;
  }
  return nocturnos;
}
