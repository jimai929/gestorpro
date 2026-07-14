import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PantallaProveedores } from './PantallaProveedores';
import * as servicio from './servicioCuentas';
import type { Proveedor } from './tipos';

vi.mock('./servicioCuentas');
// LayoutPrincipal real usa useAuth/router; passthrough para aislar la pantalla.
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));

const provConDeuda: Proveedor = {
  id: 'p1', nombre: 'Distribuidora A', identificacionFiscal: null, telefono: null,
  personaContacto: null, activo: true, creadoEn: '2026-01-01', deudaTotal: 1100,
};
const provSinDeuda: Proveedor = {
  id: 'p2', nombre: 'Distribuidora B', identificacionFiscal: null, telefono: null,
  personaContacto: null, activo: true, creadoEn: '2026-01-01', deudaTotal: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(servicio.obtenerProveedores).mockResolvedValue([provConDeuda, provSinDeuda]);
});

function montar() {
  render(
    <MemoryRouter>
      <PantallaProveedores />
    </MemoryRouter>,
  );
}

describe('PantallaProveedores — columna de deuda total', () => {
  it('muestra la deuda de cada proveedor; B/. 0.00 para quien no debe', async () => {
    montar();
    await screen.findByText('Distribuidora A');
    expect(screen.getByText('Deuda total')).toBeTruthy(); // cabecera de la columna
    expect(screen.getByText('B/. 1100.00')).toBeTruthy(); // A debe
    expect(screen.getByText('B/. 0.00')).toBeTruthy(); // B no debe → cero explícito, no vacío
  });
});

describe('PantallaProveedores — cambiar de proveedor en edición remonta el formulario', () => {
  // Regresión: sin `key`, React reutilizaba la instancia del formulario al pasar de
  // Editar A a Editar B (misma posición JSX) y los campos conservaban los datos de A;
  // Guardar habría escrito los datos de A sobre el proveedor B.
  it('Editar A y luego Editar B muestra los datos de B (no los de A)', async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText('Distribuidora A');

    const botonesEditar = screen.getAllByRole('button', { name: 'Editar' });
    await user.click(botonesEditar[0]); // fila de A
    expect(screen.getByDisplayValue('Distribuidora A')).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: 'Editar' })[1]); // fila de B
    expect(screen.getByDisplayValue('Distribuidora B')).toBeTruthy();
    expect(screen.queryByDisplayValue('Distribuidora A')).toBeNull();
  });

  it('lo tecleado en la edición de A no contamina la edición de B', async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText('Distribuidora A');

    await user.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
    const campoNombre = screen.getByDisplayValue('Distribuidora A');
    await user.clear(campoNombre);
    await user.type(campoNombre, 'Nombre a medio teclear');

    await user.click(screen.getAllByRole('button', { name: 'Editar' })[1]);
    expect(screen.getByDisplayValue('Distribuidora B')).toBeTruthy();
    expect(screen.queryByDisplayValue('Nombre a medio teclear')).toBeNull();
  });
});
