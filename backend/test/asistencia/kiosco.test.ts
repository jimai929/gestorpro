import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/core/prisma.js';
import {
  crearKiosco,
  regenerarTokenKiosco,
  verificarTokenKiosco,
} from '../../src/asistencia/kiosco/kiosco.service.js';
import { ErrorAutenticacion, ErrorNoEncontrado, ErrorValidacion } from '../../src/core/errors.js';

let n = 0;
async function nuevaSede() {
  n += 1;
  return prisma.sede.create({ data: { nombre: `SedeKiosco ${n}-${Date.now()}` } });
}

describe('kiosco — alta', () => {
  it('crea un kiosco activo y devuelve un token de dispositivo (sin exponer el hash)', async () => {
    const sede = await nuevaSede();
    const kiosco = await crearKiosco({ nombre: 'Kiosco Test', sedeId: sede.id });

    expect(kiosco.nombre).toBe('Kiosco Test');
    expect(kiosco.sedeId).toBe(sede.id);
    expect(kiosco.activo).toBe(true); // default del schema
    expect(typeof kiosco.token).toBe('string');
    expect(kiosco.token.length).toBeGreaterThan(20);
    // El token en claro NO se persiste ni se devuelve como hash.
    expect((kiosco as Record<string, unknown>).tokenHash).toBeUndefined();

    const enBase = await prisma.kiosco.findUnique({ where: { id: kiosco.id } });
    expect(enBase).not.toBeNull();
    expect(enBase?.tokenHash).toBeTruthy();
    expect(enBase?.tokenHash).not.toBe(kiosco.token); // se guarda el hash, no el token
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

describe('kiosco — token de dispositivo', () => {
  it('verifica el token correcto y rechaza uno inválido o ausente', async () => {
    const sede = await nuevaSede();
    const { id, token } = await crearKiosco({ nombre: 'K', sedeId: sede.id });

    await expect(verificarTokenKiosco(id, token)).resolves.toBeUndefined();
    await expect(verificarTokenKiosco(id, 'token-incorrecto')).rejects.toBeInstanceOf(ErrorAutenticacion);
    await expect(verificarTokenKiosco(id, undefined)).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('regenerar invalida el token anterior y acepta el nuevo', async () => {
    const sede = await nuevaSede();
    const { id, token: viejo } = await crearKiosco({ nombre: 'K', sedeId: sede.id });

    const { token: nuevo } = await regenerarTokenKiosco(id);
    expect(nuevo).not.toBe(viejo);
    await expect(verificarTokenKiosco(id, viejo)).rejects.toBeInstanceOf(ErrorAutenticacion);
    await expect(verificarTokenKiosco(id, nuevo)).resolves.toBeUndefined();
  });

  it('rechaza el token de un kiosco inactivo', async () => {
    const sede = await nuevaSede();
    const { id, token } = await crearKiosco({ nombre: 'K', sedeId: sede.id });
    await prisma.kiosco.update({ where: { id }, data: { activo: false } });
    await expect(verificarTokenKiosco(id, token)).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('regenerar un kiosco inexistente lanza ErrorNoEncontrado', async () => {
    await expect(
      regenerarTokenKiosco('00000000-0000-0000-0000-000000000000'),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
  });
});
