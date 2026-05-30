import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/core/prisma.js';
import { crearSede, editarSede, listarSedes } from '../../src/core/sede/sede.service.js';
import { ErrorNoEncontrado } from '../../src/core/errors.js';

describe('gestión de sedes', () => {
  it('crea una sede con su modo de excepción', async () => {
    const sede = await crearSede({ nombre: 'Sede Test A', modoExcepcion: 'ambos' });
    expect(sede.nombre).toBe('Sede Test A');
    expect(sede.modoExcepcion).toBe('ambos');
    expect(sede.activo).toBe(true);
  });

  it('por defecto el modo de excepción es pin', async () => {
    const sede = await crearSede({ nombre: 'Sede Test B' });
    expect(sede.modoExcepcion).toBe('pin');
  });

  it('edita nombre y modo de excepción', async () => {
    const sede = await crearSede({ nombre: 'Sede Test C' });
    const editada = await editarSede(sede.id, { nombre: 'Sede Test C2', modoExcepcion: 'supervisor' });
    expect(editada.nombre).toBe('Sede Test C2');
    expect(editada.modoExcepcion).toBe('supervisor');
  });

  it('baja lógica: sale de las activas, sigue en la lista completa y no se borra', async () => {
    const sede = await crearSede({ nombre: 'Sede Test D' });

    const baja = await editarSede(sede.id, { activo: false });
    expect(baja.activo).toBe(false);

    const activas = await listarSedes();
    expect(activas.some((s) => s.id === sede.id)).toBe(false);

    const todas = await listarSedes({ incluirInactivas: true });
    expect(todas.some((s) => s.id === sede.id)).toBe(true);

    const enBase = await prisma.sede.findUnique({ where: { id: sede.id } });
    expect(enBase).not.toBeNull();

    // Reactivación.
    const alta = await editarSede(sede.id, { activo: true });
    expect(alta.activo).toBe(true);
  });

  it('editar una sede inexistente lanza ErrorNoEncontrado', async () => {
    await expect(
      editarSede('00000000-0000-0000-0000-000000000000', { nombre: 'X' }),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
  });
});
