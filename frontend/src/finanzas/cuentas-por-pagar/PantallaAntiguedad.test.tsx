import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PantallaAntiguedad } from './PantallaAntiguedad';
import { construirCsvAntiguedad } from './csvAntiguedad';
import * as servicio from './servicioCuentas';
import type { RespuestaAntiguedad } from './antiguedad-tipos';

vi.mock('./servicioCuentas');
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));

const respuesta: RespuestaAntiguedad = {
  proveedores: [
    {
      proveedorId: 'p1', nombre: 'Distribuidora A', identificacionFiscal: 'RUC-1',
      deudaTotal: 700, cantidadFacturas: 2,
      deuda0a30: 100, deuda31a60: 0, deuda61a90: 0, deuda90Mas: 600,
      facturaMasAntiguaFecha: '2026-01-01', facturaMasAntiguaDias: 120,
    },
    {
      proveedorId: 'p2', nombre: 'Distribuidora B', identificacionFiscal: null,
      deudaTotal: 300, cantidadFacturas: 1,
      deuda0a30: 0, deuda31a60: 300, deuda61a90: 0, deuda90Mas: 0,
      facturaMasAntiguaFecha: '2026-03-25', facturaMasAntiguaDias: 37,
    },
  ],
  facturas: [
    {
      compraId: 'c1', numeroFactura: 'F-001', proveedorId: 'p1', proveedorNombre: 'Distribuidora A',
      fechaCompra: '2026-01-01', diasAntiguedad: 120, tramo: 'dias_90_mas',
      montoOriginal: 600, pagosVigentes: 0, saldoPendiente: 600, ultimoPago: null,
    },
    {
      compraId: 'c3', numeroFactura: 'F-003', proveedorId: 'p2', proveedorNombre: 'Distribuidora B',
      fechaCompra: '2026-03-25', diasAntiguedad: 37, tramo: 'dias_31_60',
      montoOriginal: 500, pagosVigentes: 200, saldoPendiente: 300, ultimoPago: '2026-04-01',
    },
    {
      compraId: 'c2', numeroFactura: 'F-002', proveedorId: 'p1', proveedorNombre: 'Distribuidora A',
      fechaCompra: '2026-04-20', diasAntiguedad: 11, tramo: 'dias_0_30',
      montoOriginal: 100, pagosVigentes: 0, saldoPendiente: 100, ultimoPago: null,
    },
  ],
  paginacion: { pagina: 1, tamano: 20, total: 3, paginas: 1 },
  resumen: {
    deudaTotal: 1000, cantidadFacturasPendientes: 3, cantidadProveedores: 2,
    deuda0a30: 100, deuda31a60: 300, deuda61a90: 0, deuda90Mas: 600,
    pct0a30: 10, pct31a60: 30, pct61a90: 0, pct90Mas: 60,
    cant0a30: 1, cant31a60: 1, cant61a90: 0, cant90Mas: 1,
    deudaMasAntiguaDias: 120,
    proveedorMayorDeuda: { id: 'p1', nombre: 'Distribuidora A', deuda: 700 },
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(servicio.obtenerProveedores).mockResolvedValue([]);
  vi.mocked(servicio.obtenerAntiguedad).mockResolvedValue(respuesta);
});

function montar(ruta = '/cuentas-por-pagar/antiguedad') {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <PantallaAntiguedad />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('PantallaAntiguedad — resumen, distribución y aviso', () => {
  it('muestra el aviso de que la antigüedad NO es mora contractual', async () => {
    montar();
    await screen.findByText('Distribuidora A', { selector: 'button' });
    expect(screen.getByText(/no es mora contractual/i)).toBeTruthy();
  });

  it('el resumen refleja el conjunto completo (deuda, facturas, proveedores, más antigua)', async () => {
    montar();
    await screen.findByText('Distribuidora A', { selector: 'button' });
    expect(screen.getByText('B/. 1000.00')).toBeTruthy(); // deuda total
    expect(screen.getAllByText('120 días').length).toBeGreaterThan(0); // más antigua
    // Mayor deudor.
    expect(screen.getByText(/Distribuidora A \(B\/\. 700\.00\)/)).toBeTruthy();
  });

  it('reparte la deuda por tramo con monto, % y cantidad (no solo color)', async () => {
    montar();
    await screen.findByText('Distribuidora A', { selector: 'button' });
    // Leyenda: 90+ = B/. 600.00, 60%, 1 factura.
    expect(screen.getAllByText('B/. 600.00').length).toBeGreaterThan(0);
    expect(screen.getByText(/60% · 1 facturas/)).toBeTruthy();
  });
});

describe('PantallaAntiguedad — facturas y saldo', () => {
  it('lista cada compra pendiente con original, pagos vigentes y saldo; marca 90+', async () => {
    montar();
    await screen.findByText('Distribuidora A', { selector: 'button' });

    const tablas = screen.getAllByRole('table');
    const tablaFacturas = within(tablas[tablas.length - 1]!); // la última es la de facturas
    // La factura vieja: saldo 600, marca +90d.
    expect(tablaFacturas.getByText('F-001')).toBeTruthy();
    expect(tablaFacturas.getByText('+90d')).toBeTruthy();
    // La factura con pago parcial: original 500, pagos 200, saldo 300.
    expect(tablaFacturas.getByText('F-003')).toBeTruthy();
    expect(tablaFacturas.getByText('B/. 200.00')).toBeTruthy();
    expect(tablaFacturas.getByText('B/. 300.00')).toBeTruthy();
  });
});

describe('PantallaAntiguedad — filtros en la URL', () => {
  it('un ?tramo= de la URL se envía al backend (se conserva al recargar)', async () => {
    montar('/cuentas-por-pagar/antiguedad?tramo=dias_90_mas');
    await waitFor(() =>
      expect(servicio.obtenerAntiguedad).toHaveBeenCalledWith(
        expect.objectContaining({ tramo: 'dias_90_mas' }),
      ),
    );
  });

  it('pulsar un tramo de la leyenda filtra por ese tramo', async () => {
    const user = montar();
    await screen.findByText('Distribuidora A', { selector: 'button' });

    // Pulsa la leyenda "Más de 90 días".
    const leyenda = screen.getAllByText('Más de 90 días')[0]!;
    await user.click(leyenda.closest('button')!);

    await waitFor(() =>
      expect(servicio.obtenerAntiguedad).toHaveBeenCalledWith(
        expect.objectContaining({ tramo: 'dias_90_mas' }),
      ),
    );
  });

  it('pulsar un proveedor del ranking filtra las facturas por ese proveedor', async () => {
    const user = montar();
    const btnProveedor = await screen.findByRole('button', { name: 'Distribuidora A' });
    await user.click(btnProveedor);
    await waitFor(() =>
      expect(servicio.obtenerAntiguedad).toHaveBeenCalledWith(
        expect.objectContaining({ proveedorId: 'p1' }),
      ),
    );
  });

  it('si falla, muestra error y permite reintentar', async () => {
    vi.mocked(servicio.obtenerAntiguedad).mockRejectedValueOnce(new Error('Backend caído'));
    const user = montar();
    expect(await screen.findByText('Backend caído')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Distribuidora A', { selector: 'button' })).toBeTruthy();
  });
});

describe('PantallaAntiguedad — imprimir y CSV', () => {
  it('"Imprimir / Guardar PDF" llama al print del navegador', async () => {
    const imprimir = vi.fn();
    vi.stubGlobal('print', imprimir);
    const user = montar();
    await screen.findByText('Distribuidora A', { selector: 'button' });
    await user.click(screen.getByRole('button', { name: /imprimir \/ guardar pdf/i }));
    expect(imprimir).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('"Exportar CSV" pide el conjunto completo (tamaño grande) y descarga', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:fake'), revokeObjectURL: vi.fn() });
    const clicks: HTMLAnchorElement[] = [];
    const clickOriginal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this as HTMLAnchorElement); };

    const user = montar();
    await screen.findByText('Distribuidora A', { selector: 'button' });
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    await waitFor(() => expect(clicks.length).toBe(1));
    const exportCall = vi.mocked(servicio.obtenerAntiguedad).mock.calls.at(-1)?.[0];
    expect(exportCall?.tamano).toBeGreaterThan(100);
    expect(clicks[0]!.download).toContain('antiguedad-cuentas-por-pagar');

    HTMLAnchorElement.prototype.click = clickOriginal;
    vi.unstubAllGlobals();
  });
});

describe('CSV de antigüedad', () => {
  const t = (clave: string) => clave;

  it('incluye el resumen por proveedor y todas las facturas pendientes', () => {
    const csv = construirCsvAntiguedad(respuesta.proveedores, respuesta.facturas, t);
    // Bloque proveedores.
    expect(csv).toContain('Distribuidora A');
    expect(csv).toContain('700.00');
    expect(csv).toContain('RUC-1');
    // Bloque facturas: las tres.
    expect(csv).toContain('F-001');
    expect(csv).toContain('F-002');
    expect(csv).toContain('F-003');
    expect(csv).toContain('600.00'); // saldo de la vieja
    expect(csv).toContain('200.00'); // pagos vigentes de F-003
    // Separador ; y comillas.
    expect(csv.split('\r\n')[1]).toContain(';');
    expect(csv.split('\r\n')[1]).toContain('"');
  });
});
