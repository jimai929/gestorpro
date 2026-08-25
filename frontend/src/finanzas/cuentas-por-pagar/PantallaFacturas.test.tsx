/**
 * PantallaFacturas: única pantalla que muestra también las facturas de
 * contado (la vista de CxP las excluye a propósito, nunca generan deuda).
 * Cubre el render mixto contado/crédito — con foco en que la columna
 * Vencimiento no rompa con `fechaVencimiento: null` (contado) — y que el
 * filtro viva en la URL igual que en PantallaCuentasPorPagar.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { PantallaFacturas } from './PantallaFacturas';
import * as servicio from './servicioCuentas';
import type { Factura, Proveedor } from './tipos';

vi.mock('./servicioCuentas');
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));

const facturaContado: Factura = {
  compraId: 'f1',
  proveedorId: 'p1',
  proveedorNombre: 'Distri88',
  sedeId: 's1',
  numeroFactura: 'CONT-1',
  montoTotal: 100,
  tipo: 'contado',
  fechaEmision: '2026-07-01',
  fechaVencimiento: null,
  totalPagado: 100,
  saldo: 0,
  estado: 'pagado',
  creadoEn: '2026-07-01T00:00:00.000Z',
};

const facturaCredito: Factura = {
  compraId: 'f2',
  proveedorId: 'p2',
  proveedorNombre: 'Ferretería XYZ',
  sedeId: 's1',
  numeroFactura: 'CRED-1',
  montoTotal: 200,
  tipo: 'credito',
  fechaEmision: '2026-07-05',
  fechaVencimiento: '2026-08-05',
  totalPagado: 0,
  saldo: 200,
  estado: 'debido',
  creadoEn: '2026-07-05T00:00:00.000Z',
};

const proveedores: Proveedor[] = [
  { id: 'p1', nombre: 'Distri88', identificacionFiscal: null, telefono: null, personaContacto: null, activo: true, creadoEn: '2026-01-01', deudaTotal: 0 },
  { id: 'p2', nombre: 'Ferretería XYZ', identificacionFiscal: null, telefono: null, personaContacto: null, activo: true, creadoEn: '2026-01-01', deudaTotal: 200 },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(servicio.obtenerCompras).mockResolvedValue([facturaCredito, facturaContado]);
  vi.mocked(servicio.obtenerProveedores).mockResolvedValue(proveedores);
});

describe('PantallaFacturas — render mixto contado / crédito', () => {
  it('muestra ambos tipos; la contado no rompe con fechaVencimiento null', async () => {
    render(
      <MemoryRouter>
        <PantallaFacturas />
      </MemoryRouter>,
    );
    await screen.findByText('CONT-1');
    expect(screen.getByText('CRED-1')).toBeTruthy();

    // Tipo en texto plano dentro de la FILA (no badge de color: contado/crédito
    // es categoría, no estado). El mismo texto también existe como <option> del
    // filtro, así que se busca dentro de la fila, no con getByText a secas.
    const filaContado = screen.getByText('CONT-1').closest('tr');
    const filaCredito = screen.getByText('CRED-1').closest('tr');
    expect(filaContado?.textContent).toContain('Contado (pagada en el acto)');
    expect(filaCredito?.textContent).toContain('Crédito (cuenta por pagar)');

    // Punto crítico: contado tiene fechaVencimiento null → '—', no "Invalid Date"
    // ni una excepción de formatearFecha (que no acepta null).
    expect(filaContado?.textContent).toContain('—');
    expect(filaContado?.textContent).not.toContain('Invalid Date');

    // La de crédito sí muestra su fecha de vencimiento formateada.
    expect(filaCredito?.textContent).not.toContain('—');
  });
});

describe('PantallaFacturas — los filtros viven en la URL', () => {
  function SondaUrl() {
    const location = useLocation();
    return <div data-testid="url">{location.search || '(sin)'}</div>;
  }

  it('inicializa tipo/estado desde la URL y los pasa al servicio', async () => {
    render(
      <MemoryRouter initialEntries={['/cuentas-por-pagar/facturas?tipo=contado&estado=pagado']}>
        <PantallaFacturas />
      </MemoryRouter>,
    );
    await screen.findByText('CONT-1');
    expect(vi.mocked(servicio.obtenerCompras)).toHaveBeenCalledWith({
      tipo: 'contado',
      estado: 'pagado',
    });
  });

  it('cambiar un filtro reescribe la URL', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/cuentas-por-pagar/facturas']}>
        <PantallaFacturas />
        <SondaUrl />
      </MemoryRouter>,
    );
    await screen.findByText('CONT-1');
    expect(screen.getByTestId('url').textContent).toBe('(sin)');

    await user.selectOptions(screen.getByLabelText('Tipo'), 'contado');
    expect(screen.getByTestId('url').textContent).toBe('?tipo=contado');
  });

  it('valores inválidos de tipo/estado en la URL caen a "todos" (sin romper)', async () => {
    render(
      <MemoryRouter initialEntries={['/cuentas-por-pagar/facturas?tipo=invalido&estado=invalido']}>
        <PantallaFacturas />
      </MemoryRouter>,
    );
    await screen.findByText('CONT-1');
    expect(vi.mocked(servicio.obtenerCompras)).toHaveBeenCalledWith({});
  });
});

describe('PantallaFacturas — estados de carga, vacío y error', () => {
  it('carga → vacío cuando no hay facturas', async () => {
    vi.mocked(servicio.obtenerCompras).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <PantallaFacturas />
      </MemoryRouter>,
    );
    expect(screen.getByText('Cargando facturas…')).toBeTruthy();
    await screen.findByText('No hay facturas registradas.');
  });

  it('error de carga muestra el mensaje y un botón de reintentar', async () => {
    vi.mocked(servicio.obtenerCompras).mockRejectedValue(new Error('fallo de red'));
    render(
      <MemoryRouter>
        <PantallaFacturas />
      </MemoryRouter>,
    );
    await screen.findByText('fallo de red');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeTruthy();
  });
});
