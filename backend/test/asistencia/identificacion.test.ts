import { describe, it, expect, afterAll } from 'vitest';
import { semilla, comoEmpresa, crearEmpresa, cerrarSemilla } from '../helpers/db.js';
import { identificarEmpleado } from '../../src/asistencia/fichaje/identificacion.service.js';
import {
  verificadorFacialSimulado,
  facialExitosa,
} from '../../src/asistencia/fichaje/verificador-facial.js';
import { ErrorNoEncontrado } from '../../src/core/errors.js';

let n = 0;

async function crearEmpleado(empresaId: string) {
  n += 1;
  const sufijo = `${n}-${Date.now()}`;
  // sede es tabla DIRECTA → empresaId explícito (siembra ignora RLS).
  const sede = await semilla().sede.create({
    data: { nombre: `Sede ${sufijo}`, empresaId },
  });
  // Fase 3 Ola 3c: empleado es tabla DIRECTA → empresa_id explícito (siembra ignora
  // RLS) y debe coincidir con sede.empresa_id (FK compuesta).
  return semilla().empleado.create({
    data: {
      empresaId,
      numero: `E${sufijo}`,
      nombre: 'Empleado de prueba',
      sedeId: sede.id,
      qrToken: `qr-${sufijo}`,
      pinHash: 'x',
      salarioFijo: 1000,
    },
  });
}

afterAll(cerrarSemilla);

describe('identificación de empleado', () => {
  it('identifica por número de empleado', async () => {
    const empresaId = await crearEmpresa();
    const empleado = await crearEmpleado(empresaId);
    const encontrado = await comoEmpresa(empresaId, () =>
      identificarEmpleado({ numero: empleado.numero }),
    );
    expect(encontrado.id).toBe(empleado.id);
  });

  it('identifica por QR', async () => {
    const empresaId = await crearEmpresa();
    const empleado = await crearEmpleado(empresaId);
    const encontrado = await comoEmpresa(empresaId, () =>
      identificarEmpleado({ qrToken: empleado.qrToken }),
    );
    expect(encontrado.id).toBe(empleado.id);
  });

  it('rechaza un empleado inexistente', async () => {
    const empresaId = await crearEmpresa();
    await expect(
      comoEmpresa(empresaId, () => identificarEmpleado({ numero: 'NO-EXISTE' })),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
  });
});

describe('verificación facial simulada', () => {
  it('acepta una coincidencia con vida', async () => {
    const r = await verificadorFacialSimulado.verificar({
      fotoReferencia: 'ref',
      fotoCaptura: 'sim:match',
    });
    expect(facialExitosa(r)).toBe(true);
  });

  it('rechaza una no-coincidencia', async () => {
    const r = await verificadorFacialSimulado.verificar({
      fotoReferencia: 'ref',
      fotoCaptura: 'sim:nomatch',
    });
    expect(r.coincide).toBe(false);
    expect(facialExitosa(r)).toBe(false);
  });

  it('rechaza cuando falla el liveness', async () => {
    const r = await verificadorFacialSimulado.verificar({
      fotoReferencia: 'ref',
      fotoCaptura: 'sim:nolive',
    });
    expect(r.liveness).toBe(false);
    expect(facialExitosa(r)).toBe(false);
  });
});
