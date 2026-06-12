import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/core/prisma.js';
import { crearKiosco } from '../../src/asistencia/kiosco/kiosco.service.js';
import { ErrorValidacion } from '../../src/core/errors.js';

let n = 0;
async function nuevaSede() {
  n += 1;
  return prisma.sede.create({ data: { nombre: `SedeKiosco ${n}-${Date.now()}` } });
}

describe('kiosco — alta', () => {
  it('crea un kiosco activo en una sede existente', async () => {
    const sede = await nuevaSede();
    const kiosco = await crearKiosco({ nombre: 'Kiosco Test', sedeId: sede.id });

    expect(kiosco.nombre).toBe('Kiosco Test');
    expect(kiosco.sedeId).toBe(sede.id);
    expect(kiosco.activo).toBe(true); // default del schema
    const enBase = await prisma.kiosco.findUnique({ where: { id: kiosco.id } });
    expect(enBase).not.toBeNull();
  });

  it('rechaza el alta si la sede no existe (ErrorValidacion) y no crea la fila', async () => {
    const sedeInexistente = '00000000-0000-0000-0000-000000000000';
    await expect(
      crearKiosco({ nombre: 'Kiosco Huérfano', sedeId: sedeInexistente }),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    // El guard corta antes del create: ningún kiosco quedó ligado a esa sede.
    expect(await prisma.kiosco.findMany({ where: { sedeId: sedeInexistente } })).toHaveLength(0);
  });
});
