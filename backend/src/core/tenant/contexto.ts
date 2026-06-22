import { AsyncLocalStorage } from 'node:async_hooks';
import { prisma, type ClienteTx } from '../prisma.js';

/**
 * Contexto de tenant de la request/job en curso. Es DATO DE SEGURIDAD: el
 * `empresaId` sale SIEMPRE del token/sesión autenticados (o, en jobs, se pasa
 * explícito), NUNCA del body. Lo transporta un AsyncLocalStorage para no tener
 * que hilar `empresaId` por cada firma de servicio.
 */
export interface ContextoTenant {
  empresaId: string | null;
  esSuperAdmin: boolean;
  /** Solo lo activan endpoints soloPlataforma (Fase 4c). Abre la policy bypass. */
  bypassPlataforma?: boolean;
}

const alsTenant = new AsyncLocalStorage<ContextoTenant>();

/** Ejecuta `fn` con el contexto de tenant fijado (request preHandler, jobs, tests). */
export function conContextoTenant<T>(ctx: ContextoTenant, fn: () => T): T {
  return alsTenant.run(ctx, fn);
}

/** Fija el contexto para el resto del contexto async actual (preHandler Fastify). */
export function fijarContextoTenant(ctx: ContextoTenant): void {
  alsTenant.enterWith(ctx);
}

/** Contexto actual o uno vacío (fail-closed: empresaId null). */
export function contextoTenantActual(): ContextoTenant {
  return alsTenant.getStore() ?? { empresaId: null, esSuperAdmin: false };
}

interface OpcionesTxEmpresa {
  /** Override explícito del empresaId (jobs/bootstrap), si no se usa el de la ALS. */
  empresaId?: string | null;
  /** Activa el bypass de plataforma (solo super-admin / bootstrap auditado). */
  bypassPlataforma?: boolean;
  /** Opciones de $transaction de Prisma (p.ej. isolationLevel/timeout de CxP). */
  tx?: Parameters<typeof prisma.$transaction>[1];
}

/**
 * Abre una `$transaction` y fija el GUC de tenant `app.empresa_id` LOCAL (muere en
 * COMMIT/ROLLBACK → no contamina la conexión del pool). RLS de Postgres usa ese GUC
 * para aislar. Reglas:
 *  - `empresaId` se toma del override explícito o de la ALS (request/job). NUNCA del
 *    body. Si es null y no hay bypass → el GUC NO se fija → RLS da 0 filas / WITH
 *    CHECK rechaza: FAIL-CLOSED.
 *  - El bypass de plataforma solo se activa si es super-admin (o se pide explícito en
 *    un bootstrap auditado) → fija `app.bypass_tenant='on'`.
 *
 * Todo acceso a datos de tenant (lectura o escritura, dentro o fuera de request)
 * DEBE pasar por aquí.
 */
export function txEmpresa<T>(
  fn: (tx: ClienteTx) => Promise<T>,
  opc: OpcionesTxEmpresa = {},
): Promise<T> {
  const ctx = contextoTenantActual();
  const empresaId = opc.empresaId !== undefined ? opc.empresaId : ctx.empresaId;
  const bypass = opc.bypassPlataforma ?? ctx.bypassPlataforma ?? false;
  const esSuperAdmin = ctx.esSuperAdmin;

  return prisma.$transaction(async (tx) => {
    if (bypass && esSuperAdmin) {
      // Bypass de plataforma: SOLO si el contexto es super-admin (verificado en
      // auth, no proviene del body). Pedir bypass sin ser super-admin NO abre nada
      // → cae a la rama de empresaId (aislamiento normal). El bootstrap del kiosco
      // (fichaje, Fase 5) NO es super-admin: usará un mecanismo propio explícito e
      // interno, nunca este flag ni nada alcanzable desde la request.
      await tx.$executeRaw`SELECT set_config('app.bypass_tenant', 'on', true)`;
    } else if (empresaId) {
      // GUC de tenant LOCAL. Sin empresaId NO se fija → fail-closed (0 filas).
      await tx.$executeRaw`SELECT set_config('app.empresa_id', ${empresaId}, true)`;
    }
    return fn(tx as ClienteTx);
  }, opc.tx);
}
