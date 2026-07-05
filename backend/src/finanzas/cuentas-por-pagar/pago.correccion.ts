import {
  ErrorCorreccion,
  type AdaptadorCorreccion,
  type MovimientoBase,
} from '../../shared/services/correccion.service.js';
import { ErrorConflicto } from '../../core/errors.js';
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

  async bloquearOriginal(id, tx) {
    // Orden de locks GLOBAL: pago → compra (registrarPago solo toma compra; sin ciclo).
    await tx.$queryRaw`SELECT id FROM pago_proveedor WHERE id = ${id}::uuid FOR UPDATE`;
    // La compra se bloquea AQUÍ (antes de insertar el reverso), no solo en el guard
    // de crearCorreccion: el INSERT del reverso toma FOR KEY SHARE sobre la compra
    // (FK), y pedir FOR UPDATE después sería un UPGRADE en cola — deadlock clásico
    // contra un abono concurrente que ya espera el FOR UPDATE. Tomando el lock
    // fuerte primero, el INSERT y el guard corren sobre un lock ya propio.
    await tx.$queryRaw`
      SELECT id FROM compra
      WHERE id = (SELECT compra_id FROM pago_proveedor WHERE id = ${id}::uuid)
      FOR UPDATE`;
  },

  async existeReverso(id, tx) {
    return (await tx.pagoProveedor.count({ where: { corrigeId: id, tipo: 'reverso' } })) > 0;
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

  hayCorreccion(entrada) {
    return entrada.montoCorregido !== undefined;
  },

  async crearCorreccion(original, entrada, datos, tx) {
    if (entrada.montoCorregido === undefined) {
      throw new ErrorCorreccion('Falta el monto corregido del pago.');
    }
    // Guard de sobrepago (espejo del de registrarPago, que solo cubre abonos).
    // El lock de la compra ya es NUESTRO desde bloquearOriginal (misma fila que
    // bloquea registrarPago → corrección y abono concurrentes serializados); el
    // FOR UPDATE de aquí es re-adquisición instantánea, defensiva. El SUM corre
    // DENTRO de la tx: el reverso recién insertado por esta misma corrección ya
    // cuenta (writes propios visibles), así que `pagado` refleja el estado
    // post-anulación. Si el monto corregido excede lo disponible, aborta y la tx
    // ENTERA revierte (incluido ese reverso): nunca queda media corrección.
    const compras = await tx.$queryRaw<Array<{ monto_total: string }>>`
      SELECT monto_total FROM compra WHERE id = ${original.compraId}::uuid FOR UPDATE`;
    if (compras.length === 0) {
      // FK garantiza la compra; si no aparece es contexto de tenant roto → fail-closed.
      throw new ErrorCorreccion('La compra del pago no existe.');
    }
    const montoTotal = Number(compras[0]?.monto_total);
    const filasPagado = await tx.$queryRaw<Array<{ pagado: string }>>`
      SELECT COALESCE(SUM(CASE WHEN tipo = 'reverso' THEN -monto ELSE monto END), 0) AS pagado
      FROM pago_proveedor WHERE compra_id = ${original.compraId}::uuid`;
    const pagado = Number(filasPagado[0]?.pagado);
    if (entrada.montoCorregido > montoTotal - pagado) {
      throw new ErrorConflicto(
        'La corrección excede el saldo de la factura: el pago efectivo superaría el total de la compra.',
      );
    }
    return tx.pagoProveedor.create({
      data: {
        compraId: original.compraId,
        monto: entrada.montoCorregido,
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
