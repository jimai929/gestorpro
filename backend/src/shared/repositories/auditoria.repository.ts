import type { Prisma } from '../../generated/prisma/client.js';
import type { ClienteTx } from '../../core/prisma.js';

/** Datos de un asiento de auditoría. `detalle` es JSON libre y opcional. */
export interface AsientoAuditoria {
  entidad: string;
  entidadId: string;
  accion: string;
  usuarioId: string;
  /**
   * Empresa del asiento. Normalmente se OMITE: lo rellena el DEFAULT desde el GUC
   * `app.empresa_id` que fija txEmpresa. Se pasa EXPLÍCITO solo en operaciones de
   * PLATAFORMA (bypass de super-admin, Fase 4c), donde el GUC de tenant no está
   * fijado y el DEFAULT daría NULL → violaría NOT NULL. En ese caso registra el
   * tenant OBJETO de la acción cross-tenant.
   */
  empresaId?: string;
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
        // Solo en operaciones de plataforma (bypass); si se omite, lo rellena el
        // DEFAULT desde el GUC de tenant (comportamiento de SIEMPRE, sin cambios).
        ...(asiento.empresaId !== undefined ? { empresaId: asiento.empresaId } : {}),
        ...(asiento.detalle !== undefined ? { detalle: asiento.detalle } : {}),
      },
    });
  },
};
