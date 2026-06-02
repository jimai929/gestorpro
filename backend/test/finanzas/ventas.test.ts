import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/core/prisma.js';
import { registrarVenta, listarVentas, listarCajeras } from '../../src/finanzas/dashboard/ventas.service.js';
import { gananciaDelPeriodo } from '../../src/finanzas/dashboard/dashboard.service.js';
import { corregirMovimiento } from '../../src/shared/services/correccion.service.js';
import { adaptadorVenta } from '../../src/finanzas/dashboard/venta.correccion.js';
import { ErrorConflicto, ErrorValidacion } from '../../src/core/errors.js';

let contador = 0;

/** Crea una sede y un usuario nuevos para aislar cada escenario. */
async function nuevoEscenario() {
  contador += 1;
  const sede = await prisma.sede.create({ data: { nombre: `SedeVT ${contador}` } });
  const usuario = await prisma.usuario.create({
    data: { nombre: 'T', email: `vt${contador}@gestorpro.local`, rol: 'administrador', passwordHash: 'x' },
  });
  return { sede, usuario };
}

describe('cierre de caja con arqueo (registro y unicidad)', () => {
  it('registra varios cierres del mismo día con (cajera, turno) distintos; el total es la suma del arqueo', async () => {
    const { sede, usuario } = await nuevoEscenario();
    const comun = { sedeId: sede.id, fechaOperacion: '2026-04-01', usuarioId: usuario.id };

    const c1 = await registrarVenta({
      ...comun, turno: 'manana', cajera: '1', cerradoPor: 'A',
      detalles: [{ tipoArqueo: 'efectivo', monto: 100 }, { tipoArqueo: 'tarjeta', monto: 50 }],
    });
    const c2 = await registrarVenta({
      ...comun, turno: 'tarde', cajera: '1', cerradoPor: 'B',
      detalles: [{ tipoArqueo: 'efectivo', monto: 200 }],
    });
    const c3 = await registrarVenta({
      ...comun, turno: 'manana', cajera: '2', cerradoPor: 'C',
      detalles: [{ tipoArqueo: 'yappy', monto: 75 }, { tipoArqueo: 'loteria', monto: 25 }],
    });

    expect(c1.monto).toBe(150);
    expect(c1.detalles).toHaveLength(2);
    expect(c2.monto).toBe(200);
    expect(c3.monto).toBe(100);

    const total = await prisma.ventaDiaria.count({ where: { sedeId: sede.id, tipo: 'normal' } });
    expect(total).toBe(3);
  });

  it('rechaza un segundo cierre normal con la misma (sede, fecha, turno, cajera)', async () => {
    const { sede, usuario } = await nuevoEscenario();
    const comun = { sedeId: sede.id, fechaOperacion: '2026-04-02', usuarioId: usuario.id };

    await registrarVenta({
      ...comun, turno: 'noche', cajera: '1', cerradoPor: 'A',
      detalles: [{ tipoArqueo: 'efectivo', monto: 100 }],
    });
    await expect(
      registrarVenta({
        ...comun, turno: 'noche', cajera: '1', cerradoPor: 'B',
        detalles: [{ tipoArqueo: 'efectivo', monto: 120 }],
      }),
    ).rejects.toBeInstanceOf(ErrorConflicto);
  });

  it('permite la misma cajera y turno en fechas distintas', async () => {
    const { sede, usuario } = await nuevoEscenario();
    const comun = {
      sedeId: sede.id, turno: 'manana' as const, cajera: '1', cerradoPor: 'A', usuarioId: usuario.id,
      detalles: [{ tipoArqueo: 'efectivo' as const, monto: 100 }],
    };
    await registrarVenta({ ...comun, fechaOperacion: '2026-04-03' });
    await expect(registrarVenta({ ...comun, fechaOperacion: '2026-04-04' })).resolves.toBeTruthy();
  });

  it('rechaza arqueo vacío, con línea negativa o con tipo repetido', async () => {
    const { sede, usuario } = await nuevoEscenario();
    const comun = { sedeId: sede.id, fechaOperacion: '2026-04-05', turno: 'manana' as const, cajera: '1', cerradoPor: 'A', usuarioId: usuario.id };

    await expect(registrarVenta({ ...comun, detalles: [] })).rejects.toBeInstanceOf(ErrorValidacion);
    await expect(
      registrarVenta({ ...comun, detalles: [{ tipoArqueo: 'efectivo', monto: -1 }] }),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    await expect(
      registrarVenta({
        ...comun,
        detalles: [{ tipoArqueo: 'efectivo', monto: 10 }, { tipoArqueo: 'efectivo', monto: 5 }],
      }),
    ).rejects.toBeInstanceOf(ErrorValidacion);
  });
});

describe('listado y dashboard de cierres', () => {
  it('lista los cierres filtrando por cajera y por turno', async () => {
    const { sede, usuario } = await nuevoEscenario();
    const comun = { sedeId: sede.id, fechaOperacion: '2026-04-06', usuarioId: usuario.id };

    await registrarVenta({ ...comun, turno: 'manana', cajera: '1', cerradoPor: 'A', detalles: [{ tipoArqueo: 'efectivo', monto: 100 }] });
    await registrarVenta({ ...comun, turno: 'tarde', cajera: '1', cerradoPor: 'B', detalles: [{ tipoArqueo: 'efectivo', monto: 200 }] });
    await registrarVenta({ ...comun, turno: 'manana', cajera: '2', cerradoPor: 'C', detalles: [{ tipoArqueo: 'efectivo', monto: 300 }] });

    const rango = { desde: '2026-04-06', hasta: '2026-04-06', sedeId: sede.id };
    expect(await listarVentas({ ...rango, cajera: '1' })).toHaveLength(2);
    expect(await listarVentas({ ...rango, turno: 'manana' })).toHaveLength(2);

    const caja2Manana = await listarVentas({ ...rango, cajera: '2', turno: 'manana' });
    expect(caja2Manana).toHaveLength(1);
    expect(caja2Manana[0]?.detalles).toHaveLength(1);
  });

  it('la ganancia suma el total de los cierres del período y se filtra por cajera/turno', async () => {
    const { sede, usuario } = await nuevoEscenario();
    const comun = { sedeId: sede.id, fechaOperacion: '2026-04-07', usuarioId: usuario.id };

    await registrarVenta({
      ...comun, turno: 'manana', cajera: '1', cerradoPor: 'A',
      detalles: [{ tipoArqueo: 'efectivo', monto: 500 }, { tipoArqueo: 'tarjeta', monto: 500 }],
    });
    await registrarVenta({
      ...comun, turno: 'tarde', cajera: '1', cerradoPor: 'B',
      detalles: [{ tipoArqueo: 'efectivo', monto: 400 }],
    });

    const rango = { desde: '2026-04-07', hasta: '2026-04-07', sedeId: sede.id };
    const total = await gananciaDelPeriodo(rango);
    expect(total.ventas).toBe(1400);
    expect(total.ganancia).toBe(1400); // sin compras ni gastos en esta sede

    const soloTarde = await gananciaDelPeriodo({ ...rango, turno: 'tarde' });
    expect(soloTarde.ventas).toBe(400);
  });

  it('un reverso resta del total de ventas de la ganancia', async () => {
    const { sede, usuario } = await nuevoEscenario();
    const fecha = '2026-04-08';
    const cierre = await registrarVenta({
      sedeId: sede.id, fechaOperacion: fecha, turno: 'manana', cajera: '1', cerradoPor: 'A',
      usuarioId: usuario.id, detalles: [{ tipoArqueo: 'efectivo', monto: 1000 }],
    });

    const rango = { desde: fecha, hasta: fecha, sedeId: sede.id };
    expect((await gananciaDelPeriodo(rango)).ventas).toBe(1000);

    await corregirMovimiento(adaptadorVenta, {
      movimientoId: cierre.id, motivo: 'mal tecleado', usuarioId: usuario.id,
    });
    // 1000 normal − 1000 reverso = 0
    expect((await gananciaDelPeriodo(rango)).ventas).toBe(0);
  });

  it('corrección con arqueo corregido deja el neto en el total corregido', async () => {
    const { sede, usuario } = await nuevoEscenario();
    const fecha = '2026-04-09';
    const cierre = await registrarVenta({
      sedeId: sede.id, fechaOperacion: fecha, turno: 'manana', cajera: '1', cerradoPor: 'A',
      usuarioId: usuario.id, detalles: [{ tipoArqueo: 'efectivo', monto: 1000 }],
    });

    const res = await corregirMovimiento(adaptadorVenta, {
      movimientoId: cierre.id, motivo: 'arqueo corregido', usuarioId: usuario.id,
      detallesCorregidos: [{ tipoArqueo: 'efectivo', monto: 600 }, { tipoArqueo: 'tarjeta', monto: 200 }],
    });
    expect(res.correccion).not.toBeNull();

    const rango = { desde: fecha, hasta: fecha, sedeId: sede.id };
    // neto = 1000 normal − 1000 reverso + 800 corrección = 800
    expect((await gananciaDelPeriodo(rango)).ventas).toBe(800);

    const correccion = await prisma.ventaDiaria.findUnique({
      where: { id: res.correccion?.id }, include: { detalles: true },
    });
    expect(Number(correccion?.monto)).toBe(800);
    expect(correccion?.detalles).toHaveLength(2);
  });
});

describe('filtro de cajera: snapshot, case-insensitive y valores legacy', () => {
  it('guarda la cajera como SNAPSHOT string tal cual se envía ("E001 - Nombre")', async () => {
    const { sede, usuario } = await nuevoEscenario();
    const cierre = await registrarVenta({
      sedeId: sede.id, fechaOperacion: '2026-04-20', turno: 'manana',
      cajera: 'E001 - María Pérez', cerradoPor: 'E004 - Carlos Méndez',
      usuarioId: usuario.id, detalles: [{ tipoArqueo: 'efectivo', monto: 100 }],
    });
    expect(cierre.cajera).toBe('E001 - María Pérez');
    expect(cierre.cerradoPor).toBe('E004 - Carlos Méndez');
  });

  it('filtra por cajera CASE-INSENSITIVE, incluyendo legacy texto libre (yoany)', async () => {
    const { sede, usuario } = await nuevoEscenario();
    const comun = { sedeId: sede.id, fechaOperacion: '2026-04-21', usuarioId: usuario.id };
    await registrarVenta({ ...comun, turno: 'manana', cajera: 'yoany', cerradoPor: 'V', detalles: [{ tipoArqueo: 'efectivo', monto: 100 }] });
    await registrarVenta({ ...comun, turno: 'tarde', cajera: 'E002 - Luis Gómez', cerradoPor: 'V', detalles: [{ tipoArqueo: 'efectivo', monto: 200 }] });

    const rango = { desde: '2026-04-21', hasta: '2026-04-21', sedeId: sede.id };
    const porLegacy = await listarVentas({ ...rango, cajera: 'YOANY' }); // mayúsculas
    expect(porLegacy).toHaveLength(1);
    expect(porLegacy[0]?.cajera).toBe('yoany');
  });

  it('la ganancia del dashboard también filtra cajera case-insensitive (9 yon)', async () => {
    const { sede, usuario } = await nuevoEscenario();
    await registrarVenta({
      sedeId: sede.id, fechaOperacion: '2026-04-22', turno: 'manana',
      cajera: '9 yon', cerradoPor: 'V', usuarioId: usuario.id,
      detalles: [{ tipoArqueo: 'efectivo', monto: 300 }],
    });
    const rango = { desde: '2026-04-22', hasta: '2026-04-22', sedeId: sede.id };
    expect((await gananciaDelPeriodo({ ...rango, cajera: '9 YON' })).ventas).toBe(300);
  });

  it('trata _ y % como LITERALES en el filtro (no como comodines de LIKE/ILIKE)', async () => {
    const { sede, usuario } = await nuevoEscenario();
    const comun = {
      sedeId: sede.id, fechaOperacion: '2026-04-24', usuarioId: usuario.id,
      detalles: [{ tipoArqueo: 'efectivo' as const, monto: 10 }],
    };
    await registrarVenta({ ...comun, turno: 'manana', cajera: 'a_b', cerradoPor: 'V' });
    await registrarVenta({ ...comun, turno: 'tarde', cajera: 'aXb', cerradoPor: 'V' });

    const rango = { desde: '2026-04-24', hasta: '2026-04-24', sedeId: sede.id };
    const exacto = await listarVentas({ ...rango, cajera: 'a_b' });
    expect(exacto).toHaveLength(1); // el '_' NO debe comodinear y traer 'aXb'
    expect(exacto[0]?.cajera).toBe('a_b');
    // …y sigue siendo insensible a mayúsculas.
    expect(await listarVentas({ ...rango, cajera: 'A_B' })).toHaveLength(1);
  });

  it('listarCajeras devuelve los valores distintos presentes en los cierres', async () => {
    const { sede, usuario } = await nuevoEscenario();
    await registrarVenta({
      sedeId: sede.id, fechaOperacion: '2026-04-23', turno: 'noche',
      cajera: 'ZZZ Cajera Única', cerradoPor: 'V', usuarioId: usuario.id,
      detalles: [{ tipoArqueo: 'efectivo', monto: 50 }],
    });
    expect(await listarCajeras()).toContain('ZZZ Cajera Única');
  });
});
