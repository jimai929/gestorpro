import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;

/**
 * Frontera de aislamiento multi-tenant a NIVEL DB (RLS) — Fase 5, Segmento 1.
 *
 * Es el test de mayor ROI del SaaS: prueba que la FRONTERA REAL (RLS bajo el rol
 * `gestorpro_app`, NOBYPASSRLS) falla CERRADO, con independencia del código de la
 * app. Molde: `test/finanzas/auditoria-append-only.test.ts` (pg.Client crudo).
 *
 * Dos clientes, igual que producción:
 *  - `admin` (rol owner/superusuario del contenedor, BYPASSRLS) → SIEMBRA los
 *    fixtures de dos empresas saltándose RLS (como el migrador/seed en prod).
 *  - `app`  (rol `gestorpro_app`, sujeto a RLS) → bajo el cual se AFIRMA el
 *    aislamiento.
 *
 * El GUC de tenant `app.empresa_id` se fija SIEMPRE LOCAL (dentro de una tx que se
 * revierte) → nunca contamina la conexión. "Sin contexto" = GUC sin fijar.
 */
describe('RLS — frontera de aislamiento a nivel DB (gestorpro_app)', () => {
  let admin: pg.Client; // BYPASSRLS, siembra
  let app: pg.Client; // sujeto a RLS, afirma
  let A: Sembrada;
  let B: Sembrada;

  beforeAll(async () => {
    admin = new Client({ connectionString: inject('databaseUrl') });
    app = new Client({ connectionString: inject('databaseUrlApp') });
    await admin.connect();
    await app.connect();
    A = await sembrarEmpresa(admin, 'A');
    B = await sembrarEmpresa(admin, 'B');
  });

  afterAll(async () => {
    await admin.end();
    await app.end();
  });

  // ── (1) Fail-closed: SIN contexto de tenant ⇒ 0 filas (directa + hereda) ───
  it('sin app.empresa_id ⇒ 0 filas en toda tabla tenant (directa y hereda)', async () => {
    for (const tabla of [
      'sede', // directa
      'gasto', // hereda 1 salto (sede)
      'pago_proveedor', // hereda 2 saltos (compra→sede)
      'empleado', // hereda 1 salto (sede)
      'saldo_horas_extra', // hereda 2 saltos (empleado→sede)
    ]) {
      const r = await app.query(`SELECT count(*)::int AS n FROM ${tabla}`);
      expect(r.rows[0].n, `tabla ${tabla} sin contexto debe dar 0`).toBe(0);
    }
  });

  // ── (2) Con contexto A ⇒ solo filas de A (comparar conjuntos, no length) ───
  it('con app.empresa_id=A ⇒ solo datos de A; nunca de B', async () => {
    await conTenant(app, A.empresaId, async () => {
      const sedes = await app.query<{ id: string }>('SELECT id FROM sede');
      expect(new Set(sedes.rows.map((x) => x.id))).toEqual(new Set([A.sedeId]));

      const gastos = await app.query<{ id: string }>('SELECT id FROM gasto');
      expect(new Set(gastos.rows.map((x) => x.id))).toEqual(new Set([A.gastoId]));

      const empleados = await app.query<{ id: string }>('SELECT id FROM empleado');
      expect(new Set(empleados.rows.map((x) => x.id))).toEqual(new Set([A.empleadoId]));

      // Control: la fila de B existe (la sembró admin) pero A NO la ve.
      const verB = await app.query('SELECT id FROM gasto WHERE id = $1', [B.gastoId]);
      expect(verB.rowCount).toBe(0);
    });
  });

  // ── (3) Hereda profundo (2 saltos) también aísla ───────────────────────────
  it('con app.empresa_id=A ⇒ pago_proveedor/saldo solo de A', async () => {
    await conTenant(app, A.empresaId, async () => {
      const pagos = await app.query<{ id: string }>('SELECT id FROM pago_proveedor');
      expect(new Set(pagos.rows.map((x) => x.id))).toEqual(new Set([A.pagoId]));

      const saldos = await app.query<{ empleado_id: string }>(
        'SELECT empleado_id FROM saldo_horas_extra',
      );
      expect(new Set(saldos.rows.map((x) => x.empleado_id))).toEqual(
        new Set([A.empleadoId]),
      );
    });
  });

  // ── (4) WITH CHECK directa: insertar con empresa_id de OTRA empresa ⇒ error ─
  it('con app.empresa_id=A ⇒ INSERT sede con empresa_id=B viola WITH CHECK', async () => {
    await expect(
      conTenant(app, A.empresaId, async () => {
        await app.query(
          `INSERT INTO sede (id, nombre, empresa_id) VALUES ($1, 'IntrusaA->B', $2)`,
          [randomUUID(), B.empresaId],
        );
      }),
    ).rejects.toThrow(/row-level security|seguridad a nivel de fila/i);
  });

  // ── (5) WITH CHECK hereda: insertar gasto colgando de sede de B ⇒ error ────
  it('con app.empresa_id=A ⇒ INSERT gasto con sede_id de B viola WITH CHECK', async () => {
    await expect(
      conTenant(app, A.empresaId, async () => {
        await app.query(
          `INSERT INTO gasto (id, categoria_id, sede_id, monto, fecha_operacion, usuario_id)
           VALUES ($1, $2, $3, 10, '2026-01-15', $4)`,
          [randomUUID(), A.categoriaId, B.sedeId, randomUUID()],
        );
      }),
    ).rejects.toThrow(/row-level security|seguridad a nivel de fila/i);
  });

  // ── (5b) Happy-path: escritura LEGÍTIMA dentro del propio tenant ⇒ permitida ─
  // Guarda contra una policy demasiado restrictiva que rechazara INSERTs válidos
  // (fail-closed excesivo): los tests 4/5 solo prueban el camino que DEBE fallar.
  it('con app.empresa_id=A ⇒ INSERT legítimo (sede y gasto de A) es permitido', async () => {
    await conTenant(app, A.empresaId, async () => {
      const sede = await app.query(
        `INSERT INTO sede (id, nombre, empresa_id) VALUES ($1, 'LegitA', $2) RETURNING id`,
        [randomUUID(), A.empresaId],
      );
      expect(sede.rowCount).toBe(1);
      const gasto = await app.query(
        `INSERT INTO gasto (id, categoria_id, sede_id, monto, fecha_operacion, usuario_id)
         VALUES ($1, $2, $3, 10, '2026-01-15', $4) RETURNING id`,
        [randomUUID(), A.categoriaId, A.sedeId, randomUUID()],
      );
      expect(gasto.rowCount).toBe(1);
    }); // conTenant revierte (ROLLBACK): no contamina los conjuntos de los otros tests.
  });

  // ── (6) Vista cuenta_por_pagar (security_invoker) hereda la RLS de las bases ─
  it('vista cuenta_por_pagar: con app.empresa_id=A ⇒ solo compras de A', async () => {
    await conTenant(app, A.empresaId, async () => {
      const cpp = await app.query<{ compra_id: string }>(
        'SELECT compra_id FROM cuenta_por_pagar',
      );
      const ids = new Set(cpp.rows.map((x) => x.compra_id));
      expect(ids.has(A.compraId)).toBe(true);
      expect(ids.has(B.compraId)).toBe(false);
    });
    // Sin contexto, la vista no devuelve nada (fail-closed).
    const vacio = await app.query('SELECT count(*)::int AS n FROM cuenta_por_pagar');
    expect(vacio.rows[0].n).toBe(0);
  });
});

// ── helpers ──────────────────────────────────────────────────────────────────

interface Sembrada {
  empresaId: string;
  sedeId: string;
  categoriaId: string;
  gastoId: string;
  proveedorId: string;
  compraId: string;
  pagoId: string;
  empleadoId: string;
}

/** Fija el GUC de tenant LOCAL a una tx que SIEMPRE se revierte (no contamina). */
async function conTenant<T>(
  client: pg.Client,
  empresaId: string | null,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query('BEGIN');
  try {
    if (empresaId) {
      await client.query(`SELECT set_config('app.empresa_id', $1, true)`, [empresaId]);
    }
    return await fn();
  } finally {
    await client.query('ROLLBACK');
  }
}

/** Siembra una empresa completa (directa + hereda a 1 y 2 saltos) vía BYPASSRLS. */
async function sembrarEmpresa(admin: pg.Client, sufijo: string): Promise<Sembrada> {
  const ids = {
    empresaId: randomUUID(),
    sedeId: randomUUID(),
    categoriaId: randomUUID(),
    gastoId: randomUUID(),
    proveedorId: randomUUID(),
    compraId: randomUUID(),
    pagoId: randomUUID(),
    empleadoId: randomUUID(),
  };
  const u = sufijo + '-' + ids.empresaId.slice(0, 8); // unicidad de uniques globales
  await admin.query(`INSERT INTO empresa (id, nombre, slug) VALUES ($1, $2, $3)`, [
    ids.empresaId,
    `Empresa ${sufijo}`,
    `rls-${u}`,
  ]);
  await admin.query(`INSERT INTO sede (id, nombre, empresa_id) VALUES ($1, $2, $3)`, [
    ids.sedeId,
    `Sede ${sufijo}`,
    ids.empresaId,
  ]);
  await admin.query(
    `INSERT INTO categoria_gasto (id, nombre, empresa_id) VALUES ($1, $2, $3)`,
    [ids.categoriaId, `Cat ${u}`, ids.empresaId],
  );
  await admin.query(
    `INSERT INTO gasto (id, categoria_id, sede_id, monto, fecha_operacion, usuario_id)
     VALUES ($1, $2, $3, 100, '2026-01-10', $4)`,
    [ids.gastoId, ids.categoriaId, ids.sedeId, randomUUID()],
  );
  await admin.query(
    `INSERT INTO proveedor (id, nombre, empresa_id) VALUES ($1, $2, $3)`,
    [ids.proveedorId, `Prov ${u}`, ids.empresaId],
  );
  await admin.query(
    `INSERT INTO compra (id, proveedor_id, sede_id, numero_factura, monto_total, tipo, fecha_emision)
     VALUES ($1, $2, $3, $4, 500, 'credito', '2026-01-05')`,
    [ids.compraId, ids.proveedorId, ids.sedeId, `F-${u}`],
  );
  await admin.query(
    `INSERT INTO pago_proveedor (id, compra_id, monto, fecha_pago, tipo, usuario_id)
     VALUES ($1, $2, 200, '2026-01-08', 'normal', $3)`,
    [ids.pagoId, ids.compraId, randomUUID()],
  );
  await admin.query(
    `INSERT INTO empleado (id, numero, nombre, sede_id, qr_token, pin_hash, salario_fijo)
     VALUES ($1, $2, $3, $4, $5, 'hash', 1200)`,
    [ids.empleadoId, `E-${u}`, `Empleado ${sufijo}`, ids.sedeId, `qr-${u}`],
  );
  await admin.query(
    `INSERT INTO saldo_horas_extra (id, empleado_id, saldo, actualizado_en)
     VALUES ($1, $2, 50, now())`,
    [randomUUID(), ids.empleadoId],
  );
  return ids;
}
