import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { txEmpresa } from '../../src/core/tenant/contexto.js';
import { ErrorConflicto } from '../../src/core/errors.js';
import { semilla, comoEmpresa, crearEmpresa } from '../helpers/db.js';
import {
  corregirMovimiento,
  ErrorCorreccion,
} from '../../src/shared/services/correccion.service.js';
import { adaptadorPago } from '../../src/finanzas/cuentas-por-pagar/pago.correccion.js';
import { adaptadorGasto } from '../../src/finanzas/gastos/gasto.correccion.js';
import { adaptadorVenta } from '../../src/finanzas/dashboard/venta.correccion.js';
import { registrarPago } from '../../src/finanzas/cuentas-por-pagar/cuentas-por-pagar.service.js';

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

// ─── H2: regla "sin doble corrección" ───────────────────────────────────────

describe('sin doble corrección (H2): un movimiento normal admite a lo sumo UN reverso', () => {
  it('pago: la segunda corrección del MISMO movimiento → ErrorConflicto (409) y no deja segundo reverso', async () => {
    const empresaId = await crearEmpresa();
    const { usuario, pago } = await crearEscenario(empresaId, 500);

    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, {
        movimientoId: pago.id, motivo: 'primera', usuarioId: usuario.id, montoCorregido: 300,
      }),
    );
    await expect(
      comoEmpresa(empresaId, () =>
        corregirMovimiento(adaptadorPago, {
          movimientoId: pago.id, motivo: 'segunda', usuarioId: usuario.id, montoCorregido: 200,
        }),
      ),
    ).rejects.toBeInstanceOf(ErrorConflicto);

    const reversos = await semilla().pagoProveedor.count({
      where: { corrigeId: pago.id, tipo: 'reverso' },
    });
    expect(reversos).toBe(1);
  });

  it('gasto: la segunda corrección → ErrorConflicto', async () => {
    const empresaId = await crearEmpresa();
    contador += 1;
    const sede = await semilla().sede.create({ data: { nombre: `SedeH2G ${contador}`, empresaId } });
    const usuario = await semilla().usuario.create({
      data: { nombre: 'T', email: `h2g${contador}@gestorpro.local`, rol: 'administrador', passwordHash: 'x' },
    });
    const categoria = await semilla().categoriaGasto.create({ data: { nombre: `CatH2 ${contador}`, empresaId } });
    const gasto = await semilla().gasto.create({
      data: { categoriaId: categoria.id, sedeId: sede.id, monto: 200, fechaOperacion: new Date(), tipo: 'normal', usuarioId: usuario.id },
    });

    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorGasto, { movimientoId: gasto.id, motivo: 'primera', usuarioId: usuario.id }),
    );
    await expect(
      comoEmpresa(empresaId, () =>
        corregirMovimiento(adaptadorGasto, { movimientoId: gasto.id, motivo: 'segunda', usuarioId: usuario.id }),
      ),
    ).rejects.toBeInstanceOf(ErrorConflicto);
  });

  it('venta: la segunda corrección → ErrorConflicto', async () => {
    const empresaId = await crearEmpresa();
    contador += 1;
    const sede = await semilla().sede.create({ data: { nombre: `SedeH2V ${contador}`, empresaId } });
    const usuario = await semilla().usuario.create({
      data: { nombre: 'T', email: `h2v${contador}@gestorpro.local`, rol: 'administrador', passwordHash: 'x' },
    });
    const venta = await semilla().ventaDiaria.create({
      data: {
        sedeId: sede.id, fechaOperacion: new Date('2026-04-01'), turno: 'manana', cajera: 'E001 - C',
        cerradoPor: 'E004 - V', monto: 900, tipo: 'normal', usuarioId: usuario.id,
        detalles: { create: [{ tipoArqueo: 'efectivo', monto: 900 }] },
      },
    });

    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorVenta, { movimientoId: venta.id, motivo: 'primera', usuarioId: usuario.id }),
    );
    await expect(
      comoEmpresa(empresaId, () =>
        corregirMovimiento(adaptadorVenta, { movimientoId: venta.id, motivo: 'segunda', usuarioId: usuario.id }),
      ),
    ).rejects.toBeInstanceOf(ErrorConflicto);
  });

  it('CARRERA pago: dos correcciones CONCURRENTES → exactamente una gana, la otra 409, un solo reverso', async () => {
    const empresaId = await crearEmpresa();
    const { usuario, pago } = await crearEscenario(empresaId, 500);

    // Anulaciones puras. El adaptador de pago SIEMPRE bloquea pago→compra en
    // bloquearOriginal (también sin corrección): la contención decisiva para H2
    // es el FOR UPDATE de la fila del PAGO — la perdedora despierta tras el
    // commit de la ganadora y existeReverso ve su reverso.
    const resultados = await Promise.allSettled([
      comoEmpresa(empresaId, () =>
        corregirMovimiento(adaptadorPago, { movimientoId: pago.id, motivo: 'carrera A', usuarioId: usuario.id }),
      ),
      comoEmpresa(empresaId, () =>
        corregirMovimiento(adaptadorPago, { movimientoId: pago.id, motivo: 'carrera B', usuarioId: usuario.id }),
      ),
    ]);

    const ganadoras = resultados.filter((r) => r.status === 'fulfilled');
    const perdedoras = resultados.filter(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );
    expect(ganadoras).toHaveLength(1);
    expect(perdedoras).toHaveLength(1);
    expect(perdedoras[0]!.reason).toBeInstanceOf(ErrorConflicto);

    const reversos = await semilla().pagoProveedor.count({
      where: { corrigeId: pago.id, tipo: 'reverso' },
    });
    expect(reversos).toBe(1);
  });
});

// ─── M1: guard de sobrepago en la corrección de pago ────────────────────────

describe('sobrepago vía corrección de pago (M1): el pago efectivo nunca supera el total de la compra', () => {
  it('compra 1000, pago 500 → montoCorregido 1500 excede → ErrorConflicto y la tx ENTERA revierte (ni reverso ni corrección)', async () => {
    const empresaId = await crearEmpresa();
    const { compra, usuario, pago } = await crearEscenario(empresaId, 500);

    await expect(
      comoEmpresa(empresaId, () =>
        corregirMovimiento(adaptadorPago, {
          movimientoId: pago.id, motivo: 'sobrepago', usuarioId: usuario.id, montoCorregido: 1500,
        }),
      ),
    ).rejects.toBeInstanceOf(ErrorConflicto);

    // Rollback TOTAL: no quedó ningún asiento colgando del pago ni auditoría.
    const asientos = await semilla().pagoProveedor.count({ where: { corrigeId: pago.id } });
    expect(asientos).toBe(0);
    // La auditoría iba atada a la MISMA tx: el rollback también se la llevó.
    const auditorias = await semilla().auditoria.count({
      where: { detalle: { path: ['movimientoOriginal'], equals: pago.id } },
    });
    expect(auditorias).toBe(0);
    expect(await saldoDe(empresaId, compra.id)).toBe(500); // saldo intacto

    // Como el guard corta, el pago sigue corregible (H2 no quedó "gastado").
    const res = await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, {
        movimientoId: pago.id, motivo: 'ahora válida', usuarioId: usuario.id, montoCorregido: 400,
      }),
    );
    expect(res.correccion).not.toBeNull();
  });

  it('multi-pago: corregir hasta EXACTAMENTE el total → OK; un centavo más (escenario gemelo) → 409', async () => {
    // Escenario 1: compra 1000, pagos 500 + 300 → corregir el de 500 a 700 = exactamente 1000.
    const empresaId = await crearEmpresa();
    const { compra, usuario, pago } = await crearEscenario(empresaId, 500);
    await semilla().pagoProveedor.create({
      data: { compraId: compra.id, monto: 300, fechaPago: new Date(), tipo: 'normal', usuarioId: usuario.id },
    });
    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, {
        movimientoId: pago.id, motivo: 'al tope exacto', usuarioId: usuario.id, montoCorregido: 700,
      }),
    );
    expect(await saldoDe(empresaId, compra.id)).toBe(0);

    // Escenario 2 (gemelo, porque H2 ya no deja re-corregir el anterior): 700.01 → 409.
    const dos = await crearEscenario(empresaId, 500);
    await semilla().pagoProveedor.create({
      data: { compraId: dos.compra.id, monto: 300, fechaPago: new Date(), tipo: 'normal', usuarioId: dos.usuario.id },
    });
    await expect(
      comoEmpresa(empresaId, () =>
        corregirMovimiento(adaptadorPago, {
          movimientoId: dos.pago.id, motivo: 'un centavo de más', usuarioId: dos.usuario.id, montoCorregido: 700.01,
        }),
      ),
    ).rejects.toBeInstanceOf(ErrorConflicto);
  });

  it('CARRERA corrección (a 800) vs abono (500) sobre compra 1000 con pago 500: exactamente una gana y el pago efectivo NUNCA supera 1000', async () => {
    const empresaId = await crearEmpresa();
    const { compra, usuario, pago } = await crearEscenario(empresaId, 500);

    // Cada operación cabe POR SÍ SOLA (corrección deja 800; abono deja 1000), pero
    // juntas suman 1300 > 1000: el lock de la compra (compartido por ambos guards)
    // obliga a que exactamente una vea a la otra y aborte.
    const resultados = await Promise.allSettled([
      comoEmpresa(empresaId, () =>
        corregirMovimiento(adaptadorPago, {
          movimientoId: pago.id, motivo: 'sube a 800', usuarioId: usuario.id, montoCorregido: 800,
        }),
      ),
      comoEmpresa(empresaId, () =>
        registrarPago({ compraId: compra.id, monto: 500, usuarioId: usuario.id }),
      ),
    ]);

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const filas = await semilla().$queryRaw<Array<{ pagado: string }>>`
      SELECT COALESCE(SUM(CASE WHEN tipo = 'reverso' THEN -monto ELSE monto END), 0) AS pagado
      FROM pago_proveedor WHERE compra_id = ${compra.id}::uuid`;
    expect(Number(filas[0]?.pagado)).toBeLessThanOrEqual(1000);
  });
});

// ─── HTTP: POST /correcciones pinea el contrato 201 → 409 ───────────────────

describe('POST /correcciones (HTTP): doble corrección → 409', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-correcciones';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('primera corrección 201; la segunda del MISMO movimiento 409 con el mensaje del guard', async () => {
    const empresaId = await crearEmpresa();
    const { usuario, pago } = await crearEscenario(empresaId, 500);
    const token = app.jwt.sign({
      sub: usuario.id, rol: 'administrador', empresaId, esSuperAdmin: false,
    });

    const primera = await app.inject({
      method: 'POST',
      url: '/correcciones',
      headers: { authorization: `Bearer ${token}` },
      payload: { entidad: 'pago', movimientoId: pago.id, motivo: 'primera', montoCorregido: 300 },
    });
    expect(primera.statusCode).toBe(201);

    const segunda = await app.inject({
      method: 'POST',
      url: '/correcciones',
      headers: { authorization: `Bearer ${token}` },
      payload: { entidad: 'pago', movimientoId: pago.id, motivo: 'segunda', montoCorregido: 200 },
    });
    expect(segunda.statusCode).toBe(409);
    expect(segunda.json().mensaje).toBe(
      'El movimiento ya fue corregido: no admite una segunda corrección.',
    );
  });
});
