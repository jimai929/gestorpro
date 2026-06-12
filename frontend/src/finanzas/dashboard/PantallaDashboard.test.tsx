import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PantallaDashboard } from './PantallaDashboard';
import * as servicio from './servicioDashboard';
import type { Sede, ResumenGanancia, VentaDiaria } from './tipos';

vi.mock('./servicioDashboard');
// El LayoutPrincipal real usa useAuth (ContextoAuth); la pantalla bajo prueba no lo
// necesita, así que se sustituye por un passthrough para no montar ese contexto.
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));
// El cierre que "registra" el formulario simulado (H3): su cajera no estaba antes en el filtro.
const ventaNueva = vi.hoisted(() => ({
  id: 'v-nueva',
  sedeId: 'sa',
  fechaOperacion: '2026-06-01',
  turno: 'manana' as const,
  cajera: 'E009 - Nueva',
  cerradoPor: 'E002 - Luis',
  horaApertura: null,
  horaCierre: null,
  monto: 250,
  tipo: 'normal',
  detalles: [],
}));
// Sustituye el formulario real por un disparador de onRegistrada, para aislar
// el comportamiento de manejarVentaRegistrada sin teclear todo el cierre.
vi.mock('./FormularioVenta', () => ({
  FormularioVenta: ({ onRegistrada }: { onRegistrada: (v: VentaDiaria) => void }) => (
    <button type="button" onClick={() => onRegistrada(ventaNueva)}>simular-registro</button>
  ),
}));

const sedeA: Sede = {
  id: 'sa', nombre: 'Sede A', activo: true, modoExcepcion: 'pin', creadoEn: '2026-01-01',
};
const resumen: ResumenGanancia = {
  desde: '2026-06-01', hasta: '2026-06-30', ventas: 100, compras: 0, gastos: 0, ganancia: 100,
};
// Cierre cuya sede NO se podrá resolver: el sedeId es un UUID que no debe filtrarse a la UI.
const ventaUuidCrudo: VentaDiaria = {
  id: 'v1',
  sedeId: '11111111-2222-3333-4444-555555555555',
  fechaOperacion: '2026-06-01',
  turno: 'manana',
  cajera: 'E001 - María',
  cerradoPor: 'E002 - Luis',
  horaApertura: null,
  horaCierre: null,
  monto: 100,
  tipo: 'normal',
  detalles: [],
};

beforeEach(() => {
  // Limpia el historial de llamadas entre tests (B2): la config del proyecto no
  // activa clearMocks y las implementaciones se re-fijan justo debajo.
  vi.clearAllMocks();
  vi.mocked(servicio.obtenerSedes).mockResolvedValue([sedeA]);
  vi.mocked(servicio.obtenerCajeras).mockResolvedValue([]);
  vi.mocked(servicio.obtenerGanancia).mockResolvedValue(resumen);
  vi.mocked(servicio.obtenerGastosPorCategoria).mockResolvedValue([]);
  vi.mocked(servicio.obtenerVentas).mockResolvedValue([]);
});

function montar() {
  render(
    <MemoryRouter>
      <PantallaDashboard />
    </MemoryRouter>,
  );
}

describe('PantallaDashboard — la columna Sede no expone el UUID si fallan las sedes (H4)', () => {
  it('si obtenerSedes falla, la celda Sede muestra un fallback legible, no el sedeId crudo', async () => {
    vi.mocked(servicio.obtenerSedes).mockRejectedValue(new Error('boom'));
    vi.mocked(servicio.obtenerVentas).mockResolvedValue([ventaUuidCrudo]);
    montar();

    await screen.findByText('Sede no disponible'); // la fila usa el fallback…
    expect(screen.queryByText(/11111111-2222/)).toBeNull(); // …y nunca el UUID crudo
  });
});

describe('PantallaDashboard — el filtro Sede es simétrico con Cajera en estado vacío (H5)', () => {
  it('si obtenerSedes resuelve vacío, el grupo de filtro Sede sigue visible con estado vacío', async () => {
    vi.mocked(servicio.obtenerSedes).mockResolvedValue([]);
    montar();

    // Muestra el estado vacío (igual que el filtro de cajeras): el grupo NO se oculta.
    await screen.findByText(/aún no hay sedes registradas/i);
    expect(screen.getByLabelText('Sede')).toBeTruthy();
  });
});

describe('PantallaDashboard — tras registrar un cierre se refresca el filtro de cajeras (H3)', () => {
  it('la nueva cajera del cierre registrado aparece en el filtro sin recargar la página', async () => {
    // Setup EXPLÍCITO de obtenerCajeras en el caso (mockReset descarta el default de beforeEach
    // para que la cola Once no se vea afectada): 1ª carga (al montar) solo María; 2ª carga (tras
    // registrar, vía cargarCajeras) añade la nueva. El 3er valor es un tope por si hubiera cargas extra.
    vi.mocked(servicio.obtenerCajeras).mockReset();
    vi.mocked(servicio.obtenerCajeras)
      .mockResolvedValueOnce(['E001 - María'])
      .mockResolvedValueOnce(['E001 - María', 'E009 - Nueva'])
      .mockResolvedValue(['E001 - María', 'E009 - Nueva']);
    const user = userEvent.setup();
    montar();

    // Estado inicial del filtro: solo María (consumió el 1.er valor de la cola).
    await screen.findByRole('option', { name: 'E001 - María' });
    expect(screen.queryByRole('option', { name: 'E009 - Nueva' })).toBeNull();

    // Abrir el formulario y simular el registro de un cierre con una cajera nueva.
    await user.click(screen.getByRole('button', { name: /registrar cierre del día/i }));
    await user.click(await screen.findByRole('button', { name: /simular-registro/i }));

    // manejarVentaRegistrada llama cargarCajeras (async): la nueva cajera aparece en el filtro.
    // findByRole espera al re-render tras resolver la 2.ª carga; con getByRole síncrono fallaría.
    await screen.findByRole('option', { name: 'E009 - Nueva' });
  });
});
