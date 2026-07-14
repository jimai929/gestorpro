/**
 * Historial de pagos a proveedor (GET /cuentas-por-pagar/pagos).
 *
 * Cubre lo que la UI consume: estado de corrección por pago, monto vigente,
 * filtros (proveedor / fecha / estado), paginación, resumen sobre TODO el
 * conjunto filtrado (no solo la página) y aislamiento entre empresas.
 *
 * CONVENCIÓN RLS: los fixtures se siembran con `semilla()` (bypass); las
 * aserciones POSITIVAS se leen bajo `comoEmpresa()` (rol app + GUC + RLS).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, comoEmpresa, crearEmpresa } from '../helpers/db.js';
import { listarPagos } from '../../src/finanzas/cuentas-por-pagar/cuentas-por-pagar.service.js';
import { corregirMovimiento } from '../../src/shared/services/correccion.service.js';
import { adaptadorPago } from '../../src/finanzas/cuentas-por-pagar/pago.correccion.js';

let contador = 0;

/** Sede + usuario + proveedor + compra de 1000, con `n` pagos del monto dado. */
async function escenario(empresaId: string, montos: number[]) {
  contador += 1;
  const sede = await semilla().sede.create({ data: { nombre: `SedeHP ${contador}`, empresaId } });
  const usuario = await semilla().usuario.create({
    data: {
      nombre: `Cajero ${contador}`,
      email: `hp${contador}@gestorpro.local`,
      rol: 'administrador',
      passwordHash: 'x',
    },
  });
  const proveedor = await semilla().proveedor.create({
    data: { nombre: `Proveedor HP ${contador}`, empresaId },
  });
  const compra = await semilla().compra.create({
    data: {
      proveedorId: proveedor.id,
      sedeId: sede.id,
      numeroFactura: `FHP-${contador}`,
      montoTotal: 5000,
      fechaEmision: new Date('2026-05-01'),
      fechaVencimiento: new Date('2026-06-01'),
    },
  });
  const pagos = [];
  for (let i = 0; i < montos.length; i += 1) {
    pagos.push(
      await semilla().pagoProveedor.create({
        data: {
          compraId: compra.id,
          monto: montos[i]!,
          // Fechas distintas por pago: permiten probar el orden y el filtro de rango.
          fechaPago: new Date(`2026-05-${String(10 + i).padStart(2, '0')}`),
          tipo: 'normal',
          usuarioId: usuario.id,
        },
      }),
    );
  }
  return { sede, usuario, proveedor, compra, pagos };
}

describe('historial de pagos: estado, monto vigente y resumen', () => {
  it('anota vigente / corregido / anulado y el resumen cubre TODO el filtro', async () => {
    const empresaId = await crearEmpresa();
    const { usuario, proveedor, pagos } = await escenario(empresaId, [100, 200, 300]);
    const [vigente, aCorregir, aAnular] = pagos;

    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, {
        movimientoId: aCorregir!.id,
        motivo: 'se pagó de más',
        usuarioId: usuario.id,
        montoCorregido: 50,
      }),
    );
    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, {
        movimientoId: aAnular!.id,
        motivo: 'pago duplicado',
        usuarioId: usuario.id,
      }),
    );

    const res = await comoEmpresa(empresaId, () => listarPagos({}));

    // Solo los movimientos NORMAL son filas: los asientos cuelgan de ellos.
    expect(res.pagos).toHaveLength(3);
    const porId = new Map(res.pagos.map((p) => [p.id, p]));

    expect(porId.get(vigente!.id)?.estado).toBe('vigente');
    expect(porId.get(vigente!.id)?.montoVigente).toBe(100);

    // El original es INMUTABLE: `monto` sigue siendo 200 y el vigente es el corregido.
    expect(porId.get(aCorregir!.id)?.estado).toBe('corregido');
    expect(porId.get(aCorregir!.id)?.monto).toBe(200);
    expect(porId.get(aCorregir!.id)?.montoVigente).toBe(50);
    expect(porId.get(aCorregir!.id)?.motivoCorreccion).toBe('se pagó de más');

    expect(porId.get(aAnular!.id)?.estado).toBe('anulado');
    expect(porId.get(aAnular!.id)?.monto).toBe(300);
    expect(porId.get(aAnular!.id)?.montoVigente).toBe(0);

    // Datos de presentación (sin empresaId).
    expect(porId.get(vigente!.id)?.proveedorNombre).toBe(proveedor.nombre);
    expect(porId.get(vigente!.id)?.registradoPor).toBe(usuario.nombre);
    expect(porId.get(vigente!.id)).not.toHaveProperty('empresaId');

    // Resumen: 600 registrado, 150 vigente (100 + 50 + 0), 450 corregido/anulado.
    expect(res.resumen).toEqual({ cantidad: 3, totalOriginal: 600, totalVigente: 150, diferencia: 450 });

    // Orden por fecha de pago descendente.
    expect(res.pagos.map((p) => p.id)).toEqual([aAnular!.id, aCorregir!.id, vigente!.id]);
  });

  it('filtra por estado, por proveedor y por rango de fechas', async () => {
    const empresaId = await crearEmpresa();
    const { usuario, proveedor, pagos } = await escenario(empresaId, [100, 200]);
    const otro = await escenario(empresaId, [900]);

    await comoEmpresa(empresaId, () =>
      corregirMovimiento(adaptadorPago, {
        movimientoId: pagos[1]!.id, motivo: 'anulado', usuarioId: usuario.id,
      }),
    );

    const anulados = await comoEmpresa(empresaId, () => listarPagos({ estado: 'anulado' }));
    expect(anulados.pagos.map((p) => p.id)).toEqual([pagos[1]!.id]);
    expect(anulados.resumen).toEqual({
      cantidad: 1, totalOriginal: 200, totalVigente: 0, diferencia: 200,
    });

    const vigentes = await comoEmpresa(empresaId, () => listarPagos({ estado: 'vigente' }));
    expect(vigentes.pagos).toHaveLength(2); // el de 100 y el del otro proveedor

    const delProveedor = await comoEmpresa(empresaId, () =>
      listarPagos({ proveedorId: proveedor.id }),
    );
    expect(delProveedor.pagos).toHaveLength(2);
    expect(delProveedor.pagos.every((p) => p.proveedorId === proveedor.id)).toBe(true);
    expect(delProveedor.pagos.some((p) => p.id === otro.pagos[0]!.id)).toBe(false);

    // Rango que solo alcanza el primer pago (2026-05-10).
    const rango = await comoEmpresa(empresaId, () =>
      listarPagos({ proveedorId: proveedor.id, desde: '2026-05-09', hasta: '2026-05-10' }),
    );
    expect(rango.pagos.map((p) => p.id)).toEqual([pagos[0]!.id]);
    expect(rango.resumen.totalOriginal).toBe(100);
  });

  it('pagina y el resumen sigue siendo el del conjunto completo, no el de la página', async () => {
    const empresaId = await crearEmpresa();
    await escenario(empresaId, [10, 20, 30, 40, 50]);

    const pagina1 = await comoEmpresa(empresaId, () => listarPagos({ pagina: 1, tamano: 2 }));
    expect(pagina1.pagos).toHaveLength(2);
    expect(pagina1.paginacion).toEqual({ pagina: 1, tamano: 2, total: 5, paginas: 3 });
    // El resumen NO es el de la página (10+20): es el de los 5 pagos.
    expect(pagina1.resumen.cantidad).toBe(5);
    expect(pagina1.resumen.totalOriginal).toBe(150);
    expect(pagina1.resumen.totalVigente).toBe(150);

    const pagina3 = await comoEmpresa(empresaId, () => listarPagos({ pagina: 3, tamano: 2 }));
    expect(pagina3.pagos).toHaveLength(1);
    expect(pagina3.resumen.totalOriginal).toBe(150);
  });
});

describe('GET /cuentas-por-pagar/pagos (HTTP)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-historial-pagos';
    app = construirApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('devuelve solo los pagos de la empresa del token (aislamiento entre tenants)', async () => {
    const empresaA = await crearEmpresa();
    const empresaB = await crearEmpresa();
    const a = await escenario(empresaA, [111]);
    await escenario(empresaB, [999]);

    const token = app.jwt.sign({
      sub: a.usuario.id, rol: 'administrador', empresaId: empresaA, esSuperAdmin: false,
    });

    const res = await app.inject({
      method: 'GET',
      url: '/cuentas-por-pagar/pagos',
      headers: { authorization: `Bearer ${token}` },
    });

    expect(res.statusCode).toBe(200);
    const cuerpo = res.json();
    expect(cuerpo.pagos).toHaveLength(1);
    expect(cuerpo.pagos[0].monto).toBe(111);
    // Ni un solo dato de la empresa B (ni siquiera en el resumen).
    expect(cuerpo.resumen.totalOriginal).toBe(111);
    expect(JSON.stringify(cuerpo)).not.toContain('999');
  });

  it('sin token → 401; con estado inválido → 400', async () => {
    const sinToken = await app.inject({ method: 'GET', url: '/cuentas-por-pagar/pagos' });
    expect(sinToken.statusCode).toBe(401);

    const empresaId = await crearEmpresa();
    const { usuario } = await escenario(empresaId, [10]);
    const token = app.jwt.sign({
      sub: usuario.id, rol: 'empleado', empresaId, esSuperAdmin: false,
    });

    const invalido = await app.inject({
      method: 'GET',
      url: '/cuentas-por-pagar/pagos?estado=inventado',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(invalido.statusCode).toBe(400);

    // El EMPLEADO sí puede LEER el historial (corregir es otra ruta: POST /correcciones).
    const lectura = await app.inject({
      method: 'GET',
      url: '/cuentas-por-pagar/pagos',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(lectura.statusCode).toBe(200);
    expect(lectura.json().pagos).toHaveLength(1);
  });
});
