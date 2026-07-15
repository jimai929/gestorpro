/**
 * Planificador de pagos a proveedores (POST /cuentas-por-pagar/plan-pagos/simular).
 *
 * Prueba las cuatro estrategias, que ninguna asignación supere el saldo ni el
 * presupuesto, el redondeo estable del reparto proporcional, la revalidación del
 * modo manual, el límite por proveedor, el uso del saldo EFECTIVO (con anulación y
 * corrección), el aislamiento entre tenants, el 403 del empleado y —lo más
 * importante— que la simulación NO cree ningún PagoProveedor.
 *
 * CONVENCIÓN RLS: fixtures con `semilla()` (bypass); aserciones POSITIVAS bajo
 * `comoEmpresa()` (rol app + GUC + RLS).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, comoEmpresa, crearEmpresa } from '../helpers/db.js';
import { simularPlanPagos } from '../../src/finanzas/cuentas-por-pagar/plan-pagos.service.js';
import { corregirMovimiento } from '../../src/shared/services/correccion.service.js';
import { adaptadorPago } from '../../src/finanzas/cuentas-por-pagar/pago.correccion.js';

let contador = 0;
const HOY = new Date('2026-05-01T12:00:00.000Z');

async function base(empresaId: string) {
  contador += 1;
  const sede = await semilla().sede.create({ data: { nombre: `SedePP ${contador}`, empresaId } });
  const usuario = await semilla().usuario.create({
    data: { nombre: `Admin PP ${contador}`, email: `pp${contador}@gestorpro.local`, rol: 'administrador', passwordHash: 'x' },
  });
  return { sede, usuario };
}

async function proveedor(empresaId: string, nombre: string) {
  return semilla().proveedor.create({ data: { nombre, empresaId } });
}

async function compra(proveedorId: string, sedeId: string, monto: number, fechaEmision: string) {
  contador += 1;
  return semilla().compra.create({
    data: {
      proveedorId, sedeId, numeroFactura: `FPP-${contador}`, montoTotal: monto,
      tipo: 'credito', fechaEmision: new Date(fechaEmision), fechaVencimiento: new Date(fechaEmision),
    },
  });
}

function pago(compraId: string, usuarioId: string, monto: number) {
  return semilla().pagoProveedor.create({
    data: { compraId, monto, fechaPago: new Date('2026-04-20'), tipo: 'normal', usuarioId },
  });
}

describe('planificador: estrategias', () => {
  it('más antiguas primero: agota el presupuesto por antigüedad, con la última parcial', async () => {
    const empresaId = await crearEmpresa();
    const { sede } = await base(empresaId);
    const p = await proveedor(empresaId, 'Prov A');
    const vieja = await compra(p.id, sede.id, 400, '2026-01-01'); // 120 días
    const media = await compra(p.id, sede.id, 300, '2026-03-01'); // 61 días
    await compra(p.id, sede.id, 200, '2026-04-20'); // 11 días

    // Presupuesto 500: paga la vieja (400) completa y 100 de la media (parcial).
    const plan = await comoEmpresa(empresaId, () =>
      simularPlanPagos({ presupuestoDisponible: 500, estrategia: 'mas_antiguas_primero', hoy: HOY }),
    );

    expect(plan.cabecera.montoPlanificado).toBe(500);
    expect(plan.cabecera.presupuestoNoUsado).toBe(0);
    const porCompra = new Map(plan.asignaciones.map((a) => [a.compraId, a]));
    expect(porCompra.get(vieja.id)!.montoPlanificado).toBe(400);
    expect(porCompra.get(vieja.id)!.tipoResultado).toBe('completa');
    expect(porCompra.get(media.id)!.montoPlanificado).toBe(100);
    expect(porCompra.get(media.id)!.tipoResultado).toBe('parcial');
    expect(porCompra.get(media.id)!.saldoProyectado).toBe(200);
    // Ninguna asignación supera su saldo ni el total supera el presupuesto.
    expect(plan.asignaciones.every((a) => a.montoPlanificado <= a.saldoPendiente)).toBe(true);
  });

  it('saldos menores primero: prioriza cerrar las facturas pequeñas', async () => {
    const empresaId = await crearEmpresa();
    const { sede } = await base(empresaId);
    const p = await proveedor(empresaId, 'Prov B');
    const grande = await compra(p.id, sede.id, 1000, '2026-01-01');
    const chica1 = await compra(p.id, sede.id, 50, '2026-02-01');
    const chica2 = await compra(p.id, sede.id, 80, '2026-03-01');

    // Presupuesto 130: cierra las dos chicas (50 + 80), no toca la grande.
    const plan = await comoEmpresa(empresaId, () =>
      simularPlanPagos({ presupuestoDisponible: 130, estrategia: 'saldos_menores_primero', hoy: HOY }),
    );

    const porCompra = new Map(plan.asignaciones.map((a) => [a.compraId, a]));
    expect(porCompra.get(chica1.id)!.tipoResultado).toBe('completa');
    expect(porCompra.get(chica2.id)!.tipoResultado).toBe('completa');
    expect(porCompra.has(grande.id)).toBe(false);
    expect(plan.cabecera.facturasCompletas).toBe(2);
  });

  it('proporcional por proveedor: reparte por peso de deuda y los céntimos sobrantes son estables', async () => {
    const empresaId = await crearEmpresa();
    const { sede } = await base(empresaId);
    const pa = await proveedor(empresaId, 'Prov 75');
    const pb = await proveedor(empresaId, 'Prov 25');
    await compra(pa.id, sede.id, 750, '2026-01-01'); // 75% de la deuda
    await compra(pb.id, sede.id, 250, '2026-01-01'); // 25%

    // Presupuesto 100 → 75 al proveedor A, 25 al B. Total = presupuesto, sin exceso.
    const plan = await comoEmpresa(empresaId, () =>
      simularPlanPagos({ presupuestoDisponible: 100, estrategia: 'proporcional_por_proveedor', hoy: HOY }),
    );
    expect(plan.cabecera.montoPlanificado).toBe(100);
    const porProv = new Map(plan.resumenPorProveedor.map((r) => [r.nombre, r.montoPlanificado]));
    expect(porProv.get('Prov 75')).toBe(75);
    expect(porProv.get('Prov 25')).toBe(25);

    // Repetible: el mismo input da el mismo output (redondeo estable).
    const plan2 = await comoEmpresa(empresaId, () =>
      simularPlanPagos({ presupuestoDisponible: 100, estrategia: 'proporcional_por_proveedor', hoy: HOY }),
    );
    expect(plan2.cabecera.montoPlanificado).toBe(100);
  });

  it('nunca asigna más que la deuda total pagable aunque el presupuesto sea mayor', async () => {
    const empresaId = await crearEmpresa();
    const { sede } = await base(empresaId);
    const p = await proveedor(empresaId, 'Prov C');
    await compra(p.id, sede.id, 300, '2026-01-01');

    const plan = await comoEmpresa(empresaId, () =>
      simularPlanPagos({ presupuestoDisponible: 1000, estrategia: 'mas_antiguas_primero', hoy: HOY }),
    );
    expect(plan.cabecera.montoPlanificado).toBe(300); // no 1000
    expect(plan.cabecera.presupuestoNoUsado).toBe(700);
    expect(plan.cabecera.deudaProyectada).toBe(0);
  });
});

describe('planificador: saldo efectivo, límites y manual', () => {
  it('usa el saldo EFECTIVO: un pago anulado deja el saldo completo; uno corregido, el corregido', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario } = await base(empresaId);
    const p = await proveedor(empresaId, 'Prov D');
    // Factura 1000 con pago 400 anulado → saldo 1000.
    const cAnulada = await compra(p.id, sede.id, 1000, '2026-01-01');
    const pagoAnulado = await pago(cAnulada.id, usuario.id, 400);
    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, { movimientoId: pagoAnulado.id, motivo: 'anula', usuarioId: usuario.id }),
    );
    // Factura 1000 con pago 500 corregido a 200 → saldo 800.
    const cCorregida = await compra(p.id, sede.id, 1000, '2026-01-02');
    const pagoCorr = await pago(cCorregida.id, usuario.id, 500);
    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, { movimientoId: pagoCorr.id, motivo: 'corrige', usuarioId: usuario.id, montoCorregido: 200 }),
    );

    const plan = await comoEmpresa(empresaId, () =>
      simularPlanPagos({ presupuestoDisponible: 5000, estrategia: 'mas_antiguas_primero', hoy: HOY }),
    );
    const porCompra = new Map(plan.asignaciones.map((a) => [a.compraId, a]));
    expect(porCompra.get(cAnulada.id)!.saldoPendiente).toBe(1000); // el pago anulado no cuenta
    expect(porCompra.get(cCorregida.id)!.saldoPendiente).toBe(800); // 1000 − 200 corregido
  });

  it('respeta el límite por proveedor', async () => {
    const empresaId = await crearEmpresa();
    const { sede } = await base(empresaId);
    const p = await proveedor(empresaId, 'Prov E');
    await compra(p.id, sede.id, 1000, '2026-01-01');

    const plan = await comoEmpresa(empresaId, () =>
      simularPlanPagos({ presupuestoDisponible: 5000, estrategia: 'mas_antiguas_primero', limitePorProveedor: 300, hoy: HOY }),
    );
    expect(plan.cabecera.montoPlanificado).toBe(300);
    expect(plan.resumenPorProveedor[0]!.montoPlanificado).toBe(300);
  });

  it('modo manual: el backend REVALIDA y rechaza un monto que excede el saldo', async () => {
    const empresaId = await crearEmpresa();
    const { sede } = await base(empresaId);
    const p = await proveedor(empresaId, 'Prov F');
    const c = await compra(p.id, sede.id, 200, '2026-01-01');

    // Manual válido: 150 de 200.
    const ok = await comoEmpresa(empresaId, () =>
      simularPlanPagos({
        presupuestoDisponible: 500, estrategia: 'manual',
        asignacionesManuales: [{ compraId: c.id, monto: 150 }], hoy: HOY,
      }),
    );
    expect(ok.cabecera.montoPlanificado).toBe(150);

    // Manual inválido: 250 excede el saldo 200 → error, aunque el front lo "calculara".
    await expect(
      comoEmpresa(empresaId, () =>
        simularPlanPagos({
          presupuestoDisponible: 500, estrategia: 'manual',
          asignacionesManuales: [{ compraId: c.id, monto: 250 }], hoy: HOY,
        }),
      ),
    ).rejects.toThrow(/excede el saldo/i);
  });

  it('rechaza presupuesto <= 0', async () => {
    const empresaId = await crearEmpresa();
    await base(empresaId);
    await expect(
      comoEmpresa(empresaId, () => simularPlanPagos({ presupuestoDisponible: 0, estrategia: 'mas_antiguas_primero', hoy: HOY })),
    ).rejects.toThrow();
  });
});

describe('POST /cuentas-por-pagar/plan-pagos/simular (HTTP)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-plan-pagos';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('un empleado recibe 403 (soloGestion) y NO se crea ningún PagoProveedor', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario } = await base(empresaId);
    const p = await proveedor(empresaId, 'Prov G');
    await compra(p.id, sede.id, 100, '2026-01-01');
    const antes = await comoEmpresa(empresaId, () =>
      semilla().pagoProveedor.count({ where: { compra: { proveedorId: p.id } } }),
    );

    const token = app.jwt.sign({ sub: usuario.id, rol: 'empleado', empresaId, esSuperAdmin: false });
    const res = await app.inject({
      method: 'POST',
      url: '/cuentas-por-pagar/plan-pagos/simular',
      headers: { authorization: `Bearer ${token}` },
      payload: { presupuestoDisponible: 100, estrategia: 'mas_antiguas_primero' },
    });
    expect(res.statusCode).toBe(403);

    const despues = await comoEmpresa(empresaId, () =>
      semilla().pagoProveedor.count({ where: { compra: { proveedorId: p.id } } }),
    );
    expect(despues).toBe(antes); // la simulación jamás escribe
  });

  it('un admin simula OK y la simulación NO crea PagoProveedor', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario } = await base(empresaId);
    const p = await proveedor(empresaId, 'Prov H');
    await compra(p.id, sede.id, 200, '2026-01-01');
    const antes = await comoEmpresa(empresaId, () =>
      semilla().pagoProveedor.count({ where: { compra: { proveedorId: p.id } } }),
    );

    const token = app.jwt.sign({ sub: usuario.id, rol: 'administrador', empresaId, esSuperAdmin: false });
    const res = await app.inject({
      method: 'POST',
      url: '/cuentas-por-pagar/plan-pagos/simular',
      headers: { authorization: `Bearer ${token}` },
      payload: { presupuestoDisponible: 150, estrategia: 'mas_antiguas_primero' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().cabecera.montoPlanificado).toBe(150);

    const despues = await comoEmpresa(empresaId, () =>
      semilla().pagoProveedor.count({ where: { compra: { proveedorId: p.id } } }),
    );
    expect(despues).toBe(antes);
  });

  it('no se ven facturas de otra empresa (aislamiento por tenant)', async () => {
    const empresaA = await crearEmpresa();
    const empresaB = await crearEmpresa();
    const a = await base(empresaA);
    const b = await base(empresaB);
    const pb = await proveedor(empresaB, 'Prov B-only');
    await compra(pb.id, b.sede.id, 999, '2026-01-01');

    const token = app.jwt.sign({ sub: a.usuario.id, rol: 'administrador', empresaId: empresaA, esSuperAdmin: false });
    const res = await app.inject({
      method: 'POST',
      url: '/cuentas-por-pagar/plan-pagos/simular',
      headers: { authorization: `Bearer ${token}` },
      payload: { presupuestoDisponible: 5000, estrategia: 'mas_antiguas_primero' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().cabecera.montoPlanificado).toBe(0);
    expect(res.body).not.toContain('999');
  });

  it('estrategia inválida → 400', async () => {
    const empresaId = await crearEmpresa();
    const { usuario } = await base(empresaId);
    const token = app.jwt.sign({ sub: usuario.id, rol: 'administrador', empresaId, esSuperAdmin: false });
    const res = await app.inject({
      method: 'POST',
      url: '/cuentas-por-pagar/plan-pagos/simular',
      headers: { authorization: `Bearer ${token}` },
      payload: { presupuestoDisponible: 100, estrategia: 'inventada' },
    });
    expect(res.statusCode).toBe(400);
  });
});
