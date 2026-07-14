import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PantallaPagos } from './PantallaPagos';
import * as servicio from './servicioCuentas';
import * as servicioCorrecciones from '../correcciones/servicioCorrecciones';
import type { PagoHistorial, Proveedor, RespuestaHistorialPagos } from './tipos';

vi.mock('./servicioCuentas');
vi.mock('../correcciones/servicioCorrecciones');
// LayoutPrincipal real usa useAuth/router; passthrough para aislar la pantalla.
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));
// useAuth controlable: el rol decide si se ve la acción de corregir un pago.
const usuarioMock = vi.hoisted(() => ({
  actual: { rol: 'administrador', empresaId: 'e1' } as { rol: string; empresaId: string | null },
}));
vi.mock('../../core/auth/ContextoAuth', () => ({
  useAuth: () => ({ usuario: usuarioMock.actual }),
}));

const proveedorA: Proveedor = {
  id: 'p1', nombre: 'Distribuidora A', identificacionFiscal: null, telefono: null,
  personaContacto: null, activo: true, creadoEn: '2026-01-01', deudaTotal: 0,
};

const base = {
  compraId: 'c1',
  numeroFactura: 'F-001',
  montoFactura: 5000,
  proveedorId: 'p1',
  proveedorNombre: 'Distribuidora A',
  registradoPor: 'Ana Admin',
  creadoEn: '2026-05-10T12:00:00.000Z',
};

const pagoVigente: PagoHistorial = {
  ...base, id: 'pg1', fechaPago: '2026-05-10', monto: 100,
  estado: 'vigente', montoVigente: 100, motivoCorreccion: null,
};
const pagoCorregido: PagoHistorial = {
  ...base, id: 'pg2', fechaPago: '2026-05-11', monto: 200,
  estado: 'corregido', montoVigente: 50, motivoCorreccion: 'Se pagó de más',
};
const pagoAnulado: PagoHistorial = {
  ...base, id: 'pg3', fechaPago: '2026-05-12', monto: 300,
  estado: 'anulado', montoVigente: 0, motivoCorreccion: 'Pago duplicado',
};

const respuesta: RespuestaHistorialPagos = {
  pagos: [pagoAnulado, pagoCorregido, pagoVigente],
  paginacion: { pagina: 1, tamano: 20, total: 3, paginas: 1 },
  resumen: { cantidad: 3, totalOriginal: 600, totalVigente: 150, diferencia: 450 },
};

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.actual = { rol: 'administrador', empresaId: 'e1' };
  vi.mocked(servicio.obtenerProveedores).mockResolvedValue([proveedorA]);
  vi.mocked(servicio.obtenerHistorialPagos).mockResolvedValue(respuesta);
});

function montar() {
  render(
    <MemoryRouter>
      <PantallaPagos />
    </MemoryRouter>,
  );
}

/** Consultas acotadas a la TABLA: el filtro de estado repite esos textos en sus <option>. */
function enTabla() {
  return within(screen.getByRole('table'));
}

describe('PantallaPagos — historial, estado y resumen', () => {
  it('muestra cada pago con su estado y el monto original tachado junto al vigente', async () => {
    montar();
    await screen.findByRole('table');

    expect(enTabla().getByText('Vigente')).toBeTruthy();
    expect(enTabla().getByText('Corregido')).toBeTruthy();
    expect(enTabla().getByText('Anulado')).toBeTruthy();

    // Originales (inmutables) y vigentes conviven: 300/0.00, 200/50, 100/100.
    expect(screen.getByText('B/. 300.00')).toBeTruthy();
    expect(screen.getByText('B/. 0.00')).toBeTruthy(); // anulado vale cero
    expect(screen.getByText('B/. 200.00')).toBeTruthy();
    expect(screen.getByText('B/. 50.00')).toBeTruthy();
    expect(screen.getAllByText('B/. 100.00').length).toBeGreaterThanOrEqual(2); // original + vigente

    // Quién lo registró.
    expect(screen.getAllByText('Ana Admin').length).toBe(3);
  });

  it('el resumen es el del conjunto filtrado completo (no el de la página)', async () => {
    montar();
    await screen.findByRole('table');
    expect(screen.getByText('B/. 600.00')).toBeTruthy(); // total registrado
    expect(screen.getByText('B/. 150.00')).toBeTruthy(); // total vigente
    expect(screen.getByText('B/. 450.00')).toBeTruthy(); // corregido / anulado
  });

  it('un pago ya corregido o anulado no ofrece el botón Corregir (una sola corrección)', async () => {
    montar();
    await screen.findByRole('table');
    expect(screen.getAllByRole('button', { name: 'Corregir' }).length).toBe(1);
    // Las filas ya corregidas/anuladas enlazan a la auditoría (el motivo va en el title).
    const enlaces = screen.getAllByRole('link', { name: 'Ver auditoría' });
    expect(enlaces.length).toBe(2);
    expect(enlaces.some((a) => a.getAttribute('title') === 'Se pagó de más')).toBe(true);
    expect(enlaces.some((a) => a.getAttribute('title') === 'Pago duplicado')).toBe(true);
  });

  it('un EMPLEADO ve el historial y los estados, pero NO la acción de corregir', async () => {
    usuarioMock.actual = { rol: 'empleado', empresaId: 'e1' };
    montar();
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Corregir' })).toBeNull();
    expect(enTabla().getByText('Corregido')).toBeTruthy();
  });

  it('si la carga falla, el error es visible y se puede reintentar', async () => {
    vi.mocked(servicio.obtenerHistorialPagos).mockRejectedValueOnce(new Error('Backend caído'));
    const user = userEvent.setup();
    montar();

    expect(await screen.findByText('Backend caído')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeTruthy();
  });
});

describe('PantallaPagos — filtros', () => {
  it('filtrar por estado y por proveedor consulta al backend; limpiar los quita', async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByRole('table');

    await user.selectOptions(screen.getByLabelText('Estado'), 'anulado');
    await waitFor(() =>
      expect(servicio.obtenerHistorialPagos).toHaveBeenCalledWith(
        expect.objectContaining({ estado: 'anulado', pagina: 1 }),
      ),
    );

    await user.selectOptions(screen.getByLabelText('Proveedor'), 'p1');
    await waitFor(() =>
      expect(servicio.obtenerHistorialPagos).toHaveBeenCalledWith(
        expect.objectContaining({ estado: 'anulado', proveedorId: 'p1' }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => {
      const ultima = vi.mocked(servicio.obtenerHistorialPagos).mock.calls.at(-1)?.[0];
      expect(ultima).toEqual({ pagina: 1, tamano: 20 });
    });
  });
});

describe('PantallaPagos — corrección de un pago', () => {
  it('corrige con el monto VIGENTE por defecto, avisa y recarga el historial', async () => {
    vi.mocked(servicioCorrecciones.corregirMovimiento).mockResolvedValue({
      reverso: { id: 'r1', tipo: 'reverso' },
      correccion: { id: 'c1', tipo: 'correccion' },
    });
    const user = userEvent.setup();
    montar();
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Corregir' }));
    // El diálogo arranca con el monto vigente del pago (100), no con otro valor.
    expect((screen.getByRole('spinbutton') as HTMLInputElement).value).toBe('100');

    const monto = screen.getByRole('spinbutton');
    await user.clear(monto);
    await user.type(monto, '80');
    await user.type(screen.getByLabelText('Motivo *'), 'Se pagó 20 de más');
    await user.click(screen.getByRole('button', { name: 'Registrar corrección' }));

    await waitFor(() =>
      expect(servicioCorrecciones.corregirMovimiento).toHaveBeenCalledWith({
        entidad: 'pago',
        movimientoId: 'pg1',
        motivo: 'Se pagó 20 de más',
        montoCorregido: 80,
      }),
    );
    expect(
      await screen.findByText(
        'Corrección registrada: el pago quedó corregido y la deuda de la factura se recalculó.',
      ),
    ).toBeTruthy();
    // Recarga: carga inicial + refresco tras corregir.
    await waitFor(() => expect(servicio.obtenerHistorialPagos).toHaveBeenCalledTimes(2));
  });

  it('ANULAR no envía ningún montoCorregido (anulación pura)', async () => {
    vi.mocked(servicioCorrecciones.corregirMovimiento).mockResolvedValue({
      reverso: { id: 'r1', tipo: 'reverso' },
      correccion: null,
    });
    const user = userEvent.setup();
    montar();
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Corregir' }));
    await user.click(screen.getByRole('radio', { name: /anular el movimiento/i }));
    await user.type(screen.getByLabelText('Motivo *'), 'Pago que no existió');
    await user.click(screen.getByRole('button', { name: 'Anular movimiento' }));

    await waitFor(() =>
      expect(servicioCorrecciones.corregirMovimiento).toHaveBeenCalledWith({
        entidad: 'pago',
        movimientoId: 'pg1',
        motivo: 'Pago que no existió',
      }),
    );
  });

  it('si el backend rechaza (409 / sobrepago), el error se ve en el diálogo y NO se recarga', async () => {
    vi.mocked(servicioCorrecciones.corregirMovimiento).mockRejectedValue(
      new Error('La corrección excede el saldo de la factura.'),
    );
    const user = userEvent.setup();
    montar();
    await screen.findByRole('table');

    await user.click(screen.getByRole('button', { name: 'Corregir' }));
    await user.type(screen.getByLabelText('Motivo *'), 'Monto mal tecleado');
    await user.click(screen.getByRole('button', { name: 'Registrar corrección' }));

    expect(await screen.findByText('La corrección excede el saldo de la factura.')).toBeTruthy();
    // Ni aviso de éxito ni recarga: la corrección NO ocurrió, el diálogo sigue abierto.
    expect(screen.queryByText(/Corrección registrada/)).toBeNull();
    expect(servicio.obtenerHistorialPagos).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Registrar corrección' })).toBeTruthy();
  });
});
