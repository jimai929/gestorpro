import { describe, it, expect, afterAll } from 'vitest';
import { semilla, comoEmpresa, crearEmpresa, cerrarSemilla } from '../helpers/db.js';
import {
  crearProveedor,
  registrarCompra,
  registrarPago,
} from '../../src/finanzas/cuentas-por-pagar/cuentas-por-pagar.service.js';
import { registrarVenta } from '../../src/finanzas/dashboard/ventas.service.js';
import { gananciaDelPeriodo } from '../../src/finanzas/dashboard/dashboard.service.js';

/**
 * Dashboard en criterio CAJA: una compra a crédito IMPAGA es DEUDA, no egreso. Solo el dinero
 * REALMENTE pagado a proveedores (pagos de crédito + compras de contado) reduce la ganancia.
 * `compras` sigue mostrando el total DEVENGADO (registradas) como dato informativo.
 */

let contador = 0;
afterAll(cerrarSemilla);

const RANGO = (sedeId: string) => ({ desde: '2026-08-01', hasta: '2026-08-31', sedeId });

async function escenario() {
  contador += 1;
  const empresaId = await crearEmpresa(`EmpresaDash ${contador}`);
  const sede = await semilla().sede.create({ data: { nombre: `SedeDash ${contador}`, empresaId } });
  const usuario = await semilla().usuario.create({
    data: { nombre: 'D', email: `dash${contador}@gestorpro.local`, rol: 'administrador', passwordHash: 'x' },
  });
  const prov = await comoEmpresa(empresaId, () => crearProveedor({ nombre: `ProvDash ${contador}` }));
  return { empresaId, sede, usuario, prov };
}

function compraCredito(prov: string, sede: string, numeroFactura: string, montoTotal: number) {
  return {
    proveedorId: prov, sedeId: sede, numeroFactura, montoTotal,
    tipo: 'credito' as const, fechaEmision: '2026-08-01', fechaVencimiento: '2026-09-01',
  };
}

describe('dashboard — compras impagas NO son egreso (criterio caja)', () => {
  it('compra a crédito IMPAGA: 0 egreso pero sí compra registrada (devengado)', async () => {
    const { empresaId, sede, prov } = await escenario();
    await comoEmpresa(empresaId, () =>
      registrarCompra(compraCredito(prov.id, sede.id, 'IMPAGA', 1100)),
    );
    const r = await comoEmpresa(empresaId, () => gananciaDelPeriodo(RANGO(sede.id)));
    expect(r.compras).toBe(1100); // registrada (devengado)
    expect(r.pagosProveedor).toBe(0); // no se pagó → sin egreso real
    expect(r.ganancia).toBe(0); // 0 ventas − 0 egreso − 0 gastos
  });

  it('compra a crédito con pago PARCIAL: solo lo pagado cuenta como egreso', async () => {
    const { empresaId, sede, usuario, prov } = await escenario();
    const compra = await comoEmpresa(empresaId, () =>
      registrarCompra(compraCredito(prov.id, sede.id, 'PARCIAL', 1100)),
    );
    await comoEmpresa(empresaId, () =>
      registrarPago({ compraId: compra.id, monto: 400, fechaPago: '2026-08-05', usuarioId: usuario.id }),
    );
    const r = await comoEmpresa(empresaId, () => gananciaDelPeriodo(RANGO(sede.id)));
    expect(r.compras).toBe(1100);
    expect(r.pagosProveedor).toBe(400);
    expect(r.ganancia).toBe(-400); // 0 − 400 − 0
  });

  it('compra a crédito pagada por COMPLETO: todo el monto es egreso', async () => {
    const { empresaId, sede, usuario, prov } = await escenario();
    const compra = await comoEmpresa(empresaId, () =>
      registrarCompra(compraCredito(prov.id, sede.id, 'FULL', 1100)),
    );
    await comoEmpresa(empresaId, () =>
      registrarPago({ compraId: compra.id, monto: 1100, fechaPago: '2026-08-05', usuarioId: usuario.id }),
    );
    const r = await comoEmpresa(empresaId, () => gananciaDelPeriodo(RANGO(sede.id)));
    expect(r.pagosProveedor).toBe(1100);
  });

  it('compra de CONTADO: egreso completo en la fecha de emisión (pagada en el acto)', async () => {
    const { empresaId, sede, prov } = await escenario();
    await comoEmpresa(empresaId, () =>
      registrarCompra({
        proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'CONT', montoTotal: 1100,
        tipo: 'contado', fechaEmision: '2026-08-01',
      }),
    );
    const r = await comoEmpresa(empresaId, () => gananciaDelPeriodo(RANGO(sede.id)));
    expect(r.compras).toBe(1100); // registrada
    expect(r.pagosProveedor).toBe(1100); // el contado sale de caja al momento
  });

  it('ganancia caja = ventas − pagos a proveedor − gastos (una compra impaga no la reduce)', async () => {
    const { empresaId, sede, usuario, prov } = await escenario();
    await comoEmpresa(empresaId, () =>
      registrarVenta({
        sedeId: sede.id, fechaOperacion: '2026-08-02', turno: 'manana', cajera: '1', cerradoPor: 'A',
        usuarioId: usuario.id, detalles: [{ tipoArqueo: 'efectivo', monto: 2000 }],
      }),
    );
    // Impaga de 1100 (no resta) + pagada de 300 (sí resta).
    await comoEmpresa(empresaId, () =>
      registrarCompra(compraCredito(prov.id, sede.id, 'MIX-IMPAGA', 1100)),
    );
    const pagada = await comoEmpresa(empresaId, () =>
      registrarCompra(compraCredito(prov.id, sede.id, 'MIX-PAGADA', 300)),
    );
    await comoEmpresa(empresaId, () =>
      registrarPago({ compraId: pagada.id, monto: 300, fechaPago: '2026-08-03', usuarioId: usuario.id }),
    );
    const r = await comoEmpresa(empresaId, () => gananciaDelPeriodo(RANGO(sede.id)));
    expect(r.ventas).toBe(2000);
    expect(r.compras).toBe(1400); // 1100 + 300 registradas (devengado)
    expect(r.pagosProveedor).toBe(300); // solo lo realmente pagado
    expect(r.ganancia).toBe(1700); // 2000 − 300 − 0 (la impaga NO reduce la caja)
  });
});
