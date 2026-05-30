import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/core/prisma.js';
import { crearCaja, editarCaja, listarCajas } from '../../src/core/caja/caja.service.js';
import { ErrorConflicto, ErrorNoEncontrado } from '../../src/core/errors.js';

let contador = 0;
async function nuevaSede() {
  contador += 1;
  return prisma.sede.create({ data: { nombre: `SedeCaja ${contador}` } });
}

describe('catálogo de cajas por sede', () => {
  it('crea una caja activa', async () => {
    const sede = await nuevaSede();
    const caja = await crearCaja({ numero: '1', nombre: 'Principal', sedeId: sede.id });
    expect(caja.numero).toBe('1');
    expect(caja.nombre).toBe('Principal');
    expect(caja.activo).toBe(true);
  });

  it('rechaza dos cajas ACTIVAS con el mismo número en la misma sede (409)', async () => {
    const sede = await nuevaSede();
    await crearCaja({ numero: '1', nombre: 'A', sedeId: sede.id });
    await expect(
      crearCaja({ numero: '1', nombre: 'B', sedeId: sede.id }),
    ).rejects.toBeInstanceOf(ErrorConflicto);
  });

  it('permite el mismo número en sedes distintas', async () => {
    const a = await nuevaSede();
    const b = await nuevaSede();
    await crearCaja({ numero: '1', nombre: 'A', sedeId: a.id });
    await expect(crearCaja({ numero: '1', nombre: 'B', sedeId: b.id })).resolves.toBeTruthy();
  });

  it('RECICLA: doy de baja "01", creo "01" nueva en la misma sede → OK', async () => {
    const sede = await nuevaSede();
    const vieja = await crearCaja({ numero: '01', nombre: 'Vieja', sedeId: sede.id });
    await editarCaja(vieja.id, { activo: false });
    const nueva = await crearCaja({ numero: '01', nombre: 'Nueva', sedeId: sede.id });
    expect(nueva.id).not.toBe(vieja.id);
    expect(nueva.activo).toBe(true);
  });

  it('REACTIVACIÓN con colisión: baja "01", creo "01" reciclada, reactivar la vieja → rechazado (no 500)', async () => {
    const sede = await nuevaSede();
    const vieja = await crearCaja({ numero: '01', nombre: 'Vieja', sedeId: sede.id });
    await editarCaja(vieja.id, { activo: false });
    await crearCaja({ numero: '01', nombre: 'Reciclada', sedeId: sede.id }); // activa con "01"
    await expect(editarCaja(vieja.id, { activo: true })).rejects.toBeInstanceOf(ErrorConflicto);
  });

  it('edita nombre y baja lógica (fuera de activas, sigue en incluirInactivas, no se borra)', async () => {
    const sede = await nuevaSede();
    const caja = await crearCaja({ numero: '2', nombre: 'Mostrador', sedeId: sede.id });

    const editada = await editarCaja(caja.id, { nombre: 'Mostrador 2' });
    expect(editada.nombre).toBe('Mostrador 2');

    await editarCaja(caja.id, { activo: false });
    const activas = await listarCajas({ sedeId: sede.id });
    expect(activas.some((c) => c.id === caja.id)).toBe(false);
    const todas = await listarCajas({ sedeId: sede.id, incluirInactivas: true });
    expect(todas.some((c) => c.id === caja.id)).toBe(true);
  });

  it('lista por sede: solo trae las de esa sede', async () => {
    const a = await nuevaSede();
    const b = await nuevaSede();
    await crearCaja({ numero: '1', nombre: 'A1', sedeId: a.id });
    await crearCaja({ numero: '1', nombre: 'B1', sedeId: b.id });
    const deA = await listarCajas({ sedeId: a.id });
    expect(deA.length).toBeGreaterThan(0);
    expect(deA.every((c) => c.sedeId === a.id)).toBe(true);
    expect(deA.some((c) => c.sedeId === b.id)).toBe(false);
  });

  it('editar una caja inexistente lanza ErrorNoEncontrado', async () => {
    await expect(
      editarCaja('00000000-0000-0000-0000-000000000000', { nombre: 'X' }),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
  });
});
