import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/core/prisma.js';
import {
  corregirMovimiento,
  ErrorCorreccion,
} from '../../src/shared/services/correccion.service.js';
import { adaptadorPago } from '../../src/finanzas/cuentas-por-pagar/pago.correccion.js';

let contador = 0;

/** Crea sede, usuario, proveedor, una compra de 1000 y un pago normal. */
async function crearEscenario(montoPago: number) {
  contador += 1;
  const sede = await prisma.sede.create({ data: { nombre: `Sede ${contador}` } });
  const usuario = await prisma.usuario.create({
    data: {
      nombre: 'Tester',
      email: `tester${contador}@gestorpro.local`,
      rol: 'administrador',
      passwordHash: 'x',
    },
  });
  const proveedor = await prisma.proveedor.create({
    data: { nombre: `Proveedor ${contador}` },
  });
  const compra = await prisma.compra.create({
    data: {
      proveedorId: proveedor.id,
      sedeId: sede.id,
      numeroFactura: `F-${contador}`,
      montoTotal: 1000,
      fechaEmision: new Date(),
      fechaVencimiento: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  const pago = await prisma.pagoProveedor.create({
    data: {
      compraId: compra.id,
      monto: montoPago,
      fechaPago: new Date(),
      tipo: 'normal',
      usuarioId: usuario.id,
    },
  });
  return { sede, usuario, proveedor, compra, pago };
}

async function saldoDe(compraId: string): Promise<number> {
  const filas = await prisma.$queryRaw<Array<{ saldo: string }>>`
    SELECT saldo FROM cuenta_por_pagar WHERE compra_id = ${compraId}::uuid`;
  return Number(filas[0]?.saldo);
}

describe('corrección de movimientos (PagoProveedor)', () => {
  it('anulación pura: crea un reverso, deja el original intacto y audita', async () => {
    const { compra, usuario, pago } = await crearEscenario(500);

    const res = await corregirMovimiento(adaptadorPago, {
      movimientoId: pago.id,
      motivo: 'monto equivocado',
      usuarioId: usuario.id,
    });

    expect(res.correccion).toBeNull();

    // El original es inmutable: sigue normal y con su monto.
    const original = await prisma.pagoProveedor.findUnique({ where: { id: pago.id } });
    expect(original?.tipo).toBe('normal');
    expect(Number(original?.monto)).toBe(500);

    // El reverso anula el pago: el saldo vuelve a 1000.
    expect(await saldoDe(compra.id)).toBe(1000);

    // Quedó el rastro en auditoría.
    const aud = await prisma.auditoria.findMany({
      where: { entidadId: res.reverso.id, accion: 'reverso' },
    });
    expect(aud).toHaveLength(1);
  });

  it('reverso + corrección: el neto pagado es el monto corregido', async () => {
    const { compra, usuario, pago } = await crearEscenario(500);

    const res = await corregirMovimiento(adaptadorPago, {
      movimientoId: pago.id,
      motivo: 'ajuste de monto',
      usuarioId: usuario.id,
      montoCorregido: 300,
    });

    expect(res.correccion).not.toBeNull();
    // 1000 - (500 normal - 500 reverso + 300 corrección) = 700
    expect(await saldoDe(compra.id)).toBe(700);

    const audCorr = await prisma.auditoria.findMany({
      where: { entidadId: res.correccion?.id, accion: 'correccion' },
    });
    expect(audCorr).toHaveLength(1);
  });

  it('rechaza corregir un asiento que no es normal', async () => {
    const { usuario, pago } = await crearEscenario(500);
    const res = await corregirMovimiento(adaptadorPago, {
      movimientoId: pago.id,
      motivo: 'primera corrección',
      usuarioId: usuario.id,
    });

    await expect(
      corregirMovimiento(adaptadorPago, {
        movimientoId: res.reverso.id,
        motivo: 'corregir el reverso',
        usuarioId: usuario.id,
      }),
    ).rejects.toBeInstanceOf(ErrorCorreccion);
  });

  it('rechaza una corrección sin motivo', async () => {
    const { usuario, pago } = await crearEscenario(500);
    await expect(
      corregirMovimiento(adaptadorPago, {
        movimientoId: pago.id,
        motivo: '   ',
        usuarioId: usuario.id,
      }),
    ).rejects.toBeInstanceOf(ErrorCorreccion);
  });
});
