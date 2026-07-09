import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
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
