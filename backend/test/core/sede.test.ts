import { describe, it, expect } from 'vitest';
import { semilla, comoEmpresa, crearEmpresa } from '../helpers/db.js';
import { crearSede, editarSede, listarSedes } from '../../src/core/sede/sede.service.js';
import { ErrorNoEncontrado } from '../../src/core/errors.js';

describe('gestión de sedes', () => {
  it('crea una sede con su modo de excepción', async () => {
    const empresaId = await crearEmpresa();
    const sede = await comoEmpresa(empresaId, () =>
      crearSede({ nombre: 'Sede Test A', modoExcepcion: 'ambos' }),
    );
    expect(sede.nombre).toBe('Sede Test A');
    expect(sede.modoExcepcion).toBe('ambos');
    expect(sede.activo).toBe(true);
  });

  it('por defecto el modo de excepción es pin', async () => {
    const empresaId = await crearEmpresa();
    const sede = await comoEmpresa(empresaId, () => crearSede({ nombre: 'Sede Test B' }));
    expect(sede.modoExcepcion).toBe('pin');
  });

  it('edita nombre y modo de excepción', async () => {
    const empresaId = await crearEmpresa();
    const sede = await comoEmpresa(empresaId, () => crearSede({ nombre: 'Sede Test C' }));
    const editada = await comoEmpresa(empresaId, () =>
      editarSede(sede.id, { nombre: 'Sede Test C2', modoExcepcion: 'supervisor' }),
    );
    expect(editada.nombre).toBe('Sede Test C2');
    expect(editada.modoExcepcion).toBe('supervisor');
  });

  it('baja lógica: sale de las activas, sigue en la lista completa y no se borra', async () => {
    const empresaId = await crearEmpresa();
    const sede = await comoEmpresa(empresaId, () => crearSede({ nombre: 'Sede Test D' }));

    const baja = await comoEmpresa(empresaId, () => editarSede(sede.id, { activo: false }));
    expect(baja.activo).toBe(false);

    const activas = await comoEmpresa(empresaId, () => listarSedes());
    expect(activas.some((s) => s.id === sede.id)).toBe(false);

    const todas = await comoEmpresa(empresaId, () => listarSedes({ incluirInactivas: true }));
    expect(todas.some((s) => s.id === sede.id)).toBe(true);

    // No-borrado: la fila debe seguir existiendo en BD (god-view, sin filtro RLS).
    const enBase = await semilla().sede.findUnique({ where: { id: sede.id } });
    expect(enBase).not.toBeNull();

    // Reactivación.
    const alta = await comoEmpresa(empresaId, () => editarSede(sede.id, { activo: true }));
    expect(alta.activo).toBe(true);
  });

  it('editar una sede inexistente lanza ErrorNoEncontrado', async () => {
    const empresaId = await crearEmpresa();
    await expect(
      comoEmpresa(empresaId, () =>
        editarSede('00000000-0000-0000-0000-000000000000', { nombre: 'X' }),
      ),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
  });
});
