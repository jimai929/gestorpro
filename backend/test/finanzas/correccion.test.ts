import { describe, it, expect } from 'vitest';
import { txEmpresa } from '../../src/core/tenant/contexto.js';
import { semilla, comoEmpresa, crearEmpresa } from '../helpers/db.js';
import {
  corregirMovimiento,
  ErrorCorreccion,
} from '../../src/shared/services/correccion.service.js';
import { adaptadorPago } from '../../src/finanzas/cuentas-por-pagar/pago.correccion.js';
import { adaptadorGasto } from '../../src/finanzas/gastos/gasto.correccion.js';
import { adaptadorVenta } from '../../src/finanzas/dashboard/venta.correccion.js';

// CONVENCIÓN RLS (ver PLAN_FASE5_RLS §6.4): los fixtures (arrange) se SIEMBRAN con
// `semilla()` (bypass, como el migrador). Las aserciones POSITIVAS de negocio se
// LEEN bajo `comoEmpresa(empresaId, () => txEmpresa(...))` — rol app + GUC + RLS —
// para probar que el TENANT ve su propio dato; NUNCA con semilla (eso saltaría RLS
// y sería un falso verde).

let contador = 0;

/** Crea sede, usuario, proveedor, una compra de 1000 y un pago normal (arrange). */
async function crearEscenario(empresaId: string, montoPago: number) {
  contador += 1;
  const sede = await semilla().sede.create({ data: { nombre: `Sede ${contador}`, empresaId } });
  const usuario = await semilla().usuario.create({
    data: {
      nombre: 'Tester',
      email: `tester${contador}@gestorpro.local`,
      rol: 'administrador',
      passwordHash: 'x',
    },
  });
  const proveedor = await semilla().proveedor.create({
    data: { nombre: `Proveedor ${contador}`, empresaId },
  });
  const compra = await semilla().compra.create({
    data: {
      proveedorId: proveedor.id,
      sedeId: sede.id,
      numeroFactura: `F-${contador}`,
      montoTotal: 1000,
      fechaEmision: new Date(),
      fechaVencimiento: new Date(Date.now() + 30 * 86_400_000),
    },
  });
  const pago = await semilla().pagoProveedor.create({
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

/** Saldo de la vista cuenta_por_pagar, LEÍDO bajo RLS (el tenant ve su vista). */
async function saldoDe(empresaId: string, compraId: string): Promise<number> {
  const filas = await comoEmpresa(empresaId, () =>
    txEmpresa(
      (tx) => tx.$queryRaw<Array<{ saldo: string }>>`
        SELECT saldo FROM cuenta_por_pagar WHERE compra_id = ${compraId}::uuid`,
    ),
  );
  return Number(filas[0]?.saldo);
}

describe('corrección de movimientos (PagoProveedor)', () => {
  it('anulación pura: crea un reverso, deja el original intacto y audita', async () => {
    const empresaId = await crearEmpresa();
    const { compra, usuario, pago } = await crearEscenario(empresaId, 500);

    const res = await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, {
        movimientoId: pago.id,
        motivo: 'monto equivocado',
        usuarioId: usuario.id,
      }),
    );

    expect(res.correccion).toBeNull();

    // El original es inmutable: sigue normal y con su monto. Lectura POSITIVA bajo
    // RLS (el tenant ve su pago).
    const original = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) => tx.pagoProveedor.findUnique({ where: { id: pago.id } })),
    );
    expect(original?.tipo).toBe('normal');
    expect(Number(original?.monto)).toBe(500);

    // El reverso anula el pago: el saldo vuelve a 1000.
    expect(await saldoDe(empresaId, compra.id)).toBe(1000);

    // Quedó el rastro en auditoría (lectura POSITIVA bajo RLS).
    const aud = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) =>
        tx.auditoria.findMany({ where: { entidadId: res.reverso.id, accion: 'reverso' } }),
      ),
    );
    expect(aud).toHaveLength(1);
  });

  it('reverso + corrección: el neto pagado es el monto corregido', async () => {
    const empresaId = await crearEmpresa();
    const { compra, usuario, pago } = await crearEscenario(empresaId, 500);

    const res = await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, {
        movimientoId: pago.id,
        motivo: 'ajuste de monto',
        usuarioId: usuario.id,
        montoCorregido: 300,
      }),
    );

    expect(res.correccion).not.toBeNull();
    // 1000 - (500 normal - 500 reverso + 300 corrección) = 700
    expect(await saldoDe(empresaId, compra.id)).toBe(700);

    const audCorr = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) =>
        tx.auditoria.findMany({ where: { entidadId: res.correccion?.id, accion: 'correccion' } }),
      ),
    );
    expect(audCorr).toHaveLength(1);
  });

  it('rechaza corregir un asiento que no es normal', async () => {
    const empresaId = await crearEmpresa();
    const { usuario, pago } = await crearEscenario(empresaId, 500);
    const res = await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, {
        movimientoId: pago.id,
        motivo: 'primera corrección',
        usuarioId: usuario.id,
      }),
    );

    await expect(
      comoEmpresa(empresaId, () =>
        corregirMovimiento(adaptadorPago, {
          movimientoId: res.reverso.id,
          motivo: 'corregir el reverso',
          usuarioId: usuario.id,
        }),
      ),
    ).rejects.toBeInstanceOf(ErrorCorreccion);
  });

  it('rechaza una corrección sin motivo', async () => {
    const empresaId = await crearEmpresa();
    const { usuario, pago } = await crearEscenario(empresaId, 500);
    await expect(
      comoEmpresa(empresaId, () =>
        corregirMovimiento(adaptadorPago, {
          movimientoId: pago.id,
          motivo: '   ',
          usuarioId: usuario.id,
        }),
      ),
    ).rejects.toBeInstanceOf(ErrorCorreccion);
  });
});

describe('corrección de movimientos (Gasto)', () => {
  it('reverso + corrección deja el neto en el monto corregido', async () => {
    const empresaId = await crearEmpresa();
    contador += 1;
    const sede = await semilla().sede.create({ data: { nombre: `SedeG ${contador}`, empresaId } });
    const usuario = await semilla().usuario.create({
      data: { nombre: 'T', email: `g${contador}@gestorpro.local`, rol: 'administrador', passwordHash: 'x' },
    });
    const categoria = await semilla().categoriaGasto.create({ data: { nombre: `Cat ${contador}`, empresaId } });
    const gasto = await semilla().gasto.create({
      data: { categoriaId: categoria.id, sedeId: sede.id, monto: 200, fechaOperacion: new Date(), tipo: 'normal', usuarioId: usuario.id },
    });

    const res = await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorGasto, {
        movimientoId: gasto.id, motivo: 'monto equivocado', usuarioId: usuario.id, montoCorregido: 120,
      }),
    );

    expect(res.correccion).not.toBeNull();
    // El original es inmutable (lectura POSITIVA bajo RLS).
    const original = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) => tx.gasto.findUnique({ where: { id: gasto.id } })),
    );
    expect(original?.tipo).toBe('normal');
    expect(Number(original?.monto)).toBe(200);

    // neto = 200 normal - 200 reverso + 120 corrección = 120 (lectura POSITIVA bajo RLS).
    const asientos = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) =>
        tx.gasto.findMany({ where: { OR: [{ id: gasto.id }, { corrigeId: gasto.id }] } }),
      ),
    );
    const neto = asientos.reduce(
      (acc, a) => acc + (a.tipo === 'reverso' ? -Number(a.monto) : Number(a.monto)),
      0,
    );
    expect(neto).toBe(120);

    const aud = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) =>
        tx.auditoria.findMany({ where: { entidad: 'gasto', entidadId: res.correccion?.id } }),
      ),
    );
    expect(aud).toHaveLength(1);
  });
});

describe('corrección de movimientos (VentaDiaria)', () => {
  it('anulación pura crea un reverso sobre la misma cajera/turno copiando el arqueo, sin violar el índice parcial', async () => {
    const empresaId = await crearEmpresa();
    contador += 1;
    const sede = await semilla().sede.create({ data: { nombre: `SedeV ${contador}`, empresaId } });
    const usuario = await semilla().usuario.create({
      data: { nombre: 'T', email: `v${contador}@gestorpro.local`, rol: 'administrador', passwordHash: 'x' },
    });
    const venta = await semilla().ventaDiaria.create({
      data: {
        sedeId: sede.id, fechaOperacion: new Date('2026-03-10'), turno: 'manana', cajera: 'E001 - Cajero 1',
        cerradoPor: 'E004 - Verificador 1', monto: 1000, tipo: 'normal', usuarioId: usuario.id,
        detalles: { create: [{ tipoArqueo: 'efectivo', monto: 600 }, { tipoArqueo: 'tarjeta', monto: 400 }] },
      },
    });

    const res = await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorVenta, {
        movimientoId: venta.id, motivo: 'cierre mal tecleado', usuarioId: usuario.id,
      }),
    );

    expect(res.correccion).toBeNull();
    // El original es inmutable (lectura POSITIVA bajo RLS).
    const original = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) => tx.ventaDiaria.findUnique({ where: { id: venta.id } })),
    );
    expect(original?.tipo).toBe('normal');
    expect(Number(original?.monto)).toBe(1000);

    // El reverso comparte (sede, fecha, turno, cajera) con el original: uq_venta_normal
    // no lo bloquea porque solo aplica a tipo = 'normal'. Y copia el arqueo, para que
    // el neto por tipo siga cuadrando (lectura POSITIVA bajo RLS).
    const reverso = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) =>
        tx.ventaDiaria.findUnique({ where: { id: res.reverso.id }, include: { detalles: true } }),
      ),
    );
    expect(reverso?.tipo).toBe('reverso');
    expect(reverso?.detalles).toHaveLength(2);
    expect(reverso?.detalles.reduce((acc, d) => acc + Number(d.monto), 0)).toBe(1000);

    const aud = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) =>
        tx.auditoria.findMany({ where: { entidad: 'venta', entidadId: res.reverso.id, accion: 'reverso' } }),
      ),
    );
    expect(aud).toHaveLength(1);
  });
});
