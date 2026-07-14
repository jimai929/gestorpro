/**
 * Estado de corrección de un movimiento de dinero, para los LISTADOS.
 *
 * El movimiento original es INMUTABLE: nunca se edita ni se borra. Cuando se
 * corrige, se le cuelgan asientos (`reverso` y, si hubo corrección de monto,
 * `correccion`). Los listados devuelven solo los movimientos `normal`, así que
 * sin mirar sus asientos la UI no puede saber si una fila sigue vigente, fue
 * anulada, o su monto vigente es otro. Este resumen es SOLO de presentación:
 * los cálculos de dinero (dashboard, saldos) siguen sumando los asientos en SQL.
 *
 *   vigente   → sin reverso: el monto original es el que vale.
 *   anulado   → hay reverso y NO hay corrección: el movimiento vale 0.
 *   corregido → hay reverso y hay corrección: vale el monto de la corrección.
 */
export type EstadoMovimiento = 'vigente' | 'anulado' | 'corregido';

/** Asiento mínimo (reverso o corrección) que cuelga de un movimiento normal. */
export interface AsientoResumen {
  tipo: string;
  monto: { toString(): string };
  motivo?: string | null;
}

export interface ResumenCorreccion {
  estado: EstadoMovimiento;
  /** Monto que vale HOY el movimiento: original, 0 (anulado) o el corregido. */
  montoVigente: number;
  /** Motivo declarado al corregir (null si sigue vigente). */
  motivoCorreccion: string | null;
}

/**
 * Resume los asientos de un movimiento normal. `montoOriginal` ya viene
 * serializado a number (el DTO de cada entidad lo convierte desde Decimal).
 */
export function resumirCorreccion(
  montoOriginal: number,
  asientos: AsientoResumen[],
): ResumenCorreccion {
  const reverso = asientos.find((a) => a.tipo === 'reverso');
  if (!reverso) {
    return { estado: 'vigente', montoVigente: montoOriginal, motivoCorreccion: null };
  }
  const correccion = asientos.find((a) => a.tipo === 'correccion');
  const motivoCorreccion = correccion?.motivo ?? reverso.motivo ?? null;
  if (!correccion) {
    return { estado: 'anulado', montoVigente: 0, motivoCorreccion };
  }
  return {
    estado: 'corregido',
    montoVigente: Number(correccion.monto),
    motivoCorreccion,
  };
}
