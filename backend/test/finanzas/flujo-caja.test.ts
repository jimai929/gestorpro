/**
 * Flujo de caja operativo (GET /finanzas/flujo-caja).
 *
 * Prueba que las ventas entren como ingreso, gastos y pagos como salida, que una
 * compra a crédito IMPAGA no genere salida, que un movimiento anulado valga 0 y
 * uno corregido su importe corregido, que flujoNeto = ingresos − gastos − pagos,
 * que el acumulado diario arranque en 0 y sea correcto, que el resumen cubra el
 * conjunto completo, que no haya fuga entre tenants, que el empleado reciba 403 y
 * que la consulta NO escriba nada.
 *
 * CONVENCIÓN RLS: fixtures con `semilla()`; aserciones POSITIVAS bajo `comoEmpresa()`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, comoEmpresa, crearEmpresa } from '../helpers/db.js';
import { flujoCajaOperativo } from '../../src/finanzas/dashboard/flujo-caja.service.js';
import { corregirMovimiento } from '../../src/shared/services/correccion.service.js';
import { adaptadorPago } from '../../src/finanzas/cuentas-por-pagar/pago.correccion.js';
import { adaptadorGasto } from '../../src/finanzas/gastos/gasto.correccion.js';
import { adaptadorVenta } from '../../src/finanzas/dashboard/venta.correccion.js';

let contador = 0;
const RANGO = { desde: '2026-04-01', hasta: '2026-04-30' };

async function base(empresaId: string) {
  contador += 1;
  const sede = await semilla().sede.create({ data: { nombre: `SedeFC ${contador}`, empresaId } });
  const usuario = await semilla().usuario.create({
    data: { nombre: `Admin FC ${contador}`, email: `fc${contador}@gestorpro.local`, rol: 'administrador', passwordHash: 'x' },
  });
  return { sede, usuario };
}

async function venta(sedeId: string, usuarioId: string, fecha: string, efectivo: number, tarjeta = 0) {
  return semilla().ventaDiaria.create({
    data: {
      sedeId, fechaOperacion: new Date(fecha), turno: 'manana', cajera: 'E001 - Cajero',
      cerradoPor: 'E004 - Ver', monto: efectivo + tarjeta, tipo: 'normal', usuarioId,
      detalles: { create: [{ tipoArqueo: 'efectivo', monto: efectivo }, ...(tarjeta ? [{ tipoArqueo: 'tarjeta' as const, monto: tarjeta }] : [])] },
    },
  });
}

async function gasto(empresaId: string, sedeId: string, usuarioId: string, monto: number, fecha: string) {
  contador += 1;
  const categoria = await semilla().categoriaGasto.create({ data: { nombre: `CatFC ${contador}`, empresaId } });
  return semilla().gasto.create({
    data: { categoriaId: categoria.id, sedeId, monto, fechaOperacion: new Date(fecha), tipo: 'normal', usuarioId },
  });
}

/** Compra a crédito + (opcional) un pago. Devuelve { compra, pago }. */
async function compraConPago(empresaId: string, sedeId: string, usuarioId: string, montoCompra: number, montoPago: number | null, fechaPago: string) {
  contador += 1;
  const proveedor = await semilla().proveedor.create({ data: { nombre: `ProvFC ${contador}`, empresaId } });
  const compra = await semilla().compra.create({
    data: { proveedorId: proveedor.id, sedeId, numeroFactura: `FFC-${contador}`, montoTotal: montoCompra, tipo: 'credito', fechaEmision: new Date('2026-04-01'), fechaVencimiento: new Date('2026-05-01') },
  });
  const pago = montoPago !== null
    ? await semilla().pagoProveedor.create({ data: { compraId: compra.id, monto: montoPago, fechaPago: new Date(fechaPago), tipo: 'normal', usuarioId } })
    : null;
  return { compra, pago };
}

describe('flujo de caja: ingresos, salidas y compras impagas', () => {
  it('ventas entran, gastos y pagos salen; una compra a crédito IMPAGA no es salida', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario } = await base(empresaId);
    await venta(sede.id, usuario.id, '2026-04-10', 600, 400); // ingreso 1000
    await gasto(empresaId, sede.id, usuario.id, 150, '2026-04-11'); // salida 150
    await compraConPago(empresaId, sede.id, usuario.id, 800, 300, '2026-04-12'); // pago 300 (salida)
    await compraConPago(empresaId, sede.id, usuario.id, 500, null, '2026-04-12'); // IMPAGA: sin pago

    const fc = await comoEmpresa(empresaId, () => flujoCajaOperativo(RANGO));

    expect(fc.resumen.totalIngresos).toBe(1000);
    expect(fc.resumen.totalGastos).toBe(150);
    expect(fc.resumen.totalPagosProveedores).toBe(300); // la compra impaga NO aparece
    expect(fc.resumen.totalSalidas).toBe(450);
    expect(fc.resumen.flujoNeto).toBe(1000 - 150 - 300);
    // 3 movimientos: 1 venta, 1 gasto, 1 pago. La compra impaga no es movimiento.
    expect(fc.resumen.cantidadMovimientos).toBe(3);
    expect(fc.resumen.cantidadIngresos).toBe(1);
    expect(fc.resumen.cantidadSalidas).toBe(2);
    // Método de ingreso: efectivo 600, tarjeta 400.
    const porMetodo = new Map(fc.porMetodoIngreso.map((m) => [m.metodo, m.monto]));
    expect(porMetodo.get('efectivo')).toBe(600);
    expect(porMetodo.get('tarjeta')).toBe(400);
    expect(porMetodo.get('yappy')).toBe(0); // método en cero sigue presente
    // Sin empresaId en la respuesta.
    expect(JSON.stringify(fc)).not.toContain('empresaId');
  });

  it('un movimiento anulado vale 0; uno corregido, su importe corregido', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario } = await base(empresaId);
    // Venta 1000 anulada → ingreso 0.
    const v = await venta(sede.id, usuario.id, '2026-04-10', 1000);
    await comoEmpresa(empresaId, () => corregirMovimiento(adaptadorVenta, { movimientoId: v.id, motivo: 'anula', usuarioId: usuario.id }));
    // Gasto 200 corregido a 50 → salida 50.
    const g = await gasto(empresaId, sede.id, usuario.id, 200, '2026-04-11');
    await comoEmpresa(empresaId, () => corregirMovimiento(adaptadorGasto, { movimientoId: g.id, motivo: 'corrige', usuarioId: usuario.id, montoCorregido: 50 }));
    // Pago 300 corregido a 100 → salida 100.
    const { pago } = await compraConPago(empresaId, sede.id, usuario.id, 1000, 300, '2026-04-12');
    await comoEmpresa(empresaId, () => corregirMovimiento(adaptadorPago, { movimientoId: pago!.id, motivo: 'corrige', usuarioId: usuario.id, montoCorregido: 100 }));

    const fc = await comoEmpresa(empresaId, () => flujoCajaOperativo(RANGO));

    expect(fc.resumen.totalIngresos).toBe(0); // venta anulada
    expect(fc.resumen.totalGastos).toBe(50); // gasto corregido
    expect(fc.resumen.totalPagosProveedores).toBe(100); // pago corregido
    expect(fc.resumen.flujoNeto).toBe(0 - 50 - 100);
    expect(fc.resumen.movimientosAnulados).toBe(1);
    expect(fc.resumen.movimientosCorregidos).toBe(2);
    // La venta anulada sigue como movimiento (estado anulado), con monto original y vigente 0.
    const mv = fc.movimientos.find((m) => m.id === v.id)!;
    expect(mv.estado).toBe('anulado');
    expect(mv.montoOriginal).toBe(1000);
    expect(mv.montoVigente).toBe(0);
    expect(mv.impactoNeto).toBe(0);
  });

  it('el acumulado diario arranca en 0 y suma el neto de cada día', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario } = await base(empresaId);
    await venta(sede.id, usuario.id, '2026-04-10', 500); // día 1: +500
    await gasto(empresaId, sede.id, usuario.id, 200, '2026-04-11'); // día 2: −200
    await venta(sede.id, usuario.id, '2026-04-12', 300); // día 3: +300

    const fc = await comoEmpresa(empresaId, () => flujoCajaOperativo(RANGO));

    expect(fc.porDia).toHaveLength(3);
    expect(fc.porDia[0]).toMatchObject({ fecha: '2026-04-10', flujoNeto: 500, acumuladoDesdeInicioPeriodo: 500 });
    expect(fc.porDia[1]).toMatchObject({ fecha: '2026-04-11', flujoNeto: -200, acumuladoDesdeInicioPeriodo: 300 });
    expect(fc.porDia[2]).toMatchObject({ fecha: '2026-04-12', flujoNeto: 300, acumuladoDesdeInicioPeriodo: 600 });
    expect(fc.resumen.diasConFlujoPositivo).toBe(2);
    expect(fc.resumen.diasConFlujoNegativo).toBe(1);
    expect(fc.resumen.diaMayorSalida).toBe('2026-04-11');
  });

  it('el resumen cubre el conjunto completo aunque la página sea pequeña', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario } = await base(empresaId);
    for (let i = 0; i < 5; i += 1) await venta(sede.id, usuario.id, `2026-04-${String(10 + i).padStart(2, '0')}`, 100);

    const fc = await comoEmpresa(empresaId, () => flujoCajaOperativo({ ...RANGO, pagina: 1, tamano: 2 }));
    expect(fc.movimientos).toHaveLength(2);
    expect(fc.paginacion.total).toBe(5);
    expect(fc.resumen.totalIngresos).toBe(500); // NO 200
    expect(fc.resumen.cantidadMovimientos).toBe(5);
  });

  it('filtra por tipo', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario } = await base(empresaId);
    await venta(sede.id, usuario.id, '2026-04-10', 500);
    await gasto(empresaId, sede.id, usuario.id, 100, '2026-04-11');

    const soloIngresos = await comoEmpresa(empresaId, () => flujoCajaOperativo({ ...RANGO, tipo: 'ingreso' }));
    expect(soloIngresos.movimientos.every((m) => m.tipo === 'ingreso')).toBe(true);
    expect(soloIngresos.resumen.totalGastos).toBe(0);
  });
});

describe('GET /finanzas/flujo-caja (HTTP)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-flujo';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('un empleado recibe 403 y la consulta NO crea ni modifica registros', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario } = await base(empresaId);
    await venta(sede.id, usuario.id, '2026-04-10', 500);
    const antes = await comoEmpresa(empresaId, () => Promise.all([
      semilla().ventaDiaria.count(), semilla().gasto.count(), semilla().pagoProveedor.count(),
    ]));

    const tokenEmp = app.jwt.sign({ sub: usuario.id, rol: 'empleado', empresaId, esSuperAdmin: false });
    const res403 = await app.inject({ method: 'GET', url: '/finanzas/flujo-caja?desde=2026-04-01&hasta=2026-04-30', headers: { authorization: `Bearer ${tokenEmp}` } });
    expect(res403.statusCode).toBe(403);

    const tokenAdm = app.jwt.sign({ sub: usuario.id, rol: 'administrador', empresaId, esSuperAdmin: false });
    const res200 = await app.inject({ method: 'GET', url: '/finanzas/flujo-caja?desde=2026-04-01&hasta=2026-04-30', headers: { authorization: `Bearer ${tokenAdm}` } });
    expect(res200.statusCode).toBe(200);

    const despues = await comoEmpresa(empresaId, () => Promise.all([
      semilla().ventaDiaria.count(), semilla().gasto.count(), semilla().pagoProveedor.count(),
    ]));
    expect(despues).toEqual(antes); // solo lectura
  });

  it('no se ven movimientos de otra empresa (aislamiento por tenant)', async () => {
    const empresaA = await crearEmpresa();
    const empresaB = await crearEmpresa();
    const a = await base(empresaA);
    const b = await base(empresaB);
    await venta(b.sede.id, b.usuario.id, '2026-04-10', 999);

    const token = app.jwt.sign({ sub: a.usuario.id, rol: 'administrador', empresaId: empresaA, esSuperAdmin: false });
    const res = await app.inject({ method: 'GET', url: '/finanzas/flujo-caja?desde=2026-04-01&hasta=2026-04-30', headers: { authorization: `Bearer ${token}` } });
    expect(res.statusCode).toBe(200);
    expect(res.json().resumen.totalIngresos).toBe(0);
    expect(res.body).not.toContain('999');
  });

  it('rango invertido → 400; falta el rango → 400', async () => {
    const empresaId = await crearEmpresa();
    const { usuario } = await base(empresaId);
    const token = app.jwt.sign({ sub: usuario.id, rol: 'administrador', empresaId, esSuperAdmin: false });
    const invertido = await app.inject({ method: 'GET', url: '/finanzas/flujo-caja?desde=2026-05-10&hasta=2026-05-01', headers: { authorization: `Bearer ${token}` } });
    expect(invertido.statusCode).toBe(400);
    const sinRango = await app.inject({ method: 'GET', url: '/finanzas/flujo-caja', headers: { authorization: `Bearer ${token}` } });
    expect(sinRango.statusCode).toBe(400);
  });
});
