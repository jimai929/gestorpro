import type {
  AdaptadorCorreccion,
  MovimientoBase,
} from '../../shared/services/correccion.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

/** Venta diaria con lo que el servicio de corrección necesita. */
interface VentaMovimiento extends MovimientoBase {
  sedeId: string;
  fechaOperacion: Date;
  monto: Prisma.Decimal;
}

/**
 * Adaptador de corrección para VentaDiaria. Los asientos de reverso/corrección
 * llevan la misma (sede, fecha) que el original: no chocan con el índice único
 * parcial `uq_venta_normal` porque éste solo aplica a `tipo = 'normal'`.
 */
export const adaptadorVenta: AdaptadorCorreccion<VentaMovimiento> = {
  entidad: 'venta',

  async cargar(id, tx) {
    return tx.ventaDiaria.findUnique({
      where: { id },
      select: { id: true, tipo: true, sedeId: true, fechaOperacion: true, monto: true },
    });
  },

  async crearReverso(original, datos, tx) {
    return tx.ventaDiaria.create({
      data: {
        sedeId: original.sedeId,
        fechaOperacion: original.fechaOperacion,
        monto: original.monto,
        tipo: 'reverso',
        corrigeId: original.id,
        motivo: datos.motivo,
        usuarioId: datos.usuarioId,
      },
      select: { id: true, tipo: true },
    });
  },

  async crearCorreccion(original, montoCorregido, datos, tx) {
    return tx.ventaDiaria.create({
      data: {
        sedeId: original.sedeId,
        fechaOperacion: original.fechaOperacion,
        monto: montoCorregido,
        tipo: 'correccion',
        corrigeId: original.id,
        motivo: datos.motivo,
        usuarioId: datos.usuarioId,
      },
      select: { id: true, tipo: true },
    });
  },
};
