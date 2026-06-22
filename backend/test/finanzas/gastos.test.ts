import { describe, it, expect } from 'vitest';
import { semilla, comoEmpresa, crearEmpresa } from '../helpers/db.js';
import { registrarGasto } from '../../src/finanzas/gastos/gastos.service.js';
import { ErrorValidacion } from '../../src/core/errors.js';

let contador = 0;

async function nuevaSede(empresaId: string) {
  contador += 1;
  return semilla().sede.create({ data: { nombre: `SedeGasto ${contador}`, empresaId } });
}

async function nuevoUsuario() {
  contador += 1;
  return semilla().usuario.create({
    data: {
      nombre: 'Usuario Gasto',
      email: `gasto${contador}@gestorpro.local`,
      rol: 'administrador',
      passwordHash: 'x',
    },
  });
}

async function nuevaCategoria(empresaId: string, esPagoEmpleado: boolean) {
  contador += 1;
  return semilla().categoriaGasto.create({
    data: {
      nombre: `Categoria ${esPagoEmpleado ? 'empleado' : 'operativa'} ${contador}`,
      esPagoEmpleado,
      empresaId,
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
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const usuario = await nuevoUsuario();
    const categoria = await nuevaCategoria(empresaId, false);

    const error = await capturarError(
      comoEmpresa(empresaId, () =>
        registrarGasto({
          categoriaId: categoria.id, sedeId: sede.id, monto: 0,
          fechaOperacion: '2026-05-17', usuarioId: usuario.id,
        }),
      ),
    );
    expect(error).toBeInstanceOf(ErrorValidacion);
    expect((error as Error).message).toMatch(/mayor que cero/);
    // La transacción abortó antes del create: no se registró ningún gasto.
    // Ausencia → semilla god-view (nada se creó en ningún lado).
    expect(await semilla().gasto.count({ where: { sedeId: sede.id } })).toBe(0);
  });

  it('rechaza un gasto con monto negativo', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const usuario = await nuevoUsuario();
    const categoria = await nuevaCategoria(empresaId, false);

    await expect(
      comoEmpresa(empresaId, () =>
        registrarGasto({
          categoriaId: categoria.id, sedeId: sede.id, monto: -10,
          fechaOperacion: '2026-05-17', usuarioId: usuario.id,
        }),
      ),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    // Ausencia → semilla god-view.
    expect(await semilla().gasto.count({ where: { sedeId: sede.id } })).toBe(0);
  });

  it('rechaza un gasto de categoría de pago a empleado SIN empleadoId', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const usuario = await nuevoUsuario();
    const categoria = await nuevaCategoria(empresaId, true);

    const error = await capturarError(
      comoEmpresa(empresaId, () =>
        registrarGasto({
          categoriaId: categoria.id, sedeId: sede.id, monto: 100,
          fechaOperacion: '2026-05-17', usuarioId: usuario.id,
        }),
      ),
    );
    expect(error).toBeInstanceOf(ErrorValidacion);
    expect((error as Error).message).toMatch(/empleadoId/);
  });

  it('rechaza un gasto de categoría NO de empleado que trae empleadoId o tipoPago', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const usuario = await nuevoUsuario();
    const categoria = await nuevaCategoria(empresaId, false);
    const base = {
      categoriaId: categoria.id, sedeId: sede.id, monto: 100,
      fechaOperacion: '2026-05-18', usuarioId: usuario.id,
    };

    const conEmpleado = await capturarError(
      comoEmpresa(empresaId, () =>
        registrarGasto({ ...base, empleadoId: '00000000-0000-0000-0000-000000000001' }),
      ),
    );
    expect(conEmpleado).toBeInstanceOf(ErrorValidacion);
    expect((conEmpleado as Error).message).toMatch(/no debe llevar/);

    const conTipoPago = await capturarError(
      comoEmpresa(empresaId, () => registrarGasto({ ...base, tipoPago: 'efectivo' })),
    );
    expect(conTipoPago).toBeInstanceOf(ErrorValidacion);
    expect((conTipoPago as Error).message).toMatch(/no debe llevar/);
  });

  it('rechaza un gasto con categoriaId inexistente', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const usuario = await nuevoUsuario();

    const error = await capturarError(
      comoEmpresa(empresaId, () =>
        registrarGasto({
          categoriaId: '00000000-0000-0000-0000-000000000000', sedeId: sede.id, monto: 50,
          fechaOperacion: '2026-05-18', usuarioId: usuario.id,
        }),
      ),
    );
    expect(error).toBeInstanceOf(ErrorValidacion);
    expect((error as Error).message).toMatch(/no existe/);
    // Ausencia → semilla god-view.
    expect(await semilla().gasto.count({ where: { sedeId: sede.id } })).toBe(0);
  });
});
