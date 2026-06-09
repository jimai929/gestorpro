import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/core/prisma.js';
import { registrarGasto } from '../../src/finanzas/gastos/gastos.service.js';
import { ErrorValidacion } from '../../src/core/errors.js';

let contador = 0;

async function nuevaSede() {
  contador += 1;
  return prisma.sede.create({ data: { nombre: `SedeGasto ${contador}` } });
}

async function nuevoUsuario() {
  contador += 1;
  return prisma.usuario.create({
    data: {
      nombre: 'Usuario Gasto',
      email: `gasto${contador}@gestorpro.local`,
      rol: 'administrador',
      passwordHash: 'x',
    },
  });
}

async function nuevaCategoria(esPagoEmpleado: boolean) {
  contador += 1;
  return prisma.categoriaGasto.create({
    data: {
      nombre: `Categoria ${esPagoEmpleado ? 'empleado' : 'operativa'} ${contador}`,
      esPagoEmpleado,
    },
  });
}

/** Ejecuta la promesa y devuelve el error que lanza (o null si no lanzó). */
async function capturarError(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
    return null;
  } catch (error) {
    return error;
  }
}

describe('registrarGasto: validaciones de monto y coherencia de empleado', () => {
  it('rechaza un gasto con monto cero (el camino del cobro no pasa por el schema de la ruta)', async () => {
    const sede = await nuevaSede();
    const usuario = await nuevoUsuario();
    const categoria = await nuevaCategoria(false);

    const error = await capturarError(
      registrarGasto({
        categoriaId: categoria.id, sedeId: sede.id, monto: 0,
        fechaOperacion: '2026-05-17', usuarioId: usuario.id,
      }),
    );
    expect(error).toBeInstanceOf(ErrorValidacion);
    expect((error as Error).message).toMatch(/mayor que cero/);
    // La transacción abortó antes del create: no se registró ningún gasto.
    expect(await prisma.gasto.count({ where: { sedeId: sede.id } })).toBe(0);
  });

  it('rechaza un gasto con monto negativo', async () => {
    const sede = await nuevaSede();
    const usuario = await nuevoUsuario();
    const categoria = await nuevaCategoria(false);

    await expect(
      registrarGasto({
        categoriaId: categoria.id, sedeId: sede.id, monto: -10,
        fechaOperacion: '2026-05-17', usuarioId: usuario.id,
      }),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    expect(await prisma.gasto.count({ where: { sedeId: sede.id } })).toBe(0);
  });

  it('rechaza un gasto de categoría de pago a empleado SIN empleadoId', async () => {
    const sede = await nuevaSede();
    const usuario = await nuevoUsuario();
    const categoria = await nuevaCategoria(true);

    const error = await capturarError(
      registrarGasto({
        categoriaId: categoria.id, sedeId: sede.id, monto: 100,
        fechaOperacion: '2026-05-17', usuarioId: usuario.id,
      }),
    );
    expect(error).toBeInstanceOf(ErrorValidacion);
    expect((error as Error).message).toMatch(/empleadoId/);
  });

  it('rechaza un gasto de categoría NO de empleado que trae empleadoId o tipoPago', async () => {
    const sede = await nuevaSede();
    const usuario = await nuevoUsuario();
    const categoria = await nuevaCategoria(false);
    const base = {
      categoriaId: categoria.id, sedeId: sede.id, monto: 100,
      fechaOperacion: '2026-05-18', usuarioId: usuario.id,
    };

    const conEmpleado = await capturarError(
      registrarGasto({ ...base, empleadoId: '00000000-0000-0000-0000-000000000001' }),
    );
    expect(conEmpleado).toBeInstanceOf(ErrorValidacion);
    expect((conEmpleado as Error).message).toMatch(/no debe llevar/);

    const conTipoPago = await capturarError(registrarGasto({ ...base, tipoPago: 'efectivo' }));
    expect(conTipoPago).toBeInstanceOf(ErrorValidacion);
    expect((conTipoPago as Error).message).toMatch(/no debe llevar/);
  });

  it('rechaza un gasto con categoriaId inexistente', async () => {
    const sede = await nuevaSede();
    const usuario = await nuevoUsuario();

    const error = await capturarError(
      registrarGasto({
        categoriaId: '00000000-0000-0000-0000-000000000000', sedeId: sede.id, monto: 50,
        fechaOperacion: '2026-05-18', usuarioId: usuario.id,
      }),
    );
    expect(error).toBeInstanceOf(ErrorValidacion);
    expect((error as Error).message).toMatch(/no existe/);
    expect(await prisma.gasto.count({ where: { sedeId: sede.id } })).toBe(0);
  });
});
