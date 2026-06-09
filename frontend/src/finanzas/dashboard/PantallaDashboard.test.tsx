import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
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
