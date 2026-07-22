/**
 * Gating por rol de PantallaCuentasPorPagar: registrar factura, abonar y
 * planificar pagos son acciones de GESTIÓN (backend soloGestion en
 * POST /compras, POST /pagos y plan-pagos/simular). El empleado consulta la
 * lista pero no ve esas acciones — antes las veía y acababa en 403.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PantallaCuentasPorPagar } from './PantallaCuentasPorPagar';
import * as servicio from './servicioCuentas';
import type { CuentaPorPagar } from './tipos';

vi.mock('./servicioCuentas');
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));
const usuarioMock = vi.hoisted(() => ({
  actual: { rol: 'administrador', empresaId: 'e1' } as { rol: string; empresaId: string | null },
}));
vi.mock('../../core/auth/ContextoAuth', () => ({
  useAuth: () => ({ usuario: usuarioMock.actual }),
}));
// Formularios pesados fuera de foco: aquí solo se prueba el gating de la pantalla.
vi.mock('./FormularioFactura', () => ({
  FormularioFactura: () => <div>formulario-factura</div>,
}));
vi.mock('./DialogoPago', () => ({
  DialogoPago: () => <div>dialogo-pago</div>,
}));

const cuenta: CuentaPorPagar = {
  compraId: 'c1',
  proveedorId: 'p1',
  sedeId: 's1',
  proveedorNombre: 'Distri88',
  numeroFactura: 'F-001',
  fechaEmision: '2026-07-01',
  fechaVencimiento: '2026-08-08',
  montoTotal: 100,
  totalPagado: 0,
  saldo: 100,
  estado: 'debido',
};

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.actual = { rol: 'administrador', empresaId: 'e1' };
  vi.mocked(servicio.obtenerCuentasPorPagar).mockResolvedValue([cuenta]);
});

function montar() {
  render(
    <MemoryRouter>
      <PantallaCuentasPorPagar />
    </MemoryRouter>,
  );
}

describe('PantallaCuentasPorPagar — gating de gestión', () => {
  it('la gestión ve registrar factura, abonar y planificar pagos', async () => {
    montar();
    await screen.findByText('Distri88');
    expect(screen.getByRole('button', { name: '+ Registrar factura' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Abonar' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Planificar pagos/ })).toBeTruthy();
  });

  it('un EMPLEADO consulta la lista pero sin acciones de gestión', async () => {
    usuarioMock.actual = { rol: 'empleado', empresaId: 'e1' };
    montar();
    await screen.findByText('Distri88'); // la información no se le oculta
    expect(screen.queryByRole('button', { name: '+ Registrar factura' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abonar' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Planificar pagos/ })).toBeNull();
    // Los enlaces de consulta siguen: historial, antigüedad y estado de cuenta.
    expect(screen.getByRole('link', { name: /Historial de pagos/ })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Ver antigüedad/ })).toBeTruthy();
  });
});
