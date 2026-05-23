import type {
  AdaptadorCorreccion,
  MovimientoBase,
} from '../../shared/services/correccion.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

/** Movimiento de pago con lo que el servicio de corrección necesita. */
interface PagoMovimiento extends MovimientoBase {
  compraId: string;
  monto: Prisma.Decimal;
}

/**
 * Adaptador de corrección para PagoProveedor. Carga el pago original y crea los
 * asientos de reverso (mismo monto) y de corrección (monto nuevo), copiando la
 * compra a la que pertenecen. La fecha de pago del asiento es la del día de la
 * corrección.
 */
export const adaptadorPago: AdaptadorCorreccion<PagoMovimiento> = {
  entidad: 'pago',

  async cargar(id, tx) {
    return tx.pagoProveedor.findUnique({
      where: { id },
      select: { id: true, tipo: true, compraId: true, monto: true },
    });
  },

  async crearReverso(original, datos, tx) {
    return tx.pagoProveedor.create({
      data: {
        compraId: original.compraId,
        monto: original.monto,
        fechaPago: new Date(),
        tipo: 'reverso',
        corrigeId: original.id,
        motivo: datos.motivo,
        usuarioId: datos.usuarioId,
      },
      select: { id: true, tipo: true },
    });
  },

  async crearCorreccion(original, montoCorregido, datos, tx) {
    return tx.pagoProveedor.create({
      data: {
        compraId: original.compraId,
        monto: montoCorregido,
        fechaPago: new Date(),
        tipo: 'correccion',
        corrigeId: original.id,
        motivo: datos.motivo,
        usuarioId: datos.usuarioId,
      },
      select: { id: true, tipo: true },
    });
  },
};
