/**
 * Antigüedad de cuentas por pagar (GET /cuentas-por-pagar/antiguedad).
 *
 * Prueba que las facturas pagadas no aparezcan, que los pagos efectivos reduzcan el
 * saldo, que un pago anulado NO lo reduzca y uno corregido reduzca solo su importe
 * corregido, que los límites de tramo (0-30/31-60/61-90/90+) sean correctos, que el
 * resumen cubra el conjunto completo (no la página) y que no haya fuga entre tenants.
 *
 * CONVENCIÓN RLS: fixtures con `semilla()` (bypass); aserciones POSITIVAS bajo
 * `comoEmpresa()` (rol app + GUC + RLS).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, comoEmpresa, crearEmpresa } from '../helpers/db.js';
import {
  antiguedadCuentasPorPagar,
  tramoDeAntiguedad,
} from '../../src/finanzas/cuentas-por-pagar/antiguedad.service.js';
import { corregirMovimiento } from '../../src/shared/services/correccion.service.js';
import { adaptadorPago } from '../../src/finanzas/cuentas-por-pagar/pago.correccion.js';

let contador = 0;
// "Hoy" fijo para que la antigüedad sea determinista en los tests.
const HOY = new Date('2026-05-01T12:00:00.000Z');

async function base(empresaId: string) {
  contador += 1;
  const sede = await semilla().sede.create({ data: { nombre: `SedeAnt ${contador}`, empresaId } });
  const usuario = await semilla().usuario.create({
    data: {
      nombre: `Admin Ant ${contador}`,
      email: `ant${contador}@gestorpro.local`,
      rol: 'administrador',
      passwordHash: 'x',
    },
  });
  const proveedor = await semilla().proveedor.create({
    data: { nombre: `Proveedor Ant ${contador}`, identificacionFiscal: `RUC-${contador}`, empresaId },
  });
  return { sede, usuario, proveedor };
}

async function compra(proveedorId: string, sedeId: string, monto: number, fechaEmision: string) {
  contador += 1;
  return semilla().compra.create({
    data: {
      proveedorId,
      sedeId,
      numeroFactura: `FANT-${contador}`,
      montoTotal: monto,
      tipo: 'credito',
      fechaEmision: new Date(fechaEmision),
      fechaVencimiento: new Date(fechaEmision),
    },
  });
}

function pago(compraId: string, usuarioId: string, monto: number, fecha = '2026-04-20') {
  return semilla().pagoProveedor.create({
    data: { compraId, monto, fechaPago: new Date(fecha), tipo: 'normal', usuarioId },
  });
}

describe('tramoDeAntiguedad: límites exactos', () => {
  it('0 y 30 → 0-30; 31 y 60 → 31-60; 61 y 90 → 61-90; 91 → 90+', () => {
    expect(tramoDeAntiguedad(0)).toBe('dias_0_30');
    expect(tramoDeAntiguedad(30)).toBe('dias_0_30');
    expect(tramoDeAntiguedad(31)).toBe('dias_31_60');
    expect(tramoDeAntiguedad(60)).toBe('dias_31_60');
    expect(tramoDeAntiguedad(61)).toBe('dias_61_90');
    expect(tramoDeAntiguedad(90)).toBe('dias_61_90');
    expect(tramoDeAntiguedad(91)).toBe('dias_90_mas');
  });
});

describe('antigüedad: saldo, pagos y correcciones', () => {
  it('una factura pagada por completo NO aparece; el saldo baja con los pagos', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario, proveedor } = await base(empresaId);
    // Factura 1000, pagada 400 → saldo 600 (aparece).
    const c1 = await compra(proveedor.id, sede.id, 1000, '2026-04-10');
    await pago(c1.id, usuario.id, 400);
    // Factura 500, pagada 500 → saldo 0 (NO aparece).
    const c2 = await compra(proveedor.id, sede.id, 500, '2026-04-10');
    await pago(c2.id, usuario.id, 500);

    const res = await comoEmpresa(empresaId, () => antiguedadCuentasPorPagar({ hoy: HOY }));

    expect(res.facturas).toHaveLength(1);
    const f = res.facturas[0]!;
    expect(f.compraId).toBe(c1.id);
    expect(f.montoOriginal).toBe(1000);
    expect(f.pagosVigentes).toBe(400);
    expect(f.saldoPendiente).toBe(600);
    expect(f.ultimoPago).toBe('2026-04-20');
    expect(res.resumen.deudaTotal).toBe(600);
    expect(res.resumen.cantidadFacturasPendientes).toBe(1);
  });

  it('un pago ANULADO no reduce el saldo (vuelve a deber el total)', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario, proveedor } = await base(empresaId);
    const c = await compra(proveedor.id, sede.id, 800, '2026-04-10');
    const p = await pago(c.id, usuario.id, 300);
    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, { movimientoId: p.id, motivo: 'pago duplicado', usuarioId: usuario.id }),
    );

    const res = await comoEmpresa(empresaId, () => antiguedadCuentasPorPagar({ hoy: HOY }));
    const f = res.facturas.find((x) => x.compraId === c.id)!;
    expect(f.pagosVigentes).toBe(0); // el reverso canceló el pago
    expect(f.saldoPendiente).toBe(800);
  });

  it('un pago CORREGIDO reduce el saldo solo por su importe corregido', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario, proveedor } = await base(empresaId);
    const c = await compra(proveedor.id, sede.id, 1000, '2026-04-10');
    const p = await pago(c.id, usuario.id, 500);
    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, {
        movimientoId: p.id, motivo: 'se pagó de más', usuarioId: usuario.id, montoCorregido: 200,
      }),
    );

    const res = await comoEmpresa(empresaId, () => antiguedadCuentasPorPagar({ hoy: HOY }));
    const f = res.facturas.find((x) => x.compraId === c.id)!;
    expect(f.pagosVigentes).toBe(200); // NO 500, NO 700
    expect(f.saldoPendiente).toBe(800);
  });

  it('clasifica por tramo según los días desde la compra y reparte la deuda', async () => {
    const empresaId = await crearEmpresa();
    const { sede, proveedor } = await base(empresaId);
    // Hoy = 2026-05-01.
    await compra(proveedor.id, sede.id, 100, '2026-04-20'); // 11 días → 0-30
    await compra(proveedor.id, sede.id, 200, '2026-03-25'); // 37 días → 31-60
    await compra(proveedor.id, sede.id, 300, '2026-02-20'); // 70 días → 61-90
    await compra(proveedor.id, sede.id, 400, '2026-01-01'); // 120 días → 90+

    const res = await comoEmpresa(empresaId, () => antiguedadCuentasPorPagar({ hoy: HOY }));

    expect(res.resumen.deudaTotal).toBe(1000);
    expect(res.resumen.deuda0a30).toBe(100);
    expect(res.resumen.deuda31a60).toBe(200);
    expect(res.resumen.deuda61a90).toBe(300);
    expect(res.resumen.deuda90Mas).toBe(400);
    // Porcentajes por tramo.
    expect(res.resumen.pct90Mas).toBe(40);
    // La más antigua: 120 días.
    expect(res.resumen.deudaMasAntiguaDias).toBe(120);
    // Conteos por tramo.
    expect(res.resumen.cant0a30).toBe(1);
    expect(res.resumen.cant90Mas).toBe(1);
  });

  it('agrega por proveedor y el resumen es del conjunto completo, no de la página', async () => {
    const empresaId = await crearEmpresa();
    const { sede, proveedor } = await base(empresaId);
    const otro = await semilla().proveedor.create({ data: { nombre: 'Proveedor Z', empresaId } });
    for (let i = 0; i < 3; i += 1) await compra(proveedor.id, sede.id, 100, '2026-04-10');
    await compra(otro.id, sede.id, 50, '2026-04-10');

    const res = await comoEmpresa(empresaId, () =>
      antiguedadCuentasPorPagar({ hoy: HOY, pagina: 1, tamano: 2 }),
    );

    // Página: 2 facturas; total: 4.
    expect(res.facturas).toHaveLength(2);
    expect(res.paginacion.total).toBe(4);
    // Resumen COMPLETO: 350 en 4 facturas, 2 proveedores.
    expect(res.resumen.deudaTotal).toBe(350);
    expect(res.resumen.cantidadFacturasPendientes).toBe(4);
    expect(res.resumen.cantidadProveedores).toBe(2);
    // Agregado por proveedor (completo): el mayor deudor primero.
    expect(res.proveedores).toHaveLength(2);
    expect(res.proveedores[0]!.deudaTotal).toBe(300);
    expect(res.proveedores[0]!.cantidadFacturas).toBe(3);
    expect(res.resumen.proveedorMayorDeuda?.deuda).toBe(300);
  });

  it('filtra por tramo y por proveedor', async () => {
    const empresaId = await crearEmpresa();
    const { sede, proveedor } = await base(empresaId);
    await compra(proveedor.id, sede.id, 100, '2026-04-20'); // 0-30
    await compra(proveedor.id, sede.id, 400, '2026-01-01'); // 90+

    const soloViejas = await comoEmpresa(empresaId, () =>
      antiguedadCuentasPorPagar({ hoy: HOY, tramo: 'dias_90_mas' }),
    );
    expect(soloViejas.facturas).toHaveLength(1);
    expect(soloViejas.facturas[0]!.tramo).toBe('dias_90_mas');
    expect(soloViejas.resumen.deudaTotal).toBe(400);
  });
});

describe('GET /cuentas-por-pagar/antiguedad (HTTP)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-antiguedad';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('no se ven facturas de otra empresa (aislamiento por tenant)', async () => {
    const empresaA = await crearEmpresa();
    const empresaB = await crearEmpresa();
    const a = await base(empresaA);
    const b = await base(empresaB);
    await compra(b.proveedor.id, b.sede.id, 999, '2026-04-10');

    const token = app.jwt.sign({ sub: a.usuario.id, rol: 'administrador', empresaId: empresaA, esSuperAdmin: false });
    const res = await app.inject({
      method: 'GET',
      url: '/cuentas-por-pagar/antiguedad',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = res.json();
    expect(cuerpo.facturas).toHaveLength(0);
    expect(cuerpo.resumen.deudaTotal).toBe(0);
    expect(res.body).not.toContain('999');
  });

  it('el empleado puede leer (misma política del módulo); orden inválido → 400', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario, proveedor } = await base(empresaId);
    await compra(proveedor.id, sede.id, 120, '2026-04-10');
    const token = app.jwt.sign({ sub: usuario.id, rol: 'empleado', empresaId, esSuperAdmin: false });

    const lectura = await app.inject({
      method: 'GET',
      url: '/cuentas-por-pagar/antiguedad',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(lectura.statusCode).toBe(200);

    const invalido = await app.inject({
      method: 'GET',
      url: '/cuentas-por-pagar/antiguedad?orden=inventado',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(invalido.statusCode).toBe(400);
  });
});
