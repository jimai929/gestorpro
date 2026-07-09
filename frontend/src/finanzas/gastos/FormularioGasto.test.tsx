import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormularioGasto } from './FormularioGasto';
import * as servicioGastos from './servicioGastos';
import type { CategoriaGasto, Sede } from './tipos';

vi.mock('./servicioGastos');
// useAuth controlable: cada test fija el rol antes de montar.
const usuarioMock = vi.hoisted(() => ({
  actual: { rol: 'administrador', empresaId: 'e1' } as { rol: string; empresaId: string | null },
}));
vi.mock('../../core/auth/ContextoAuth', () => ({
  useAuth: () => ({ usuario: usuarioMock.actual }),
}));

const cat: CategoriaGasto = {
  id: 'c1', nombre: 'Alquiler', esPagoEmpleado: false, activo: true, creadoEn: '2026-01-01',
};
const sede: Sede = {
  id: 's1', nombre: 'Sede A', activo: true, modoExcepcion: 'pin', creadoEn: '2026-01-01',
};

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.actual = { rol: 'administrador', empresaId: 'e1' };
  vi.mocked(servicioGastos.obtenerCategoriasGasto).mockResolvedValue([cat]);
  vi.mocked(servicioGastos.obtenerSedes).mockResolvedValue([sede]);
});

function montar() {
  render(<FormularioGasto onRegistrado={() => {}} />);
}

describe('FormularioGasto — crear categoría inline', () => {
  it('admin ve el enlace "+ Nueva categoría"', async () => {
    montar();
    await screen.findByRole('option', { name: 'Alquiler' });
    expect(screen.getByRole('button', { name: /nueva categoría/i })).toBeTruthy();
  });

  it('empleado NO ve el enlace de crear categoría inline', async () => {
    usuarioMock.actual = { rol: 'empleado', empresaId: 'e1' };
    montar();
    await screen.findByRole('option', { name: 'Alquiler' });
    expect(screen.queryByRole('button', { name: /nueva categoría/i })).toBeNull();
  });

  it('crear inline llama a crearCategoria y AUTO-SELECCIONA la nueva (sin perder el formulario)', async () => {
    vi.mocked(servicioGastos.crearCategoria).mockResolvedValue({
      id: 'c2', nombre: 'Publicidad', esPagoEmpleado: false, activo: true, creadoEn: '2026-01-02', reactivada: false,
    });
    const user = userEvent.setup();
    montar();
    await screen.findByRole('option', { name: 'Alquiler' });

    await user.click(screen.getByRole('button', { name: /nueva categoría/i }));
    await user.type(screen.getByLabelText('Nombre'), 'Publicidad');
    await user.click(screen.getByRole('button', { name: /crear categoría/i }));

    await waitFor(() =>
      expect(vi.mocked(servicioGastos.crearCategoria)).toHaveBeenCalledWith({
        nombre: 'Publicidad',
        esPagoEmpleado: false,
      }),
    );
    // La nueva aparece como opción y el select de categoría queda con su id.
    await screen.findByRole('option', { name: 'Publicidad' });
    const selects = screen.getAllByRole('combobox');
    expect((selects[0] as HTMLSelectElement).value).toBe('c2');
  });

  it('crear inline con nombre de una INACTIVA → reactivada: aviso + auto-selección', async () => {
    vi.mocked(servicioGastos.crearCategoria).mockResolvedValue({
      id: 'c3', nombre: 'Vieja', esPagoEmpleado: false, activo: true, creadoEn: '2026-01-02', reactivada: true,
    });
    const user = userEvent.setup();
    montar();
    await screen.findByRole('option', { name: 'Alquiler' });

    await user.click(screen.getByRole('button', { name: /nueva categoría/i }));
    await user.type(screen.getByLabelText('Nombre'), 'Vieja');
    await user.click(screen.getByRole('button', { name: /crear categoría/i }));

    await screen.findByText(/reactivada/i); // aviso de reactivación
    const selects = screen.getAllByRole('combobox');
    expect((selects[0] as HTMLSelectElement).value).toBe('c3');
  });
});
