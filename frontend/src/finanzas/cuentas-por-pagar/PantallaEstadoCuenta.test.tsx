import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PantallaEstadoCuenta } from './PantallaEstadoCuenta';
import { construirCsvEstadoCuenta, nombreArchivoCsv } from './csvEstadoCuenta';
import * as servicio from './servicioCuentas';
import type { EstadoCuentaProveedor, Proveedor } from './tipos';

vi.mock('./servicioCuentas');
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));
vi.mock('../../core/auth/ContextoAuth', () => ({
  useAuth: () => ({ usuario: { rol: 'administrador', empresaId: 'e1' } }),
}));

const proveedorA: Proveedor = {
  id: 'p1', nombre: 'Distribuidora A', identificacionFiscal: '8-123-456', telefono: '6000-0000',
  personaContacto: 'Luis', activo: true, creadoEn: '2026-01-01', deudaTotal: 0,
};

/** Saldo inicial 600, compra 500, pago 200 (vigente) y pago 250 anulado. */
const estado: EstadoCuentaProveedor = {
  empresa: { id: 'e1', nombre: 'Acme Panamá' },
  proveedor: {
    id: 'p1', nombre: 'Distribuidora A', identificacionFiscal: '8-123-456',
    telefono: '6000-0000', personaContacto: 'Luis',
  },
  periodo: { desde: '2026-04-01', hasta: '2026-04-30' },
  saldoInicial: 600,
  movimientos: [
    {
      fecha: '2026-04-10', tipo: 'compra', documento: 'F-001',
      concepto: 'Factura de compra a crédito', debito: 500, credito: 0, saldo: 1100,
      compraId: 'c1', pagoId: null, estado: null, motivoCorreccion: null,
      registradoPor: null, creadoEn: '2026-04-10T00:00:00.000Z',
    },
    {
      fecha: '2026-04-20', tipo: 'pago', documento: 'F-001', concepto: 'Pago a proveedor',
      debito: 0, credito: 200, saldo: 900, compraId: 'c1', pagoId: 'pg1',
      estado: 'vigente', motivoCorreccion: null, registradoPor: 'Ana Admin',
      creadoEn: '2026-04-20T00:00:00.000Z',
    },
    {
      fecha: '2026-04-25', tipo: 'anulacion_pago', documento: 'F-001',
      concepto: 'Pago anulado (se registró B/. 250.00)', debito: 0, credito: 0, saldo: 900,
      compraId: 'c1', pagoId: 'pg2', estado: 'anulado', motivoCorreccion: 'Pago duplicado',
      registradoPor: 'Ana Admin', creadoEn: '2026-04-25T00:00:00.000Z',
    },
  ],
  resumen: { compras: 500, pagos: 200, correccionesAnulaciones: 250, movimientos: 3 },
  saldoFinal: 900,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(servicio.obtenerProveedores).mockResolvedValue([proveedorA]);
  vi.mocked(servicio.obtenerEstadoCuenta).mockResolvedValue(estado);
});

function montar() {
  render(
    <MemoryRouter>
      <PantallaEstadoCuenta />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

/** Rellena proveedor + período y pulsa Generar. */
async function generar(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(await screen.findByLabelText('Proveedor'), 'p1');
  await user.type(screen.getByLabelText('Desde'), '2026-04-01');
  await user.type(screen.getByLabelText('Hasta'), '2026-04-30');
  await user.click(screen.getByRole('button', { name: 'Generar estado de cuenta' }));
  await screen.findByRole('table');
}

describe('PantallaEstadoCuenta — generación', () => {
  it('sin proveedor NO consulta al backend (el botón está deshabilitado)', async () => {
    montar();
    await screen.findByLabelText('Proveedor');
    expect(
      (screen.getByRole('button', { name: 'Generar estado de cuenta' }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
    expect(servicio.obtenerEstadoCuenta).not.toHaveBeenCalled();
  });

  it('genera el documento con cabecera, saldo inicial, movimientos y saldo final', async () => {
    const user = montar();
    await generar(user);

    expect(servicio.obtenerEstadoCuenta).toHaveBeenCalledWith({
      proveedorId: 'p1', desde: '2026-04-01', hasta: '2026-04-30',
    });

    // Cabecera del documento: empresa + proveedor (el nombre también está en el
    // <option> del selector, de ahí el getAllByText).
    expect(screen.getByText('Acme Panamá')).toBeTruthy();
    expect(screen.getAllByText('Distribuidora A').length).toBeGreaterThanOrEqual(1);

    const tabla = within(screen.getByRole('table'));
    // Saldo inicial (NO cero) y saldo final, siempre presentes.
    expect(tabla.getAllByText('Saldo inicial').length).toBeGreaterThan(0);
    expect(tabla.getByText('B/. 600.00')).toBeTruthy();
    expect(tabla.getAllByText('Saldo final').length).toBeGreaterThan(0);
    expect(tabla.getAllByText('B/. 900.00').length).toBe(3); // 2 saldos corrientes + final

    // Compra en débito, pago en crédito.
    expect(tabla.getByText('B/. 500.00')).toBeTruthy();
    expect(tabla.getByText('B/. 200.00')).toBeTruthy();
    expect(tabla.getByText('B/. 1100.00')).toBeTruthy(); // saldo tras la compra

    // El pago anulado sigue VISIBLE con su badge y su motivo, sin descontar.
    expect(tabla.getByText('Anulado')).toBeTruthy();
    expect(tabla.getByText('Pago duplicado')).toBeTruthy();
  });

  it('si falla, muestra el error y permite reintentar', async () => {
    vi.mocked(servicio.obtenerEstadoCuenta).mockRejectedValueOnce(new Error('Backend caído'));
    const user = montar();
    await user.selectOptions(await screen.findByLabelText('Proveedor'), 'p1');
    await user.type(screen.getByLabelText('Desde'), '2026-04-01');
    await user.type(screen.getByLabelText('Hasta'), '2026-04-30');
    await user.click(screen.getByRole('button', { name: 'Generar estado de cuenta' }));

    expect(await screen.findByText('Backend caído')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeTruthy();
  });

  it('cambiar un filtro marca el informe visible como desactualizado (no se confunde con el nuevo)', async () => {
    const user = montar();
    await generar(user);
    expect(screen.queryByText(/el estado de cuenta que se muestra abajo es el ANTERIOR/i)).toBeNull();

    await user.clear(screen.getByLabelText('Hasta'));
    await user.type(screen.getByLabelText('Hasta'), '2026-05-31');

    expect(
      await screen.findByText(/el estado de cuenta que se muestra abajo es el ANTERIOR/i),
    ).toBeTruthy();
    // El documento anterior sigue en pantalla (no se borra), pero avisado.
    expect(screen.getByRole('table')).toBeTruthy();
  });
});

describe('PantallaEstadoCuenta — imprimir y exportar', () => {
  it('"Imprimir / Guardar PDF" llama al flujo de impresión del navegador', async () => {
    const imprimir = vi.fn();
    vi.stubGlobal('print', imprimir);
    const user = montar();
    await generar(user);

    await user.click(screen.getByRole('button', { name: /imprimir \/ guardar pdf/i }));
    expect(imprimir).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('"Exportar CSV" descarga un archivo con el proveedor y el rango en el nombre', async () => {
    const crearUrl = vi.fn(() => 'blob:fake');
    const revocar = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL: crearUrl, revokeObjectURL: revocar });
    const clicks: HTMLAnchorElement[] = [];
    const clickOriginal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      clicks.push(this as HTMLAnchorElement);
    };

    const user = montar();
    await generar(user);
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    await waitFor(() => expect(clicks.length).toBe(1));
    expect(clicks[0]!.download).toBe(
      'estado-cuenta-distribuidora-a-2026-04-01-a-2026-04-30.csv',
    );
    expect(crearUrl).toHaveBeenCalled();
    expect(revocar).toHaveBeenCalled();

    HTMLAnchorElement.prototype.click = clickOriginal;
    vi.unstubAllGlobals();
  });
});

describe('CSV del estado de cuenta', () => {
  // El CSV se construye con el ESTADO COMPLETO, no con lo que se ve en pantalla.
  const t = (clave: string) => clave; // claves crudas: se comprueban los datos, no la traducción

  it('incluye cabecera, saldo inicial, TODOS los movimientos y saldo final', () => {
    const csv = construirCsvEstadoCuenta(estado, t);

    expect(csv).toContain('Acme Panamá');
    expect(csv).toContain('Distribuidora A');
    expect(csv).toContain('2026-04-01 / 2026-04-30');
    expect(csv).toContain('600.00'); // saldo inicial
    expect(csv).toContain('900.00'); // saldo final
    // Los tres movimientos, con sus importes y saldos corrientes.
    expect(csv).toContain('Factura de compra a crédito');
    expect(csv).toContain('500.00');
    expect(csv).toContain('Pago a proveedor');
    expect(csv).toContain('200.00');
    expect(csv).toContain('Pago anulado (se registró B/. 250.00)');
    expect(csv).toContain('Pago duplicado');
    expect(csv).toContain('1100.00');
    // Separador ; y comillas de texto (Excel en español).
    expect(csv.split('\r\n')[0]).toContain('"');
  });

  it('el nombre de archivo lleva proveedor normalizado y rango', () => {
    expect(nombreArchivoCsv(estado)).toBe(
      'estado-cuenta-distribuidora-a-2026-04-01-a-2026-04-30.csv',
    );
  });
});
