import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest';
import pg from 'pg';

const { Client } = pg;

/**
 * Cobertura de RLS — Fase 5, Segmento 1.
 *
 * Recorre el catálogo (`pg_class`) y exige que TODA tabla base del esquema public
 * tenga RLS habilitada Y forzada (`relrowsecurity` + `relforcerowsecurity`), salvo
 * la allowlist explícita. Atrapa el fallo "tabla tenant nueva sin RLS = fail-OPEN":
 * si una migración futura crea una tabla tenant y se olvida su ENABLE/FORCE en
 * post-migrate.sql, este test se pone en rojo.
 *
 * Allowlist (excluidas de RLS, ver post-migrate.sql / ARQUITECTURA_MULTITENANT §2.4):
 *  - usuario, sesion_refresco, empresa, membresia → el login las consulta sin
 *    contexto de tenant; aislamiento por otra vía.
 *  - _prisma_migrations → tabla de control de Prisma, no es de tenant.
 *
 * Si una tabla NUEVA es legítimamente no-tenant (global), añadirla a EXCLUIDAS
 * con justificación; el default es que toda tabla de negocio es tenant-scoped.
 */
const EXCLUIDAS = new Set([
  'usuario',
  'sesion_refresco',
  'empresa',
  'membresia',
  '_prisma_migrations',
]);

describe('RLS — cobertura de todas las tablas tenant-scoped', () => {
  let db: pg.Client;

  beforeAll(async () => {
    db = new Client({ connectionString: inject('databaseUrl') });
    await db.connect();
  });

  afterAll(async () => {
    await db.end();
  });

  it('toda tabla no excluida tiene RLS habilitada y forzada', async () => {
    const r = await db.query<{
      relname: string;
      rls: boolean;
      force: boolean;
    }>(`
      SELECT c.relname, c.relrowsecurity AS rls, c.relforcerowsecurity AS force
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `);

    const fallos: string[] = [];
    for (const t of r.rows) {
      if (EXCLUIDAS.has(t.relname)) continue;
      if (!t.rls || !t.force) {
        fallos.push(`${t.relname} (rls=${t.rls}, force=${t.force})`);
      }
    }
    expect(fallos, `tablas tenant SIN RLS+FORCE: ${fallos.join(', ')}`).toEqual([]);
  });

  it('las tablas excluidas existen (la allowlist no quedó obsoleta)', async () => {
    // Defensa contra rename silencioso: si una excluida desaparece (rename/drop),
    // hay que revisar la allowlist y el contrato de RLS.
    const r = await db.query<{ relname: string }>(`
      SELECT c.relname FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
    `);
    const existentes = new Set(r.rows.map((x) => x.relname));
    for (const t of EXCLUIDAS) {
      expect(existentes.has(t), `tabla excluida ausente: ${t}`).toBe(true);
    }
  });
});
