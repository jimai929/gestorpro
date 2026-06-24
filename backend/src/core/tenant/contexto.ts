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

/**
 * Inicia un contexto de tenant VACÍO (fail-closed) para la request actual. Se llama
 * en el hook `onRequest` —el PUNTO MÁS TEMPRANO del ciclo de la request— para que
 * cada request tenga su PROPIO store en la raíz de su contexto async. Hacerlo aquí
 * (y no en un preHandler tardío) evita que `enterWith` se pierda o se cruce entre
 * requests concurrentes: el store queda en la raíz y lo heredan todos los hooks y el
 * handler. `autenticar` luego MUTA este store (no re-entra) con el tenant del token.
 */
export function iniciarContextoTenant(): void {
  alsTenant.enterWith({ empresaId: null, esSuperAdmin: false });
}

/** Muta el store de la request actual (lo llama `autenticar` tras verificar el token). */
export function actualizarContextoTenant(parcial: Partial<ContextoTenant>): void {
  const store = alsTenant.getStore();
  if (store) Object.assign(store, parcial);
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

  // Fail-LOUD (revisor I-2): pedir bypass de plataforma SIN contexto super-admin es
  // un error de programación (una ruta no-plataforma no debe pedirlo). Antes esto
  // degradaba EN SILENCIO a la rama de empresaId (fail-closed solo por accidente, vía
  // la RLS de auditoría); ahora se rechaza explícito. Defensa en profundidad sobre el
  // guard soloPlataforma. NO afecta a los llamadores legítimos (que sí son super-admin).
  if (bypass && !esSuperAdmin) {
    throw new Error('txEmpresa: bypassPlataforma requiere un contexto super-admin.');
  }

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

/**
 * Bootstrap de autenticación de DISPOSITIVO (kiosco): resuelve el tenant ANTES de
 * tener contexto. El dispositivo se identifica con su token (no es un usuario, no
 * tiene JWT ni super-admin), así que para LEER su propia fila de kiosco —protegida
 * por RLS— se abre una tx con el bypass de RLS acotado a esa lectura.
 *
 * USO INTERNO EXCLUSIVO (solo `resolverContextoKiosco`). Reglas (las 4 acordadas):
 *  1) Solo para una LECTURA ACOTADA (la fila del kiosco + su sede.empresa_id); jamás
 *     para servir datos de tenant.
 *  2) El acceso real a datos del fichaje se hace DESPUÉS, con el empresaId resuelto,
 *     en `conContextoTenant`/`txEmpresa` bajo RLS normal.
 *  3) NUNCA alcanzable desde el body de una request de usuario: el único parámetro
 *     que entra es el kioscoId/token del dispositivo, y solo se usa para resolver
 *     su empresa, no para abrir el bypass a discreción del llamador.
 *  4) Auditable: el rastro queda en el propio Fichaje (quién/qué kiosco). No se
 *     audita cada bootstrap (sería ruido en cada fichaje).
 */
export function txBootstrapDispositivo<T>(fn: (tx: ClienteTx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_tenant', 'on', true)`;
    return fn(tx as ClienteTx);
  });
}
