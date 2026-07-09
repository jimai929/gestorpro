import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PantallaCategorias } from './PantallaCategorias';
import * as servicioGastos from './servicioGastos';
import type { CategoriaGasto } from './tipos';

vi.mock('./servicioGastos');
// LayoutPrincipal real usa useAuth/router; passthrough para aislar la pantalla.
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));
// useAuth controlable: cada test fija el rol antes de montar.
const usuarioMock = vi.hoisted(() => ({
  actual: { rol: 'administrador', empresaId: 'e1' } as { rol: string; empresaId: string | null },
}));
vi.mock('../../core/auth/ContextoAuth', () => ({
  useAuth: () => ({ usuario: usuarioMock.actual }),
}));

const catActiva: CategoriaGasto = {
  id: 'c1', nombre: 'Alquiler', esPagoEmpleado: false, activo: true, creadoEn: '2026-01-01',
};
const catInactiva: CategoriaGasto = {
  id: 'c2', nombre: 'Vieja', esPagoEmpleado: false, activo: false, creadoEn: '2026-01-01',
};

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.actual = { rol: 'administrador', empresaId: 'e1' };
  vi.mocked(servicioGastos.obtenerCategoriasGasto).mockResolvedValue([catActiva, catInactiva]);
});

function montar() {
  render(
    <MemoryRouter>
      <PantallaCategorias />
    </MemoryRouter>,
  );
}

describe('PantallaCategorias — permisos de UI por rol', () => {
  it('administrador ve el botón "Nueva categoría" y acciones de fila', async () => {
    montar();
    await screen.findByText('Alquiler');
    expect(screen.getByRole('button', { name: /nueva categoría/i })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Editar' }).length).toBeGreaterThan(0);
  });

  it('supervisor también puede gestionar', async () => {
    usuarioMock.actual = { rol: 'supervisor', empresaId: 'e1' };
    montar();
    await screen.findByText('Alquiler');
    expect(screen.getByRole('button', { name: /nueva categoría/i })).toBeTruthy();
  });

  it('empleado NO ve controles de gestión, pero SÍ el listado', async () => {
    usuarioMock.actual = { rol: 'empleado', empresaId: 'e1' };
    montar();
    await screen.findByText('Alquiler'); // el listado se muestra
    expect(screen.queryByRole('button', { name: /nueva categoría/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Editar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Desactivar' })).toBeNull();
  });
});

describe('PantallaCategorias — baja/alta lógica', () => {
  it('desactivar una categoría activa llama a desactivarCategoria(id)', async () => {
    vi.mocked(servicioGastos.desactivarCategoria).mockResolvedValue({ ...catActiva, activo: false });
    const user = userEvent.setup();
    montar();
    await screen.findByText('Alquiler');
    await user.click(screen.getByRole('button', { name: 'Desactivar' }));
    expect(vi.mocked(servicioGastos.desactivarCategoria)).toHaveBeenCalledWith('c1');
  });

  it('reactivar una inactiva llama a actualizarCategoria(id, {activo:true})', async () => {
    vi.mocked(servicioGastos.actualizarCategoria).mockResolvedValue({ ...catInactiva, activo: true });
    const user = userEvent.setup();
    montar();
    await screen.findByText('Vieja');
    await user.click(screen.getByRole('button', { name: 'Reactivar' }));
    expect(vi.mocked(servicioGastos.actualizarCategoria)).toHaveBeenCalledWith('c2', { activo: true });
  });
});
