import type { Prisma } from '../../generated/prisma/client.js';
import type { ClienteTx } from '../../core/prisma.js';

/**
 * Datos de un asiento de auditoría de PLATAFORMA. `detalle` es JSON libre y opcional;
 * JAMÁS debe contener contraseñas ni secretos (mismo criterio que `Auditoria`).
 */
export interface AsientoPlataforma {
  /** Super-admin que ejecutó la acción. SIEMPRE del token (request.user.sub), nunca del body. */
  actorUsuarioId: string;
  /** Acción de plataforma (crear_empresa, crear_admin_inicial, desactivar_empresa, ...). */
  accion: string;
  /** Empresa OBJETO de la acción; se OMITE (null) en acciones de plataforma sin empresa. */
  empresaAfectadaId?: string | null;
  detalle?: Prisma.InputJsonValue;
  /**
   * IP del actor. Opcional: hoy el servicio de plataforma NO recibe la request, así que
   * queda `null`. La columna existe para cuando el contexto la provea (batch futuro).
   */
  ip?: string | null;
}

/**
 * Repositorio de auditoría de PLATAFORMA: bitácora APPEND-ONLY, SEPARADA de la de
 * tenant (`auditoriaRepo`). Registra las operaciones del super-admin (crear/estado de
 * empresa, alta de admin inicial, altas de membresía) SIN contaminar la `Auditoria`
 * scoped por tenant.
 *
 * Superficie deliberadamente cerrada: solo `registrar` (inserción). No hay update ni
 * delete. Recibe el cliente transaccional `tx` para que el asiento quede atado a la
 * MISMA transacción que la operación auditada (o todo, o nada). Es una de las tres
 * capas que protegen la inmutabilidad (las otras: el REVOKE de UPDATE/DELETE en
 * post-migrate.sql y la ausencia de campos mutables en el modelo).
 *
 * `auditoria_plataforma` está FUERA de RLS (allowlist), así que se escribe sin depender
 * del GUC de tenant; funciona igual dentro de una tx con bypass de plataforma.
 */
export const auditoriaPlataformaRepo = {
  async registrar(asiento: AsientoPlataforma, tx: ClienteTx): Promise<void> {
    await tx.auditoriaPlataforma.create({
      data: {
        actorUsuarioId: asiento.actorUsuarioId,
        accion: asiento.accion,
        // empresa_afectada_id es NULLABLE: se omite en acciones sin empresa.
        ...(asiento.empresaAfectadaId != null
          ? { empresaAfectadaId: asiento.empresaAfectadaId }
          : {}),
        ...(asiento.detalle !== undefined ? { detalle: asiento.detalle } : {}),
        ...(asiento.ip != null ? { ip: asiento.ip } : {}),
      },
    });
  },
};
