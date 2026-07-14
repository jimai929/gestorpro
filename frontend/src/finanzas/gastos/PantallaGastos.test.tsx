import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PantallaGastos } from './PantallaGastos';
import * as servicioGastos from './servicioGastos';
import * as servicioCorrecciones from '../correcciones/servicioCorrecciones';
import type { Gasto } from './tipos';

vi.mock('./servicioGastos');
vi.mock('../correcciones/servicioCorrecciones');
// LayoutPrincipal real usa useAuth/router; passthrough para aislar la pantalla.
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));
// El formulario de alta no participa en estos casos: se aísla.
vi.mock('./FormularioGasto', () => ({
  FormularioGasto: () => null,
}));
// useAuth controlable: el rol decide si se ve la acción de corregir dinero.
const usuarioMock = vi.hoisted(() => ({
  actual: { rol: 'administrador', empresaId: 'e1' } as { rol: string; empresaId: string | null },
}));
vi.mock('../../core/auth/ContextoAuth', () => ({
  useAuth: () => ({ usuario: usuarioMock.actual }),
}));

const base = {
  sedeId: 'sa',
  fechaOperacion: '2026-06-10',
  empleadoId: null,
  tipoPago: null,
  tipo: 'normal',
  categoria: { nombre: 'Alquiler', esPagoEmpleado: false },
};

const gastoVigente: Gasto = {
  ...base,
  id: 'g1',
  categoriaId: 'c1',
  monto: 150,
  descripcion: 'Local centro',
  estado: 'vigente',
  montoVigente: 150,
  motivoCorreccion: null,
};
const gastoCorregido: Gasto = {
  ...base,
  id: 'g2',
  categoriaId: 'c1',
  monto: 150,
  descripcion: 'Tecleado de más',
  estado: 'corregido',
  montoVigente: 15,
  motivoCorreccion: 'Se tecleó 150 en vez de 15',
};
const gastoAnulado: Gasto = {
  ...base,
  id: 'g3',
  categoriaId: 'c1',
  monto: 80,
  descripcion: 'Duplicado',
  estado: 'anulado',
  montoVigente: 0,
  motivoCorreccion: 'Gasto duplicado',
};

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.actual = { rol: 'administrador', empresaId: 'e1' };
  vi.mocked(servicioGastos.obtenerEmpleados).mockResolvedValue([]);
  vi.mocked(servicioGastos.obtenerGastos).mockResolvedValue([
    gastoVigente,
    gastoCorregido,
    gastoAnulado,
  ]);
});

function montar() {
  render(
    <MemoryRouter>
      <PantallaGastos />
    </MemoryRouter>,
  );
}

describe('PantallaGastos — estado de corrección de cada gasto', () => {
  it('muestra el estado y, en los corregidos, el monto original tachado junto al vigente', async () => {
    montar();
    await screen.findByText('Local centro');

    expect(screen.getByText('Vigente')).toBeTruthy();
    expect(screen.getByText('Corregido')).toBeTruthy();
    expect(screen.getByText('Anulado')).toBeTruthy();

    // El original NUNCA se sobrescribe: el gasto corregido muestra los dos montos.
    expect(screen.getAllByText('B/. 150.00').length).toBe(2); // vigente + original del corregido
    expect(screen.getByText('B/. 15.00')).toBeTruthy(); // monto vigente del corregido
    expect(screen.getByText('B/. 0.00')).toBeTruthy(); // el anulado vale 0
  });

  it('el total del período usa el monto VIGENTE (anulado = 0, corregido = su importe)', async () => {
    montar();
    await screen.findByText('Local centro');
    // 150 (vigente) + 15 (corregido) + 0 (anulado) = 165 — NO 380 (suma de originales).
    expect(screen.getByText('B/. 165.00')).toBeTruthy();
  });

  it('un gasto ya corregido no ofrece el botón Corregir (una sola corrección)', async () => {
    montar();
    await screen.findByText('Local centro');
    // Solo el gasto vigente tiene botón.
    expect(screen.getAllByRole('button', { name: 'Corregir' }).length).toBe(1);
    // Las filas ya corregidas/anuladas enlazan a la auditoría (el motivo va en el title).
    const enlaces = screen.getAllByRole('link', { name: 'Ver auditoría' });
    expect(enlaces.length).toBe(2);
    expect(enlaces.some((a) => a.getAttribute('title') === 'Se tecleó 150 en vez de 15')).toBe(true);
    expect(enlaces.some((a) => a.getAttribute('title') === 'Gasto duplicado')).toBe(true);
  });

  it('un EMPLEADO no ve la acción de corregir (el backend la limita a supervisor/admin)', async () => {
    usuarioMock.actual = { rol: 'empleado', empresaId: 'e1' };
    montar();
    await screen.findByText('Local centro');
    expect(screen.queryByRole('button', { name: 'Corregir' })).toBeNull();
    // Pero sí ve el estado: la información no se le oculta.
    expect(screen.getByText('Corregido')).toBeTruthy();
  });
});

describe('PantallaGastos — flujo de corrección', () => {
  it('corregir un gasto llama al backend, avisa y recarga la lista', async () => {
    vi.mocked(servicioCorrecciones.corregirMovimiento).mockResolvedValue({
      reverso: { id: 'r1', tipo: 'reverso' },
      correccion: { id: 'c1', tipo: 'correccion' },
    });
    const user = userEvent.setup();
    montar();
    await screen.findByText('Local centro');

    await user.click(screen.getByRole('button', { name: 'Corregir' }));
    const monto = screen.getByRole('spinbutton');
    await user.clear(monto);
    await user.type(monto, '120');
    await user.type(screen.getByLabelText('Motivo *'), 'Factura real: 120');
    await user.click(screen.getByRole('button', { name: 'Registrar corrección' }));

    await waitFor(() =>
      expect(servicioCorrecciones.corregirMovimiento).toHaveBeenCalledWith({
        entidad: 'gasto',
        movimientoId: 'g1',
        motivo: 'Factura real: 120',
        montoCorregido: 120,
      }),
    );
    // Aviso de éxito + recarga (carga inicial + recarga tras corregir).
    expect(await screen.findByText('Corrección registrada: el movimiento quedó corregido.')).toBeTruthy();
    await waitFor(() => expect(servicioGastos.obtenerGastos).toHaveBeenCalledTimes(2));
  });

  it('si el backend rechaza la corrección, el diálogo sigue abierto con el error y NO recarga', async () => {
    vi.mocked(servicioCorrecciones.corregirMovimiento).mockRejectedValue(
      new Error('El movimiento ya fue corregido: no admite una segunda corrección.'),
    );
    const user = userEvent.setup();
    montar();
    await screen.findByText('Local centro');

    await user.click(screen.getByRole('button', { name: 'Corregir' }));
    await user.type(screen.getByLabelText('Motivo *'), 'Otro intento');
    await user.click(screen.getByRole('button', { name: 'Registrar corrección' }));

    expect(
      await screen.findByText('El movimiento ya fue corregido: no admite una segunda corrección.'),
    ).toBeTruthy();
    // Ni aviso de éxito ni recarga: la corrección NO ocurrió.
    expect(screen.queryByText('Corrección registrada: el movimiento quedó corregido.')).toBeNull();
    expect(servicioGastos.obtenerGastos).toHaveBeenCalledTimes(1);
  });
});
