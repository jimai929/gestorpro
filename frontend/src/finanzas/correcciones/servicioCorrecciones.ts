/**
 * Servicio de CORRECCIÓN de movimientos de dinero.
 *
 * El dinero es INMUTABLE: un gasto, un pago o un cierre de caja registrados no
 * se editan ni se borran. Para arreglar un error se crea un asiento de `reverso`
 * (anula el original) y, si el movimiento sí existía pero con otro importe, un
 * asiento de `correccion` con el valor bueno. Un movimiento admite UNA sola
 * corrección (el backend responde 409 a la segunda).
 *
 * Ruta: POST /correcciones (supervisor / administrador; el usuarioId sale del JWT).
 */

import { api } from '../../core/api';
import type { LineaArqueo } from '../dashboard/tipos';

/** Entidades de dinero que admiten corrección. */
export type EntidadCorregible = 'gasto' | 'pago' | 'venta';

/**
 * Cuerpo de POST /correcciones.
 * - Sin `montoCorregido` ni `detallesCorregidos` → ANULACIÓN pura (el movimiento no existía).
 * - Con `montoCorregido` (gasto/pago) o `detallesCorregidos` (cierre de caja) → corrección.
 */
export interface CuerpoCorreccion {
  entidad: EntidadCorregible;
  movimientoId: string;
  motivo: string;
  montoCorregido?: number;
  detallesCorregidos?: LineaArqueo[];
}

/** Asiento creado por la corrección (reverso y, opcionalmente, corrección). */
export interface ResultadoCorreccion {
  reverso: { id: string; tipo: string };
  correccion: { id: string; tipo: string } | null;
}

/** Corrige (o anula) un movimiento de dinero. Lanza ErrorHttp con el mensaje del backend. */
export function corregirMovimiento(cuerpo: CuerpoCorreccion): Promise<ResultadoCorreccion> {
  return api.post<ResultadoCorreccion>('/correcciones', cuerpo);
}
