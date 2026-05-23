import type { Prisma } from '../../generated/prisma/client.js';
import type { ClienteTx } from '../../core/prisma.js';

/** Datos de un asiento de auditoría. `detalle` es JSON libre y opcional. */
export interface AsientoAuditoria {
  entidad: string;
  entidadId: string;
  accion: string;
  usuarioId: string;
  detalle?: Prisma.InputJsonValue;
}

/**
 * Repositorio de auditoría: bitácora APPEND-ONLY.
 *
 * Su superficie es deliberadamente cerrada: expone solo `registrar` (inserción).
 * No hay métodos de actualización ni de borrado. Toda escritura recibe el
 * cliente transaccional `tx` para que el asiento quede atado a la misma
 * transacción que la operación auditada. Es una de las tres capas que protegen
 * la inmutabilidad de la auditoría (las otras: el REVOKE en Postgres y la
 * ausencia de campos mutables en el modelo).
 */
export const auditoriaRepo = {
  async registrar(asiento: AsientoAuditoria, tx: ClienteTx): Promise<void> {
    await tx.auditoria.create({
      data: {
        entidad: asiento.entidad,
        entidadId: asiento.entidadId,
        accion: asiento.accion,
        usuarioId: asiento.usuarioId,
        ...(asiento.detalle !== undefined ? { detalle: asiento.detalle } : {}),
      },
    });
  },
};
