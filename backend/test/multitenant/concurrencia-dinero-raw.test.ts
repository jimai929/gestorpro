import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla, crearEmpresa } from '../helpers/db.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';

/**
 * ⑧.2 Aislamiento de los CAMINOS DE DINERO con `$queryRaw … FOR UPDATE` bajo
 * CONCURRENCIA cross-tenant (Fase 8, lote 2). Los dos guards de dinero
 * (anti-sobrepago en `registrarPago`, saldo no-negativo en `debitarSaldo`) abren su
 * `$transaction` vía `txEmpresa`, que fija `app.empresa_id` LOCAL; el `FOR UPDATE` y el
 * `SUM` corren bajo esa RLS. El preHandler resuelve el tenant en la ALS (`enterWith`).
 * Lo que ESTE test estresa: con A y B disparando en paralelo e INTERCALADOS, cada
 * request debe resolver SU propio tenant y sus guards de dinero deben operar SOLO
 * sobre las filas de ESE tenant — si el contexto async se cruzara (la fragilidad de
 * `enterWith`), el guard leería el límite del tenant vecino y la decisión se invertiría.
 *
 * ALCANCE (honesto): como `set_config` es LOCAL y `$transaction` usa una conexión
 * dedicada, un `set_config` no-LOCAL NO tiene aquí un camino de lectura observable
 * (todo acceso de tenant pasa por `txEmpresa`, que RE-fija el GUC al inicio de cada tx).
 * Este test NO pretende cazar ese bug de infraestructura; cubre el cruce de contexto de
 * ALS en los caminos de dinero, que es lo que el código de la app sí puede equivocar.
 *
 * CONSTRUCCIÓN (límites ASIMÉTRICOS para que un cruce de contexto dé un resultado de
 * negocio OBSERVABLEMENTE incorrecto, no un empate de carrera):
 *   - Tenant A: límite 100.  Tenant B: límite 1000.  Cada request intenta 150.
 *   - Sin cruce: A SIEMPRE rechaza (150 > 100); B procesa serializado por el FOR UPDATE
 *     hasta agotar su límite (exactamente floor(1000/150)=6 éxitos, nunca negativo).
 *   - Cruce A↔B: A leería 1000 ⇒ aceptaría (god-view detecta el toque a A); o B leería
 *     100 ⇒ menos de 6 éxitos (god-view: conteo/saldo de B lo caza). El DISCRIMINANTE
 *     load-bearing es la GOD-VIEW final; el "ningún 404" es señal extra del sobrepago.
 *
 * Semilla vía `semilla()` (BYPASSRLS) SOLO para arrange; las acciones van por HTTP
 * (RLS real); la god-view es la red de seguridad load-bearing de las aserciones.
 */

const MONTO = 150;
const LIMITE_A = 100;
const LIMITE_B = 1000;
const EXITOS_B = Math.floor(LIMITE_B / MONTO); // 6
// K requests POR tenant ⇒ 2K=30 POST concurrentes e INTERCALADOS A/B: ejercita los
// guards de dinero de ambos tenants en paralelo real (Promise.all), que es donde un
// cruce de contexto de ALS se manifestaría. K≥7 garantiza SATURAR el límite de B
// (floor(1000/150)=6 éxitos; el resto lo rechaza el FOR UPDATE), haciendo el conteo
// determinista.
const K = 15;

describe('Fase 8 ⑧.2a — sobrepago (compra FOR UPDATE) aislado bajo concurrencia', () => {
  let app: FastifyInstance;
  let tokenA: string;
  let tokenB: string;
  let compraA: string;
  let compraB: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-dinero-raw-pago';
    const a = await sembrarTenantConCompra('A', LIMITE_A);
    const b = await sembrarTenantConCompra('B', LIMITE_B);
    compraA = a.compraId;
    compraB = b.compraId;
    app = construirApp();
    await app.ready();
    tokenA = app.jwt.sign({ sub: randomUUID(), rol: 'administrador', empresaId: a.empresaId, esSuperAdmin: false });
    tokenB = app.jwt.sign({ sub: randomUUID(), rol: 'administrador', empresaId: b.empresaId, esSuperAdmin: false });
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  it('A (límite 100) rechaza todos; B (límite 1000) acepta exactamente 6; sin cruce ni 404', async () => {
    const pagar = (token: string, compraId: string) =>
      app.inject({
        method: 'POST',
        url: '/pagos',
        headers: { authorization: `Bearer ${token}` },
        payload: { compraId, monto: MONTO },
      });

    const peticiones = Array.from({ length: 2 * K }, (_, i) =>
      (i % 2 === 0
        ? pagar(tokenA, compraA).then((res) => ({ tenant: 'A' as const, res }))
        : pagar(tokenB, compraB).then((res) => ({ tenant: 'B' as const, res }))),
    );
    const r = await Promise.all(peticiones);

    const deA = r.filter((x) => x.tenant === 'A').map((x) => x.res.statusCode);
    const deB = r.filter((x) => x.tenant === 'B').map((x) => x.res.statusCode);

    // Ningún 404 espurio: el recurso propio SIEMPRE es visible bajo el GUC propio.
    expect(r.every((x) => x.res.statusCode !== 404)).toBe(true);
    // A: TODOS rechazados por sobrepago (400). Un solo 201 sería fuga A←B.
    expect(deA.every((c) => c === 400)).toBe(true);
    // B: exactamente 6 aceptados (201), el resto sobrepago (400).
    expect(deB.filter((c) => c === 201)).toHaveLength(EXITOS_B);

    // God-view: la compra de A quedó INTACTA (0 pagos); la de B con 6 pagos = 900.
    expect(await semilla().pagoProveedor.count({ where: { compraId: compraA } })).toBe(0);
    const pagosB = await semilla().pagoProveedor.aggregate({
      where: { compraId: compraB },
      _sum: { monto: true },
      _count: true,
    });
    expect(pagosB._count).toBe(EXITOS_B);
    expect(Number(pagosB._sum.monto)).toBe(EXITOS_B * MONTO); // 900; saldo restante = 100, nunca negativo
  });
});

describe('Fase 8 ⑧.2b — saldo (saldo_horas_extra FOR UPDATE) aislado bajo concurrencia', () => {
  let app: FastifyInstance;
  let tokenA: string;
  let tokenB: string;
  let empleadoA: string;
  let empleadoB: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-dinero-raw-saldo';
    const a = await sembrarTenantConSaldo('A', LIMITE_A);
    const b = await sembrarTenantConSaldo('B', LIMITE_B);
    empleadoA = a.empleadoId;
    empleadoB = b.empleadoId;
    app = construirApp();
    await app.ready();
    tokenA = app.jwt.sign({ sub: randomUUID(), rol: 'administrador', empresaId: a.empresaId, esSuperAdmin: false });
    tokenB = app.jwt.sign({ sub: randomUUID(), rol: 'administrador', empresaId: b.empresaId, esSuperAdmin: false });
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  it('A (saldo 100) rechaza todos; B (saldo 1000) cobra exactamente 6; saldo nunca negativo', async () => {
    const cobrar = (token: string, empleadoId: string) =>
      app.inject({
        method: 'POST',
        url: '/cobros',
        headers: { authorization: `Bearer ${token}` },
        payload: { empleadoId, monto: MONTO },
      });

    const peticiones = Array.from({ length: 2 * K }, (_, i) =>
      (i % 2 === 0
        ? cobrar(tokenA, empleadoA).then((res) => ({ tenant: 'A' as const, res }))
        : cobrar(tokenB, empleadoB).then((res) => ({ tenant: 'B' as const, res }))),
    );
    const r = await Promise.all(peticiones);

    const deA = r.filter((x) => x.tenant === 'A').map((x) => x.res.statusCode);
    const deB = r.filter((x) => x.tenant === 'B').map((x) => x.res.statusCode);

    // Sanity de status (en saldo, un cruce B←A da 400 igual que el rechazo legítimo:
    // NO lo discrimina el código → lo caza la god-view de abajo, no este check).
    expect(r.every((x) => x.res.statusCode !== 404)).toBe(true);
    // A: saldo 100 < 150 ⇒ TODOS rechazados (400). Un éxito sería cruce A←B.
    expect(deA.every((c) => c === 400)).toBe(true);
    // B: exactamente 6 cobros directos aprobados (201).
    expect(deB.filter((c) => c === 201)).toHaveLength(EXITOS_B);

    // God-view (DISCRIMINANTE load-bearing): saldo de A INTACTO (100); el de B =
    // 1000 - 6*150 = 100, ≥ 0. Caza ambos sentidos del cruce (A toca su saldo / B<6).
    const saldoA = await semilla().saldoHorasExtra.findUnique({ where: { empleadoId: empleadoA } });
    const saldoB = await semilla().saldoHorasExtra.findUnique({ where: { empleadoId: empleadoB } });
    expect(Number(saldoA?.saldo)).toBe(LIMITE_A);
    expect(Number(saldoB?.saldo)).toBe(LIMITE_B - EXITOS_B * MONTO);
    expect(Number(saldoB?.saldo)).toBeGreaterThanOrEqual(0);
  });
});

// ── arrange (semilla / BYPASSRLS): tenant con una compra a crédito de saldo limpio ──
async function sembrarTenantConCompra(etiqueta: string, montoTotal: number) {
  const db = semilla();
  const empresaId = await crearEmpresa(`${etiqueta} dinero-pago`);
  const u = `${etiqueta}-${randomUUID().slice(0, 8)}`;
  const sede = await db.sede.create({ data: { nombre: `Sede ${u}`, empresaId } });
  const proveedor = await db.proveedor.create({ data: { nombre: `Prov ${u}`, empresaId } });
  const compra = await db.compra.create({
    data: {
      proveedorId: proveedor.id,
      sedeId: sede.id,
      numeroFactura: `F-${u}`,
      montoTotal, // saldo inicial = montoTotal (sin pagos)
      tipo: 'credito',
      fechaEmision: new Date('2026-01-05'),
      fechaVencimiento: new Date('2026-02-05'),
    },
  });
  return { empresaId, compraId: compra.id };
}

// ── arrange: tenant con un empleado con saldo de horas extra y cobro auto-aprobable ──
async function sembrarTenantConSaldo(etiqueta: string, saldo: number) {
  const db = semilla();
  const empresaId = await crearEmpresa(`${etiqueta} dinero-saldo`);
  const u = `${etiqueta}-${randomUUID().slice(0, 8)}`;
  const sede = await db.sede.create({ data: { nombre: `Sede ${u}`, empresaId } });
  // porcentaje 100 (disponible = saldo) y umbral alto (el cobro nace 'aprobada' y
  // DEBITA en el acto, ejercitando el FOR UPDATE de debitarSaldo).
  await db.configuracionCobro.create({
    data: { empresaId, porcentajeCobrable: 100, umbralAprobacion: 1_000_000 },
  });
  const empleado = await db.empleado.create({
    data: {
      empresaId,
      numero: `E-${u}`,
      nombre: `Empleado ${etiqueta}`,
      sedeId: sede.id,
      qrToken: `qr-${u}`,
      pinHash: await hashearContrasena('5293'),
      salarioFijo: 1000,
    },
  });
  await db.saldoHorasExtra.create({ data: { empleadoId: empleado.id, saldo } });
  return { empresaId, empleadoId: empleado.id };
}
