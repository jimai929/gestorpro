/**
 * Estado de cuenta de proveedor (GET /cuentas-por-pagar/estado-cuenta).
 *
 * Prueba lo que hace conciliable el documento: saldo inicial REAL (no cero),
 * compras que suman, pagos que restan, correcciones/anulaciones que NO se
 * descuentan dos veces, la identidad saldoFinal = inicial + débitos − créditos,
 * y el aislamiento entre empresas.
 *
 * CONVENCIÓN RLS: fixtures con `semilla()` (bypass); aserciones POSITIVAS bajo
 * `comoEmpresa()` (rol app + GUC + RLS).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, comoEmpresa, crearEmpresa } from '../helpers/db.js';
import { estadoCuentaProveedor } from '../../src/finanzas/cuentas-por-pagar/estado-cuenta.service.js';
import { corregirMovimiento } from '../../src/shared/services/correccion.service.js';
import { adaptadorPago } from '../../src/finanzas/cuentas-por-pagar/pago.correccion.js';

let contador = 0;

async function base(empresaId: string) {
  contador += 1;
  const sede = await semilla().sede.create({ data: { nombre: `SedeEC ${contador}`, empresaId } });
  const usuario = await semilla().usuario.create({
    data: {
      nombre: `Admin EC ${contador}`,
      email: `ec${contador}@gestorpro.local`,
      rol: 'administrador',
      passwordHash: 'x',
    },
  });
  const proveedor = await semilla().proveedor.create({
    data: { nombre: `Proveedor EC ${contador}`, empresaId },
  });
  return { sede, usuario, proveedor };
}

async function crearCompra(
  proveedorId: string,
  sedeId: string,
  monto: number,
  fecha: string,
  tipo: 'credito' | 'contado' = 'credito',
) {
  contador += 1;
  return semilla().compra.create({
    data: {
      proveedorId,
      sedeId,
      numeroFactura: `FEC-${contador}`,
      montoTotal: monto,
      tipo,
      fechaEmision: new Date(fecha),
      fechaVencimiento: new Date(fecha),
    },
  });
}

function crearPago(compraId: string, usuarioId: string, monto: number, fecha: string) {
  return semilla().pagoProveedor.create({
    data: { compraId, monto, fechaPago: new Date(fecha), tipo: 'normal', usuarioId },
  });
}

describe('estado de cuenta: saldos, compras y pagos', () => {
  it('el saldo inicial NO es 0: arrastra la deuda anterior (compras − pagos previos)', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario, proveedor } = await base(empresaId);

    // ANTES del período: compra 1000 y pago 400 → deuda previa 600.
    const compraVieja = await crearCompra(proveedor.id, sede.id, 1000, '2026-03-01');
    await crearPago(compraVieja.id, usuario.id, 400, '2026-03-15');
    // DENTRO del período: compra 500 y pago 200.
    await crearCompra(proveedor.id, sede.id, 500, '2026-04-10');
    const compraNueva = await semilla().compra.findFirst({
      where: { proveedorId: proveedor.id, fechaEmision: new Date('2026-04-10') },
    });
    await crearPago(compraNueva!.id, usuario.id, 200, '2026-04-20');

    const ec = await comoEmpresa(empresaId, () =>
      estadoCuentaProveedor({ proveedorId: proveedor.id, desde: '2026-04-01', hasta: '2026-04-30' }),
    );

    expect(ec.saldoInicial).toBe(600); // 1000 − 400, NO cero
    expect(ec.resumen.compras).toBe(500);
    expect(ec.resumen.pagos).toBe(200);
    // Identidad: inicial + débitos − créditos.
    expect(ec.saldoFinal).toBe(600 + 500 - 200);
    // Saldo corriente de cada movimiento.
    expect(ec.movimientos.map((m) => [m.tipo, m.debito, m.credito, m.saldo])).toEqual([
      ['compra', 500, 0, 1100],
      ['pago', 0, 200, 900],
    ]);
    // Cabecera sin fugas de tenant.
    expect(ec.proveedor.nombre).toBe(proveedor.nombre);
    expect(ec).not.toHaveProperty('empresaId');
    expect(ec.proveedor).not.toHaveProperty('empresaId');
  });

  it('una compra de CONTADO no genera deuda (no la cuenta por pagar)', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario, proveedor } = await base(empresaId);
    await crearCompra(proveedor.id, sede.id, 300, '2026-04-05', 'contado');
    const aCredito = await crearCompra(proveedor.id, sede.id, 100, '2026-04-06', 'credito');
    await crearPago(aCredito.id, usuario.id, 40, '2026-04-07');

    const ec = await comoEmpresa(empresaId, () =>
      estadoCuentaProveedor({ proveedorId: proveedor.id, desde: '2026-04-01', hasta: '2026-04-30' }),
    );

    expect(ec.resumen.compras).toBe(100); // la de contado no entra
    expect(ec.saldoFinal).toBe(60);
  });

  it('un pago CORREGIDO descuenta su importe corregido (no el original ni los dos)', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario, proveedor } = await base(empresaId);
    const compra = await crearCompra(proveedor.id, sede.id, 1000, '2026-04-01');
    const pago = await crearPago(compra.id, usuario.id, 500, '2026-04-05');

    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, {
        movimientoId: pago.id,
        motivo: 'se pagó de más',
        usuarioId: usuario.id,
        montoCorregido: 300,
      }),
    );

    const ec = await comoEmpresa(empresaId, () =>
      estadoCuentaProveedor({ proveedorId: proveedor.id, desde: '2026-04-01', hasta: '2026-04-30' }),
    );

    const movPago = ec.movimientos.find((m) => m.pagoId === pago.id)!;
    expect(movPago.tipo).toBe('correccion_pago');
    expect(movPago.estado).toBe('corregido');
    expect(movPago.credito).toBe(300); // NO 500, y NO 800 (sin doble descuento)
    expect(movPago.motivoCorreccion).toBe('se pagó de más');
    expect(movPago.registradoPor).toBe(usuario.nombre);

    expect(ec.resumen.pagos).toBe(300);
    expect(ec.resumen.correccionesAnulaciones).toBe(200); // 500 − 300
    expect(ec.saldoFinal).toBe(1000 - 300);
    // Solo dos movimientos: la compra y el pago. Los asientos NO son filas.
    expect(ec.movimientos).toHaveLength(2);
  });

  it('un pago ANULADO no descuenta nada y su fila sigue visible', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario, proveedor } = await base(empresaId);
    const compra = await crearCompra(proveedor.id, sede.id, 800, '2026-04-01');
    const pago = await crearPago(compra.id, usuario.id, 250, '2026-04-03');

    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, {
        movimientoId: pago.id, motivo: 'pago duplicado', usuarioId: usuario.id,
      }),
    );

    const ec = await comoEmpresa(empresaId, () =>
      estadoCuentaProveedor({ proveedorId: proveedor.id, desde: '2026-04-01', hasta: '2026-04-30' }),
    );

    const movPago = ec.movimientos.find((m) => m.pagoId === pago.id)!;
    expect(movPago.tipo).toBe('anulacion_pago');
    expect(movPago.estado).toBe('anulado');
    expect(movPago.credito).toBe(0);
    expect(movPago.motivoCorreccion).toBe('pago duplicado');
    expect(ec.resumen.pagos).toBe(0);
    expect(ec.saldoFinal).toBe(800); // el pago anulado NO redujo la deuda
  });

  it('las correcciones de pagos ANTERIORES al período afectan al saldo inicial', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario, proveedor } = await base(empresaId);
    const compra = await crearCompra(proveedor.id, sede.id, 1000, '2026-02-01');
    const pago = await crearPago(compra.id, usuario.id, 600, '2026-02-10');

    // Ese pago viejo se anula → la deuda previa vuelve a ser 1000, no 400.
    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, {
        movimientoId: pago.id, motivo: 'nunca se pagó', usuarioId: usuario.id,
      }),
    );

    const ec = await comoEmpresa(empresaId, () =>
      estadoCuentaProveedor({ proveedorId: proveedor.id, desde: '2026-04-01', hasta: '2026-04-30' }),
    );

    expect(ec.saldoInicial).toBe(1000);
    expect(ec.movimientos).toHaveLength(0); // sin movimientos en el período…
    expect(ec.saldoFinal).toBe(1000); // …pero el saldo se conserva
  });

  it('rechaza un rango invertido (400 de validación)', async () => {
    const empresaId = await crearEmpresa();
    const { proveedor } = await base(empresaId);
    await expect(
      comoEmpresa(empresaId, () =>
        estadoCuentaProveedor({
          proveedorId: proveedor.id, desde: '2026-05-10', hasta: '2026-05-01',
        }),
      ),
    ).rejects.toThrow(/desde/i);
  });
});

describe('GET /cuentas-por-pagar/estado-cuenta (HTTP)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-estado-cuenta';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('un proveedor de OTRA empresa no es accesible (404, sin filtrar su existencia)', async () => {
    const empresaA = await crearEmpresa();
    const empresaB = await crearEmpresa();
    const a = await base(empresaA);
    const b = await base(empresaB);
    await crearCompra(b.proveedor.id, b.sede.id, 999, '2026-04-01');

    const token = app.jwt.sign({
      sub: a.usuario.id, rol: 'administrador', empresaId: empresaA, esSuperAdmin: false,
    });

    const res = await app.inject({
      method: 'GET',
      url: `/cuentas-por-pagar/estado-cuenta?proveedorId=${b.proveedor.id}&desde=2026-04-01&hasta=2026-04-30`,
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(404);
    expect(res.body).not.toContain('999');
  });

  it('el EMPLEADO puede LEER el estado de cuenta, pero la ruta no le da ninguna escritura', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario, proveedor } = await base(empresaId);
    await crearCompra(proveedor.id, sede.id, 120, '2026-04-02');

    const token = app.jwt.sign({
      sub: usuario.id, rol: 'empleado', empresaId, esSuperAdmin: false,
    });

    const lectura = await app.inject({
      method: 'GET',
      url: `/cuentas-por-pagar/estado-cuenta?proveedorId=${proveedor.id}&desde=2026-04-01&hasta=2026-04-30`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(lectura.statusCode).toBe(200);
    expect(lectura.json().saldoFinal).toBe(120);

    // La ruta es de solo lectura: no existe POST/PUT sobre ella.
    const escritura = await app.inject({
      method: 'POST',
      url: '/cuentas-por-pagar/estado-cuenta',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(escritura.statusCode).toBe(404);

    // Y el empleado sigue SIN poder corregir dinero (guard de POST /correcciones).
    const correccion = await app.inject({
      method: 'POST',
      url: '/correcciones',
      headers: { authorization: `Bearer ${token}` },
      payload: { entidad: 'pago', movimientoId: proveedor.id, motivo: 'x' },
    });
    expect(correccion.statusCode).toBe(403);
  });

  it('faltan parámetros obligatorios → 400', async () => {
    const empresaId = await crearEmpresa();
    const { usuario } = await base(empresaId);
    const token = app.jwt.sign({
      sub: usuario.id, rol: 'administrador', empresaId, esSuperAdmin: false,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/cuentas-por-pagar/estado-cuenta?desde=2026-04-01&hasta=2026-04-30',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
