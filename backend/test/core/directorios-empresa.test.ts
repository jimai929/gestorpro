import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { semilla, comoEmpresa, crearEmpresa, cerrarSemilla } from '../helpers/db.js';
import {
  sembrarDirectoriosEmpresa,
  CATEGORIAS_GASTO_DEFAULT,
  ROLES_OPERATIVOS_DEFAULT,
} from '../../src/core/empresa/directorios-defaults.js';
import { backfillDirectoriosEmpresa } from '../../prisma/scripts/backfill-directorios-empresa.js';
import { registrarGasto } from '../../src/finanzas/gastos/gastos.service.js';
import { txEmpresa } from '../../src/core/tenant/contexto.js';

afterAll(cerrarSemilla);

/** Cuenta (god-view, bypass RLS) los directorios de una empresa. */
async function contar(empresaId: string) {
  const [categorias, roles, config, pagoEmpl] = await Promise.all([
    semilla().categoriaGasto.count({ where: { empresaId } }),
    semilla().rolOperativo.count({ where: { empresaId } }),
    semilla().configuracionCobro.count({ where: { empresaId } }),
    semilla().categoriaGasto.count({ where: { empresaId, esPagoEmpleado: true } }),
  ]);
  return { categorias, roles, config, pagoEmpl };
}

describe('sembrarDirectoriosEmpresa (defaults de tenant)', () => {
  it('siembra las 4 categorías (1 de pago a empleado), 2 roles y 1 config', async () => {
    const empresaId = await crearEmpresa();
    await sembrarDirectoriosEmpresa(semilla(), empresaId);

    expect(await contar(empresaId)).toEqual({ categorias: 4, roles: 2, config: 1, pagoEmpl: 1 });
    // Exactamente UNA "Pago a empleado" con esPagoEmpleado=true (la que exige el cobro).
    const pago = await semilla().categoriaGasto.findMany({
      where: { empresaId, esPagoEmpleado: true },
    });
    expect(pago).toHaveLength(1);
    expect(pago[0]?.nombre).toBe('Pago a empleado');
  });

  it('es idempotente: dos llamadas no duplican', async () => {
    const empresaId = await crearEmpresa();
    await sembrarDirectoriosEmpresa(semilla(), empresaId);
    await sembrarDirectoriosEmpresa(semilla(), empresaId);
    expect(await contar(empresaId)).toEqual({ categorias: 4, roles: 2, config: 1, pagoEmpl: 1 });
  });

  it('no duplica un default ya existente: completa solo lo que falta', async () => {
    const empresaId = await crearEmpresa();
    await semilla().categoriaGasto.create({
      data: { empresaId, nombre: 'Alquiler', esPagoEmpleado: false },
    });
    await sembrarDirectoriosEmpresa(semilla(), empresaId);

    const alquiler = await semilla().categoriaGasto.findMany({ where: { empresaId, nombre: 'Alquiler' } });
    expect(alquiler).toHaveLength(1); // no se duplicó
    expect(await contar(empresaId)).toMatchObject({ categorias: 4 });
  });

  it('tras sembrar, se puede REGISTRAR un gasto en el tenant nuevo (fin del dead-lock)', async () => {
    const empresaId = await crearEmpresa();
    await sembrarDirectoriosEmpresa(semilla(), empresaId);
    const sede = await semilla().sede.create({ data: { nombre: 'Sede BF', empresaId } });
    const usuario = await semilla().usuario.create({
      data: { nombre: 'U', email: `bf-${randomUUID()}@x.local`, rol: 'administrador', passwordHash: 'x' },
    });
    const categoria = await semilla().categoriaGasto.findFirstOrThrow({
      where: { empresaId, nombre: 'Alquiler' },
    });

    const gasto = await comoEmpresa(empresaId, () =>
      registrarGasto({
        categoriaId: categoria.id,
        sedeId: sede.id,
        monto: 50,
        fechaOperacion: '2026-05-17',
        usuarioId: usuario.id,
      }),
    );
    expect(gasto.id).toBeDefined();
  });

  it('tras sembrar, el path RLS del cobro (esPagoEmpleado + activo) encuentra la categoría', async () => {
    const empresaId = await crearEmpresa();
    await sembrarDirectoriosEmpresa(semilla(), empresaId);
    // MISMA consulta que cobro.service.pagarCobro, bajo el contexto de tenant del app (RLS).
    const cat = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) => tx.categoriaGasto.findFirst({ where: { esPagoEmpleado: true, activo: true } })),
    );
    expect(cat).not.toBeNull();
    expect(cat?.nombre).toBe('Pago a empleado');
  });
});

describe('backfillDirectoriosEmpresa (tenants existentes)', () => {
  it('dry-run reporta lo faltante pero NO escribe', async () => {
    const empresaId = await crearEmpresa();
    expect(await contar(empresaId)).toEqual({ categorias: 0, roles: 0, config: 0, pagoEmpl: 0 });

    const reporte = await backfillDirectoriosEmpresa(semilla(), { apply: false });
    const fila = reporte.find((r) => r.empresaId === empresaId);
    expect(fila).toBeDefined();
    expect(fila?.sembrado).toBe(false);
    expect(fila?.categoriasFaltantes).toEqual(CATEGORIAS_GASTO_DEFAULT.map((c) => c.nombre));
    expect(fila?.rolesFaltantes).toEqual(ROLES_OPERATIVOS_DEFAULT.map((r) => r.clave));
    expect(fila?.configFaltante).toBe(true);

    // No escribió NADA.
    expect(await contar(empresaId)).toEqual({ categorias: 0, roles: 0, config: 0, pagoEmpl: 0 });
  });

  it('apply completa SOLO lo faltante y es idempotente en la 2ª pasada', async () => {
    const empresaId = await crearEmpresa();
    // Pre-existente: 'Alquiler' + rol 'cajera' → el backfill solo completa el resto.
    await semilla().categoriaGasto.create({
      data: { empresaId, nombre: 'Alquiler', esPagoEmpleado: false },
    });
    await semilla().rolOperativo.create({ data: { empresaId, clave: 'cajera', nombre: 'Cajera' } });

    const rep1 = (await backfillDirectoriosEmpresa(semilla(), { apply: true })).find(
      (r) => r.empresaId === empresaId,
    );
    expect(rep1?.sembrado).toBe(true);
    expect(rep1?.categoriasFaltantes).not.toContain('Alquiler'); // ya estaba, no se reporta como faltante
    expect(rep1?.rolesFaltantes).not.toContain('cajera');
    expect(await contar(empresaId)).toEqual({ categorias: 4, roles: 2, config: 1, pagoEmpl: 1 });

    // 2ª pasada: la empresa ya está completa → NO aparece en el reporte (no se re-toca).
    const rep2 = (await backfillDirectoriosEmpresa(semilla(), { apply: true })).find(
      (r) => r.empresaId === empresaId,
    );
    expect(rep2).toBeUndefined();
    expect(await contar(empresaId)).toEqual({ categorias: 4, roles: 2, config: 1, pagoEmpl: 1 });
  });
});
