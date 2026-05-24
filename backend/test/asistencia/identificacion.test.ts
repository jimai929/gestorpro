import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/core/prisma.js';
import { identificarEmpleado } from '../../src/asistencia/fichaje/identificacion.service.js';
import {
  verificadorFacialSimulado,
  facialExitosa,
} from '../../src/asistencia/fichaje/verificador-facial.js';
import { ErrorNoEncontrado } from '../../src/core/errors.js';

let n = 0;

async function crearEmpleado() {
  n += 1;
  const sufijo = `${n}-${Date.now()}`;
  const sede = await prisma.sede.create({ data: { nombre: `Sede ${sufijo}` } });
  return prisma.empleado.create({
    data: {
      numero: `E${sufijo}`,
      nombre: 'Empleado de prueba',
      sedeId: sede.id,
      qrToken: `qr-${sufijo}`,
      pinHash: 'x',
      salarioFijo: 1000,
    },
  });
}

describe('identificación de empleado', () => {
  it('identifica por número de empleado', async () => {
    const empleado = await crearEmpleado();
    const encontrado = await identificarEmpleado({ numero: empleado.numero });
    expect(encontrado.id).toBe(empleado.id);
  });

  it('identifica por QR', async () => {
    const empleado = await crearEmpleado();
    const encontrado = await identificarEmpleado({ qrToken: empleado.qrToken });
    expect(encontrado.id).toBe(empleado.id);
  });

  it('rechaza un empleado inexistente', async () => {
    await expect(
      identificarEmpleado({ numero: 'NO-EXISTE' }),
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
