import {
  ErrorCorreccion,
  type AdaptadorCorreccion,
  type MovimientoBase,
} from '../../shared/services/correccion.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

/** Gasto con lo que el servicio de corrección necesita para copiar el asiento. */
interface GastoMovimiento extends MovimientoBase {
  categoriaId: string;
  sedeId: string;
  fechaOperacion: Date;
  empleadoId: string | null;
  tipoPago: string | null;
  referenciaOrigen: string | null;
  monto: Prisma.Decimal;
}

/**
 * Adaptador de corrección para Gasto. Copia los campos propios del gasto
 * (categoría, sede, fecha, datos de empleado, referenciaOrigen) en los asientos
 * de reverso (mismo monto) y de corrección (monto nuevo).
 */
export const adaptadorGasto: AdaptadorCorreccion<GastoMovimiento> = {
  entidad: 'gasto',

  async cargar(id, tx) {
    return tx.gasto.findUnique({
      where: { id },
      select: {
        id: true,
        tipo: true,
        categoriaId: true,
        sedeId: true,
        fechaOperacion: true,
        empleadoId: true,
        tipoPago: true,
        referenciaOrigen: true,
        monto: true,
      },
    });
  },

  async bloquearOriginal(id, tx) {
    await tx.$queryRaw`SELECT id FROM gasto WHERE id = ${id}::uuid FOR UPDATE`;
  },

  async existeReverso(id, tx) {
    return (await tx.gasto.count({ where: { corrigeId: id, tipo: 'reverso' } })) > 0;
  },

  async crearReverso(original, datos, tx) {
    return tx.gasto.create({
      data: {
        categoriaId: original.categoriaId,
        sedeId: original.sedeId,
        monto: original.monto,
        fechaOperacion: original.fechaOperacion,
        empleadoId: original.empleadoId,
        tipoPago: original.tipoPago,
        referenciaOrigen: original.referenciaOrigen,
        tipo: 'reverso',
        corrigeId: original.id,
        motivo: datos.motivo,
        usuarioId: datos.usuarioId,
      },
      select: { id: true, tipo: true },
    });
  },

  hayCorreccion(entrada) {
    return entrada.montoCorregido !== undefined;
  },

  async crearCorreccion(original, entrada, datos, tx) {
    if (entrada.montoCorregido === undefined) {
      throw new ErrorCorreccion('Falta el monto corregido del gasto.');
    }
    return tx.gasto.create({
      data: {
        categoriaId: original.categoriaId,
        sedeId: original.sedeId,
        monto: entrada.montoCorregido,
        fechaOperacion: original.fechaOperacion,
        empleadoId: original.empleadoId,
        tipoPago: original.tipoPago,
        referenciaOrigen: original.referenciaOrigen,
        tipo: 'correccion',
        corrigeId: original.id,
        motivo: datos.motivo,
        usuarioId: datos.usuarioId,
      },
      select: { id: true, tipo: true },
    });
  },
};
