/**
 * Centro de auditoría de correcciones financieras
 * (GET /finanzas/auditoria-correcciones).
 *
 * Prueba que las correcciones de las TRES entidades (gasto, venta, pago) aparezcan
 * unificadas, que se distingan corrección y anulación, que los montos (original,
 * vigente, diferencia) sean correctos, que el resumen cubra el filtro COMPLETO (no
 * la página), que los filtros funcionen, que un empleado reciba 403 y que no se
 * filtren datos de otra empresa.
 *
 * CONVENCIÓN RLS: fixtures con `semilla()` (bypass); aserciones POSITIVAS bajo
 * `comoEmpresa()` (rol app + GUC + RLS).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, comoEmpresa, crearEmpresa } from '../helpers/db.js';
import { auditoriaCorrecciones } from '../../src/finanzas/auditoria/auditoria-correcciones.service.js';
import { corregirMovimiento } from '../../src/shared/services/correccion.service.js';
import { adaptadorGasto } from '../../src/finanzas/gastos/gasto.correccion.js';
import { adaptadorVenta } from '../../src/finanzas/dashboard/venta.correccion.js';
import { adaptadorPago } from '../../src/finanzas/cuentas-por-pagar/pago.correccion.js';

let contador = 0;

async function base(empresaId: string) {
  contador += 1;
  const sede = await semilla().sede.create({ data: { nombre: `SedeAud ${contador}`, empresaId } });
  const usuario = await semilla().usuario.create({
    data: {
      nombre: `Auditor ${contador}`,
      email: `aud${contador}@gestorpro.local`,
      rol: 'administrador',
      passwordHash: 'x',
    },
  });
  return { sede, usuario };
}

/** Gasto normal listo para corregir. */
async function crearGasto(empresaId: string, sedeId: string, usuarioId: string, monto: number) {
  contador += 1;
  const categoria = await semilla().categoriaGasto.create({
    data: { nombre: `CatAud ${contador}`, empresaId },
  });
  return semilla().gasto.create({
    data: {
      categoriaId: categoria.id,
      sedeId,
      monto,
      fechaOperacion: new Date('2026-04-10'),
      descripcion: `Gasto ${contador}`,
      tipo: 'normal',
      usuarioId,
    },
  });
}

async function crearVenta(sedeId: string, usuarioId: string) {
  return semilla().ventaDiaria.create({
    data: {
      sedeId,
      fechaOperacion: new Date('2026-04-11'),
      turno: 'manana',
      cajera: 'E001 - Cajero',
      cerradoPor: 'E004 - Verificador',
      monto: 1000,
      tipo: 'normal',
      usuarioId,
      detalles: { create: [{ tipoArqueo: 'efectivo', monto: 600 }, { tipoArqueo: 'tarjeta', monto: 400 }] },
    },
  });
}

async function crearPago(empresaId: string, sedeId: string, usuarioId: string, monto: number) {
  contador += 1;
  const proveedor = await semilla().proveedor.create({
    data: { nombre: `ProvAud ${contador}`, empresaId },
  });
  const compra = await semilla().compra.create({
    data: {
      proveedorId: proveedor.id,
      sedeId,
      numeroFactura: `FAUD-${contador}`,
      montoTotal: 5000,
      fechaEmision: new Date('2026-04-01'),
      fechaVencimiento: new Date('2026-05-01'),
    },
  });
  return semilla().pagoProveedor.create({
    data: { compraId: compra.id, monto, fechaPago: new Date('2026-04-12'), tipo: 'normal', usuarioId },
  });
}

describe('auditoría de correcciones: unifica las tres entidades', () => {
  it('un gasto corregido, un cierre anulado y un pago corregido aparecen en la lista', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario } = await base(empresaId);

    const gasto = await crearGasto(empresaId, sede.id, usuario.id, 150);
    const venta = await crearVenta(sede.id, usuario.id);
    const pago = await crearPago(empresaId, sede.id, usuario.id, 500);

    // Gasto: corrección de monto 150 → 15.
    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorGasto, {
        movimientoId: gasto.id, motivo: 'se tecleó 150 en vez de 15', usuarioId: usuario.id, montoCorregido: 15,
      }),
    );
    // Venta: anulación pura.
    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorVenta, {
        movimientoId: venta.id, motivo: 'cierre mal tecleado', usuarioId: usuario.id,
      }),
    );
    // Pago: corrección de monto 500 → 300.
    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, {
        movimientoId: pago.id, motivo: 'se pagó de más', usuarioId: usuario.id, montoCorregido: 300,
      }),
    );

    const res = await comoEmpresa(empresaId, () => auditoriaCorrecciones({}));

    expect(res.registros).toHaveLength(3);
    const porEntidad = new Map(res.registros.map((r) => [r.entidad, r]));

    // GASTO: corrección, montos y diferencia.
    const g = porEntidad.get('gasto')!;
    expect(g.accion).toBe('correccion');
    expect(g.montoOriginal).toBe(150);
    expect(g.montoVigente).toBe(15);
    expect(g.diferencia).toBe(135);
    expect(g.motivo).toBe('se tecleó 150 en vez de 15');
    expect(g.registradoPor.nombre).toBe(usuario.nombre);
    expect(g.correccionId).not.toBeNull();
    expect(g.registroOriginalId).toBe(gasto.id);
    if (g.detalleEntidad.entidad === 'gasto') {
      expect(g.detalleEntidad.categoria).toContain('CatAud');
    }

    // VENTA: anulación → vigente 0, sin correccionId, arqueo vigente vacío.
    const v = porEntidad.get('venta')!;
    expect(v.accion).toBe('anulacion');
    expect(v.montoOriginal).toBe(1000);
    expect(v.montoVigente).toBe(0);
    expect(v.diferencia).toBe(1000);
    expect(v.correccionId).toBeNull();
    if (v.detalleEntidad.entidad === 'venta') {
      expect(v.detalleEntidad.arqueoOriginal.reduce((a, d) => a + d.monto, 0)).toBe(1000);
      expect(v.detalleEntidad.arqueoVigente).toHaveLength(0);
    }

    // PAGO: corrección 500 → 300.
    const p = porEntidad.get('pago')!;
    expect(p.accion).toBe('correccion');
    expect(p.montoOriginal).toBe(500);
    expect(p.montoVigente).toBe(300);
    expect(p.diferencia).toBe(200);
    if (p.detalleEntidad.entidad === 'pago') {
      expect(p.detalleEntidad.numeroFactura).toContain('FAUD');
    }

    // Resumen sobre el conjunto COMPLETO.
    expect(res.resumen.total).toBe(3);
    expect(res.resumen.correcciones).toBe(2);
    expect(res.resumen.anulaciones).toBe(1);
    expect(res.resumen.gastos).toBe(1);
    expect(res.resumen.ventas).toBe(1);
    expect(res.resumen.pagos).toBe(1);
    expect(res.resumen.usuarios).toBe(1);
    expect(res.resumen.totalOriginal).toBe(1650); // 150 + 1000 + 500
    expect(res.resumen.totalVigente).toBe(315); // 15 + 0 + 300
    expect(res.resumen.diferenciaNeta).toBe(1335);

    // Nunca se filtra empresaId.
    expect(JSON.stringify(res)).not.toContain('empresaId');
  });

  it('filtra por entidad, por acción y por texto; el resumen se recalcula sobre el filtro', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario } = await base(empresaId);
    const gasto = await crearGasto(empresaId, sede.id, usuario.id, 100);
    const pago = await crearPago(empresaId, sede.id, usuario.id, 200);

    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorGasto, {
        movimientoId: gasto.id, motivo: 'error de tecleo', usuarioId: usuario.id, montoCorregido: 40,
      }),
    );
    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, {
        movimientoId: pago.id, motivo: 'proveedor equivocado', usuarioId: usuario.id,
      }),
    );

    // Solo pagos.
    const soloPagos = await comoEmpresa(empresaId, () => auditoriaCorrecciones({ entidad: 'pago' }));
    expect(soloPagos.registros).toHaveLength(1);
    expect(soloPagos.registros[0]!.entidad).toBe('pago');
    expect(soloPagos.resumen.total).toBe(1);

    // Solo anulaciones.
    const soloAnul = await comoEmpresa(empresaId, () => auditoriaCorrecciones({ accion: 'anulacion' }));
    expect(soloAnul.registros).toHaveLength(1);
    expect(soloAnul.registros[0]!.accion).toBe('anulacion');

    // Texto en el motivo.
    const porTexto = await comoEmpresa(empresaId, () => auditoriaCorrecciones({ texto: 'proveedor' }));
    expect(porTexto.registros).toHaveLength(1);
    expect(porTexto.registros[0]!.entidad).toBe('pago');
  });

  it('pagina y el resumen sigue siendo el del conjunto completo', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario } = await base(empresaId);
    for (let i = 0; i < 5; i += 1) {
      const g = await crearGasto(empresaId, sede.id, usuario.id, 100 + i);
      await comoEmpresa(empresaId, () =>
        corregirMovimiento(adaptadorGasto, {
          movimientoId: g.id, motivo: `motivo ${i}`, usuarioId: usuario.id, montoCorregido: 10,
        }),
      );
    }

    const p1 = await comoEmpresa(empresaId, () => auditoriaCorrecciones({ pagina: 1, tamano: 2 }));
    expect(p1.registros).toHaveLength(2);
    expect(p1.paginacion).toEqual({ pagina: 1, tamano: 2, total: 5, paginas: 3 });
    expect(p1.resumen.total).toBe(5); // NO 2
  });

  it('el filtro por usuario solo trae las correcciones de ese usuario', async () => {
    const empresaId = await crearEmpresa();
    const { sede, usuario } = await base(empresaId);
    const otro = await semilla().usuario.create({
      data: { nombre: 'Otro Admin', email: `otro${(contador += 1)}@gestorpro.local`, rol: 'administrador', passwordHash: 'x' },
    });
    const g1 = await crearGasto(empresaId, sede.id, usuario.id, 100);
    const g2 = await crearGasto(empresaId, sede.id, usuario.id, 200);
    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorGasto, { movimientoId: g1.id, motivo: 'a', usuarioId: usuario.id, montoCorregido: 10 }),
    );
    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorGasto, { movimientoId: g2.id, motivo: 'b', usuarioId: otro.id, montoCorregido: 20 }),
    );

    const delOtro = await comoEmpresa(empresaId, () => auditoriaCorrecciones({ usuarioId: otro.id }));
    expect(delOtro.registros).toHaveLength(1);
    expect(delOtro.registros[0]!.registradoPor.id).toBe(otro.id);
    expect(delOtro.registros[0]!.registradoPor.nombre).toBe('Otro Admin');
  });
});

describe('GET /finanzas/auditoria-correcciones (HTTP)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-auditoria';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('un empleado recibe 403 (guard soloGestion)', async () => {
    const empresaId = await crearEmpresa();
    const { usuario } = await base(empresaId);
    const token = app.jwt.sign({ sub: usuario.id, rol: 'empleado', empresaId, esSuperAdmin: false });

    const res = await app.inject({
      method: 'GET',
      url: '/finanzas/auditoria-correcciones',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(403);
  });

  it('no se ven correcciones de otra empresa (aislamiento por tenant)', async () => {
    const empresaA = await crearEmpresa();
    const empresaB = await crearEmpresa();
    const a = await base(empresaA);
    const b = await base(empresaB);

    // La empresa B corrige un gasto de 999.
    const gastoB = await crearGasto(empresaB, b.sede.id, b.usuario.id, 999);
    await comoEmpresa(empresaB, () =>
      corregirMovimiento(adaptadorGasto, {
        movimientoId: gastoB.id, motivo: 'de la empresa B', usuarioId: b.usuario.id, montoCorregido: 1,
      }),
    );

    const token = app.jwt.sign({ sub: a.usuario.id, rol: 'administrador', empresaId: empresaA, esSuperAdmin: false });
    const res = await app.inject({
      method: 'GET',
      url: '/finanzas/auditoria-correcciones',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = res.json();
    expect(cuerpo.registros).toHaveLength(0);
    expect(cuerpo.resumen.total).toBe(0);
    expect(res.body).not.toContain('999');
    expect(res.body).not.toContain('de la empresa B');
  });

  it('rango de fechas invertido → 400', async () => {
    const empresaId = await crearEmpresa();
    const { usuario } = await base(empresaId);
    const token = app.jwt.sign({ sub: usuario.id, rol: 'administrador', empresaId, esSuperAdmin: false });

    const res = await app.inject({
      method: 'GET',
      url: '/finanzas/auditoria-correcciones?desde=2026-05-10&hasta=2026-05-01',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(400);
  });
});
