import { describe, it, expect, beforeAll, afterAll, inject } from 'vitest';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { cerrarSemilla } from '../helpers/db.js';
import { sembrarDosEmpresas, type DosEmpresas } from './_fixture-dos-empresas.js';

const { Client } = pg;

/**
 * Frontera RLS a nivel DB — COBERTURA COMPLETA de tablas (Fase 8, complementa
 * rls-frontera-db.test.ts, que cubría 5 tablas). Siembra dos empresas vía la
 * fixture (Prisma `semilla`, BYPASSRLS) y AFIRMA bajo el rol `gestorpro_app`:
 *   ④.3 sin GUC ⇒ 0 filas en TODAS las 22 tablas tenant (fail-closed total).
 *   ①.3 con GUC=A ⇒ las filas sembradas de B NO son visibles.
 *   ②.4 con GUC=A ⇒ INSERT directo con empresa_id=B viola WITH CHECK (anti-default:
 *        un valor EXPLÍCITO de columna no puede saltarse el DEFAULT desde el GUC).
 */

// Las 22 tablas tenant-scoped (deben quedar fail-closed sin contexto).
const TABLAS_TENANT = [
  'sede', 'proveedor', 'categoria_gasto', 'rol_operativo', 'turno', 'dia_festivo',
  'configuracion_cobro', 'auditoria', 'compra', 'pago_proveedor', 'gasto',
  'venta_diaria', 'detalle_cierre', 'empleado', 'empleado_rol_operativo', 'kiosco',
  'fichaje', 'revision_fichaje', 'jornada', 'correccion', 'saldo_horas_extra',
  'solicitud_cobro',
] as const;

describe('Fase 8 ①.3/④.3/②.4 — frontera RLS a nivel DB, cobertura completa', () => {
  let appdb: pg.Client;
  let f: DosEmpresas;

  beforeAll(async () => {
    f = await sembrarDosEmpresas();
    appdb = new Client({ connectionString: inject('databaseUrlApp') });
    await appdb.connect();
  });
  afterAll(async () => {
    await appdb.end();
    await cerrarSemilla();
  });

  /** Fija el GUC LOCAL a una tx que SIEMPRE se revierte (no contamina el pool). */
  async function conTenant<T>(empresaId: string | null, fn: () => Promise<T>): Promise<T> {
    await appdb.query('BEGIN');
    try {
      if (empresaId) await appdb.query(`SELECT set_config('app.empresa_id', $1, true)`, [empresaId]);
      return await fn();
    } finally {
      await appdb.query('ROLLBACK');
    }
  }

  it('④.3 sin GUC ⇒ 0 filas en las 22 tablas tenant (fail-closed total)', async () => {
    for (const tabla of TABLAS_TENANT) {
      const r = await appdb.query(`SELECT count(*)::int AS n FROM ${tabla}`);
      expect(r.rows[0].n, `tabla ${tabla} sin contexto debe dar 0`).toBe(0);
    }
  });

  it('①.3 con GUC=A ⇒ las filas de B NO son visibles', async () => {
    await conTenant(f.A.empresaId, async () => {
      const ausente = async (tabla: string, idCol: string, idDeB: string) => {
        const r = await appdb.query(`SELECT 1 FROM ${tabla} WHERE ${idCol} = $1`, [idDeB]);
        expect(r.rowCount, `${tabla} de B no debe verse bajo contexto A`).toBe(0);
      };
      await ausente('sede', 'id', f.B.sedeId);
      await ausente('proveedor', 'id', f.B.proveedorId);
      await ausente('categoria_gasto', 'id', f.B.categoriaId);
      await ausente('rol_operativo', 'id', f.B.rolOperativoId);
      await ausente('turno', 'id', f.B.turnoId);
      await ausente('dia_festivo', 'id', f.B.diaFestivoId);
      await ausente('configuracion_cobro', 'id', f.B.configCobroId);
      await ausente('auditoria', 'id', f.B.auditoriaId);
      await ausente('compra', 'id', f.B.compraId);
      await ausente('pago_proveedor', 'id', f.B.pagoId);
      await ausente('gasto', 'id', f.B.gastoId);
      await ausente('venta_diaria', 'id', f.B.ventaId);
      await ausente('empleado', 'id', f.B.empleadoId);
      await ausente('kiosco', 'id', f.B.kioscoId);
      await ausente('jornada', 'id', f.B.jornadaId);
      await ausente('solicitud_cobro', 'id', f.B.solicitudId);
      await ausente('saldo_horas_extra', 'empleado_id', f.B.empleadoId);
    });
  });

  // ②.4 anti-default: con GUC=A, un INSERT con empresa_id=B EXPLÍCITO en una tabla
  // directa debe violar WITH CHECK (no basta con que el DEFAULT desde el GUC sea A;
  // el cliente no puede forzar otro tenant pasando la columna a mano). sede ya se
  // cubre en rls-frontera-db.test.ts; aquí se generaliza a otras directas.
  const rls = /row-level security|seguridad a nivel de fila/i;

  it('②.4 INSERT proveedor con empresa_id=B (GUC=A) ⇒ WITH CHECK', async () => {
    await expect(
      conTenant(f.A.empresaId, () =>
        appdb.query(`INSERT INTO proveedor (id, nombre, empresa_id) VALUES ($1, 'X', $2)`, [
          randomUUID(), f.B.empresaId,
        ]),
      ),
    ).rejects.toThrow(rls);
  });

  it('②.4 INSERT categoria_gasto con empresa_id=B (GUC=A) ⇒ WITH CHECK', async () => {
    await expect(
      conTenant(f.A.empresaId, () =>
        appdb.query(`INSERT INTO categoria_gasto (id, nombre, empresa_id) VALUES ($1, $2, $3)`, [
          randomUUID(), `X-${randomUUID()}`, f.B.empresaId,
        ]),
      ),
    ).rejects.toThrow(rls);
  });

  it('②.4 INSERT auditoria con empresa_id=B (GUC=A) ⇒ WITH CHECK', async () => {
    await expect(
      conTenant(f.A.empresaId, () =>
        appdb.query(
          `INSERT INTO auditoria (id, empresa_id, entidad, entidad_id, accion, usuario_id)
           VALUES ($1, $2, 'sede', $3, 'crear', $4)`,
          [randomUUID(), f.B.empresaId, randomUUID(), randomUUID()],
        ),
      ),
    ).rejects.toThrow(rls);
  });
});
