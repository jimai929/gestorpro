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

describe('PantallaKioscos — rotación de token (una sola en vuelo)', () => {
  const kiosco2: Kiosco = {
    id: 'k2',
    nombre: 'Kiosco Salida',
    sedeId: 'sa',
    activo: true,
    creadoEn: '2026-01-01',
    sede: { nombre: 'Sede A', modoExcepcion: 'pin' },
  };

  // Regresión: `regenerandoId` es un slot único; sin guard, rotar B con A en vuelo
  // reactivaba el botón de A y el finally de A pisaba el estado de B. El token se
  // revela UNA sola vez: dos rotaciones concurrentes pierden uno de los dos tokens.
  it('con una rotación en vuelo, las demás filas quedan deshabilitadas y NO se dispara otra', async () => {
    vi.mocked(servicioKioscos.obtenerKioscos).mockResolvedValue([kioscoDemo, kiosco2]);
    let resolver: (v: { id: string; token: string }) => void = () => {};
    vi.mocked(servicioKioscos.regenerarTokenKiosco).mockReturnValue(
      new Promise((res) => { resolver = res; }),
    );
    const user = userEvent.setup();
    montar();
    await screen.findByText('Kiosco Entrada');

    await user.click(screen.getAllByRole('button', { name: 'Regenerar token' })[0]);

    // En vuelo: la otra fila está deshabilitada y clicarla no dispara nada.
    const botonOtraFila = screen.getAllByRole('button', { name: 'Regenerar token' })[1] as HTMLButtonElement;
    expect(botonOtraFila.disabled).toBe(true);
    await user.click(botonOtraFila);
    expect(servicioKioscos.regenerarTokenKiosco).toHaveBeenCalledTimes(1);
    expect(servicioKioscos.regenerarTokenKiosco).toHaveBeenCalledWith('k1');

    // Al resolverse, el token se revela y los botones vuelven a habilitarse.
    resolver({ id: 'k1', token: 'tok-rotado-k1' });
    expect(await screen.findByText('tok-rotado-k1')).toBeTruthy();
    await waitFor(() =>
      expect(
        (screen.getAllByRole('button', { name: 'Regenerar token' })[1] as HTMLButtonElement).disabled,
      ).toBe(false),
    );
  });

  it('si la rotación falla, el error se muestra y el botón vuelve a estar disponible', async () => {
    vi.mocked(servicioKioscos.obtenerKioscos).mockResolvedValue([kioscoDemo]);
    vi.mocked(servicioKioscos.regenerarTokenKiosco).mockRejectedValue(
      new Error('No se pudo rotar el token'),
    );
    const user = userEvent.setup();
    montar();
    await screen.findByText('Kiosco Entrada');

    await user.click(screen.getByRole('button', { name: 'Regenerar token' }));

    expect(await screen.findByText('No se pudo rotar el token')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Regenerar token' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});

describe('PantallaKioscos — alta', () => {
  it('da de alta un kiosco con su sede y refresca la lista', async () => {
    vi.mocked(servicioKioscos.crearKiosco).mockResolvedValue({
      ...kioscoDemo,
      id: 'k2',
      nombre: 'Kiosco Salida',
      token: 'token-demo-xyz',
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
