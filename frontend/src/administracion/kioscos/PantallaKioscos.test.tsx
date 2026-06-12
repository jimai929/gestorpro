import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PantallaKioscos } from './PantallaKioscos';
import * as servicioKioscos from './servicioKioscos';
import * as servicioSedes from '../sedes/servicioSedes';
import type { Kiosco } from './tipos';
import type { Sede } from '../sedes/tipos';

vi.mock('./servicioKioscos');
vi.mock('../sedes/servicioSedes');
// El LayoutPrincipal real usa useAuth; la pantalla bajo prueba no lo necesita.
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));

const sedeA: Sede = { id: 'sa', nombre: 'Sede A', activo: true, modoExcepcion: 'pin', creadoEn: '2026-01-01' };
const kioscoDemo: Kiosco = {
  id: 'k1',
  nombre: 'Kiosco Entrada',
  sedeId: 'sa',
  activo: true,
  creadoEn: '2026-01-01',
  sede: { nombre: 'Sede A', modoExcepcion: 'pin' },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(servicioKioscos.obtenerKioscos).mockResolvedValue([kioscoDemo]);
  vi.mocked(servicioSedes.obtenerSedes).mockResolvedValue([sedeA]);
});

function montar() {
  render(
    <MemoryRouter>
      <PantallaKioscos />
    </MemoryRouter>,
  );
}

describe('PantallaKioscos — listado', () => {
  it('lista los kioscos con el nombre de su sede', async () => {
    montar();
    await screen.findByText('Kiosco Entrada');
    expect(screen.getByText('Sede A')).toBeTruthy();
  });
});

describe('PantallaKioscos — alta', () => {
  it('da de alta un kiosco con su sede y refresca la lista', async () => {
    vi.mocked(servicioKioscos.crearKiosco).mockResolvedValue({
      ...kioscoDemo,
      id: 'k2',
      nombre: 'Kiosco Salida',
    });
    const user = userEvent.setup();
    montar();
    await screen.findByText('Kiosco Entrada'); // carga inicial

    await user.click(screen.getByRole('button', { name: /registrar kiosco/i }));
    await user.type(screen.getByLabelText(/nombre/i), 'Kiosco Salida');
    await user.selectOptions(screen.getByRole('combobox'), 'sa'); // único select: Sede
    await user.click(screen.getByRole('button', { name: /crear kiosco/i }));

    await waitFor(() =>
      expect(servicioKioscos.crearKiosco).toHaveBeenCalledWith({ nombre: 'Kiosco Salida', sedeId: 'sa' }),
    );
    // Tras el alta se recarga la lista: obtenerKioscos se llamó dos veces (inicial + refresco).
    expect(servicioKioscos.obtenerKioscos).toHaveBeenCalledTimes(2);
  });
});
