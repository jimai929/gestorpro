import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { semilla, comoEmpresa, cerrarSemilla } from '../helpers/db.js';
import { sembrarDosEmpresas, type DosEmpresas } from './_fixture-dos-empresas.js';
import { listarCuentasPorPagar } from '../../src/finanzas/cuentas-por-pagar/cuentas-por-pagar.service.js';

/**
 * ⑦ Guardia de vistas con security_invoker (Fase 8, lote 2).
 *
 * Una VISTA en Postgres corre por defecto con los permisos de su OWNER. Aquí el
 * owner es el migrador (BYPASSRLS) → cualquier vista SIN `security_invoker=true`
 * IGNORARÍA la RLS de sus tablas base y FUGARÍA datos cross-tenant al consultarse
 * desde `gestorpro_app`. `cuenta_por_pagar` ya lo tiene; este test (a) prueba que el
 * aislamiento se hereda de verdad a nivel servicio, y (b) ENUMERA todas las vistas y
 * exige el flag en CADA una, para que una vista futura sin él falle el CI.
 */
describe('Fase 8 ⑦.1 — la vista cuenta_por_pagar hereda RLS (servicio)', () => {
  let f: DosEmpresas;

  beforeAll(async () => {
    f = await sembrarDosEmpresas();
  });
  afterAll(async () => {
    await cerrarSemilla();
  });

  it('actor A solo ve sus cuentas por pagar; nunca las de B', async () => {
    const ids = new Set(
      (await comoEmpresa(f.A.empresaId, () => listarCuentasPorPagar({}))).map((c) => c.compraId),
    );
    expect(ids.has(f.A.compraId)).toBe(true); // su compra a crédito con saldo aparece
    expect(ids.has(f.B.compraId)).toBe(false); // la de B NO
  });

  it('sin contexto, la vista no devuelve nada (fail-closed)', async () => {
    expect(await comoEmpresa(null, () => listarCuentasPorPagar({}))).toHaveLength(0);
  });
});

describe('Fase 8 ⑦.3 — TODA vista public debe ser security_invoker (enumeración)', () => {
  afterAll(async () => {
    await cerrarSemilla();
  });

  it('cada vista de public es security_invoker; ninguna matview sin revisar', async () => {
    // relkind 'v' = vista, 'm' = vista MATERIALIZADA. Enumeramos AMBAS: una vista nueva
    // sin el flag, o una matview (que security_invoker NO puede proteger), serían
    // fail-OPEN cross-tenant. reloptions es text[].
    const objetos = await semilla().$queryRaw<
      Array<{ relname: string; relkind: string; reloptions: string[] | null }>
    >`SELECT c.relname, c.relkind::text AS relkind, c.reloptions
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('v', 'm')
      ORDER BY c.relname`;

    const vistas = objetos.filter((o) => o.relkind === 'v');
    const materializadas = objetos.filter((o) => o.relkind === 'm');

    // No vacío + centinela conocido (la enumeración no pasa vacuamente).
    expect(vistas.length).toBeGreaterThan(0);
    expect(vistas.map((v) => v.relname)).toContain('cuenta_por_pagar');

    // security_invoker acepta true/on/1 (Postgres normaliza): match robusto al formato.
    const tieneInvoker = (reloptions: string[] | null) =>
      (reloptions ?? []).some((o) => /^security_invoker=(true|on|1)$/i.test(o));
    const vistasSinFlag = vistas.filter((v) => !tieneInvoker(v.reloptions)).map((v) => v.relname);
    expect(vistasSinFlag, 'vistas SIN security_invoker (fail-OPEN cross-tenant)').toEqual([]);

    // Las matviews corren SIEMPRE como su owner (migrador, BYPASSRLS): security_invoker
    // no las cubre → una matview sobre datos de tenant sería fuga. Hoy no hay ninguna;
    // si aparece, este test fuerza revisión de seguridad manual antes de pasar.
    expect(
      materializadas.map((m) => m.relname),
      'matviews en public exigen revisión (RLS no las cubre)',
    ).toEqual([]);
  });
});
