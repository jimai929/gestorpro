import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { comoEmpresa, cerrarSemilla } from '../helpers/db.js';
import { txEmpresa } from '../../src/core/tenant/contexto.js';
import { sembrarDosEmpresas, type DosEmpresas } from './_fixture-dos-empresas.js';

import { listarSedes } from '../../src/core/sede/sede.service.js';
import { listarEmpleados } from '../../src/core/empleado/empleado.service.js';
import {
  listarProveedores,
  listarCompras,
} from '../../src/finanzas/cuentas-por-pagar/cuentas-por-pagar.service.js';
import { listarGastos, listarCategorias } from '../../src/finanzas/gastos/gastos.service.js';
import { listarVentas } from '../../src/finanzas/dashboard/ventas.service.js';
import { listarJornadas } from '../../src/asistencia/jornada/jornada.service.js';
import { listarCobros } from '../../src/asistencia/cobro/cobro.service.js';
import { obtenerSaldo } from '../../src/asistencia/cobro/saldo.service.js';

/**
 * ① Lectura cross-tenant (nivel SERVICIO) + ④ fail-closed sin contexto (Fase 8).
 *
 * Fixture: dos empresas A y B pobladas (una fila de cada entidad). Un actor en A
 * (vía `comoEmpresa`, que fija la ALS → `txEmpresa` fija el GUC → RLS) NO debe
 * observar NADA de B en NINGÚN `listar*`. Se comparan CONJUNTOS de id (no length):
 * la lista de A debe ser EXACTAMENTE {id de A} y nunca contener el de B; control:
 * B ve los suyos. Sin contexto (empresaId=null) toda lectura da 0 filas
 * (fail-closed), nunca "todos los tenants".
 */
describe('Fase 8 ① — lectura cross-tenant rechazada (servicio)', () => {
  let f: DosEmpresas;

  beforeAll(async () => {
    f = await sembrarDosEmpresas();
  });
  afterAll(async () => {
    await cerrarSemilla();
  });

  const idsDe = (arr: Array<{ id: string }>) => new Set(arr.map((x) => x.id));

  it('sede: A solo ve su sede; nunca la de B (y B ve la suya)', async () => {
    expect(idsDe(await comoEmpresa(f.A.empresaId, () => listarSedes({ incluirInactivas: true })))).toEqual(
      new Set([f.A.sedeId]),
    );
    expect(idsDe(await comoEmpresa(f.B.empresaId, () => listarSedes({ incluirInactivas: true })))).toEqual(
      new Set([f.B.sedeId]),
    );
  });

  it('empleado: A solo ve el suyo; nunca el de B', async () => {
    const deA = idsDe(await comoEmpresa(f.A.empresaId, () => listarEmpleados({ incluirInactivos: true })));
    expect(deA).toEqual(new Set([f.A.empleadoId]));
    expect(deA.has(f.B.empleadoId)).toBe(false);
  });

  it('proveedor: A solo ve el suyo; nunca el de B', async () => {
    const deA = idsDe(await comoEmpresa(f.A.empresaId, () => listarProveedores()));
    expect(deA).toEqual(new Set([f.A.proveedorId]));
    expect(deA.has(f.B.proveedorId)).toBe(false);
  });

  it('compra: A solo ve la suya; nunca la de B', async () => {
    const deA = idsDe(await comoEmpresa(f.A.empresaId, () => listarCompras({})));
    expect(deA).toEqual(new Set([f.A.compraId]));
    expect(deA.has(f.B.compraId)).toBe(false);
  });

  it('gasto: A solo ve el suyo; nunca el de B', async () => {
    const deA = idsDe(await comoEmpresa(f.A.empresaId, () => listarGastos({})));
    expect(deA).toEqual(new Set([f.A.gastoId]));
    expect(deA.has(f.B.gastoId)).toBe(false);
  });

  it('categoria_gasto: A solo ve la suya; nunca la de B', async () => {
    const deA = idsDe(await comoEmpresa(f.A.empresaId, () => listarCategorias()));
    expect(deA).toEqual(new Set([f.A.categoriaId]));
    expect(deA.has(f.B.categoriaId)).toBe(false);
  });

  it('venta_diaria: A solo ve la suya; nunca la de B', async () => {
    const deA = idsDe(await comoEmpresa(f.A.empresaId, () => listarVentas({})));
    expect(deA).toEqual(new Set([f.A.ventaId]));
    expect(deA.has(f.B.ventaId)).toBe(false);
  });

  it('jornada: A solo ve la suya; nunca la de B', async () => {
    const deA = idsDe(await comoEmpresa(f.A.empresaId, () => listarJornadas({})));
    expect(deA).toEqual(new Set([f.A.jornadaId]));
    expect(deA.has(f.B.jornadaId)).toBe(false);
  });

  it('solicitud_cobro: A solo ve la suya; nunca la de B', async () => {
    const deA = idsDe(await comoEmpresa(f.A.empresaId, () => listarCobros({})));
    expect(deA).toEqual(new Set([f.A.solicitudId]));
    expect(deA.has(f.B.solicitudId)).toBe(false);
  });

  it('saldo_horas_extra: A lee el saldo de SU empleado, no el de B', async () => {
    // El saldo de A es legible (50); el del empleado de B, leído bajo contexto A,
    // da 0 (RLS no ve su fila → obtenerSaldo devuelve 0), nunca el 50 real de B.
    expect(await comoEmpresa(f.A.empresaId, () => obtenerSaldo(f.A.empleadoId))).toBe(50);
    expect(await comoEmpresa(f.A.empresaId, () => obtenerSaldo(f.B.empleadoId))).toBe(0);
  });

  it('auditoria: A solo ve sus eventos; nunca los de B', async () => {
    const deA = idsDe(
      await comoEmpresa(f.A.empresaId, () => txEmpresa((tx) => tx.auditoria.findMany())),
    );
    expect(deA).toEqual(new Set([f.A.auditoriaId]));
    expect(deA.has(f.B.auditoriaId)).toBe(false);
  });
});

describe('Fase 8 ④ — fail-closed: sin contexto de tenant ⇒ 0 filas (servicio)', () => {
  let f: DosEmpresas;

  beforeAll(async () => {
    f = await sembrarDosEmpresas();
  });
  afterAll(async () => {
    await cerrarSemilla();
  });

  it('sin empresaId, ninguna lectura devuelve filas (nunca "todos los tenants")', async () => {
    // empresaId=null y NO super-admin → txEmpresa no fija el GUC → RLS 0 filas.
    expect(await comoEmpresa(null, () => listarSedes({ incluirInactivas: true }))).toHaveLength(0);
    expect(await comoEmpresa(null, () => listarEmpleados({ incluirInactivos: true }))).toHaveLength(0);
    expect(await comoEmpresa(null, () => listarProveedores())).toHaveLength(0);
    expect(await comoEmpresa(null, () => listarCompras({}))).toHaveLength(0);
    expect(await comoEmpresa(null, () => listarGastos({}))).toHaveLength(0);
    expect(await comoEmpresa(null, () => listarCategorias())).toHaveLength(0);
    expect(await comoEmpresa(null, () => listarVentas({}))).toHaveLength(0);
    expect(await comoEmpresa(null, () => listarJornadas({}))).toHaveLength(0);
    expect(await comoEmpresa(null, () => listarCobros({}))).toHaveLength(0);
    expect(await comoEmpresa(null, () => txEmpresa((tx) => tx.auditoria.findMany()))).toHaveLength(0);
    // Y el saldo de un empleado real, sin contexto, es 0 (no se filtra el valor real).
    expect(await comoEmpresa(null, () => obtenerSaldo(f.A.empleadoId))).toBe(0);
  });
});
