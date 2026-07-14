import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PantallaSedes } from './PantallaSedes';
import * as servicio from './servicioSedes';
import type { Sede } from './tipos';

vi.mock('./servicioSedes');
// LayoutPrincipal real usa useAuth/router; passthrough para aislar la pantalla.
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));

const sedeCentro: Sede = {
  id: 'sa', nombre: 'Sede Centro', activo: true, modoExcepcion: 'pin', creadoEn: '2026-01-01',
};
const sedeNorte: Sede = {
  id: 'sb', nombre: 'Sede Norte', activo: true, modoExcepcion: 'supervisor', creadoEn: '2026-01-01',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(servicio.obtenerSedes).mockResolvedValue([sedeCentro, sedeNorte]);
});

function montar() {
  render(
    <MemoryRouter>
      <PantallaSedes />
    </MemoryRouter>,
  );
}

describe('PantallaSedes — cambiar de sede en edición remonta el formulario', () => {
  // Regresión: sin `key`, pasar de Editar A a Editar B reutilizaba la instancia del
  // formulario y conservaba el nombre de A; Guardar lo habría escrito sobre B.
  it('Editar Sede Centro y luego Editar Sede Norte muestra los datos de Norte', async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText('Sede Centro');

    await user.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
    expect(screen.getByDisplayValue('Sede Centro')).toBeTruthy();

    await user.click(screen.getAllByRole('button', { name: 'Editar' })[1]);
    expect(screen.getByDisplayValue('Sede Norte')).toBeTruthy();
    expect(screen.queryByDisplayValue('Sede Centro')).toBeNull();
  });
});

describe('PantallaSedes — aviso de guardado cuando la recarga posterior falla', () => {
  // El POST/PUT SÍ se completó; si la recarga de la lista falla y no se avisa, el
  // admin daría el alta por fallida y la repetiría → sede duplicada.
  it('alta OK + recarga fallida → error de carga Y aviso de que la sede sí se creó', async () => {
    vi.mocked(servicio.obtenerSedes)
      .mockResolvedValueOnce([sedeCentro]) // carga inicial
      .mockRejectedValueOnce(new Error('lista caída')); // recarga tras el alta
    vi.mocked(servicio.crearSede).mockResolvedValue(sedeNorte);
    const user = userEvent.setup();
    montar();
    await screen.findByText('Sede Centro');

    await user.click(screen.getByRole('button', { name: /registrar sede/i }));
    await user.type(screen.getByPlaceholderText('Nombre de la sede'), 'Sede Norte');
    await user.click(screen.getByRole('button', { name: 'Crear sede' }));

    expect(
      await screen.findByText('La sede se creó correctamente. Su fila aparecerá al recargar la lista.'),
    ).toBeTruthy();
    expect(screen.getByText('lista caída')).toBeTruthy(); // el error de carga sigue visible
  });

  it('edición OK + recarga fallida → aviso de que los cambios sí se guardaron', async () => {
    vi.mocked(servicio.obtenerSedes)
      .mockResolvedValueOnce([sedeCentro, sedeNorte]) // carga inicial
      .mockRejectedValueOnce(new Error('lista caída')); // recarga tras la edición
    vi.mocked(servicio.editarSede).mockResolvedValue({ ...sedeCentro, nombre: 'Sede Centro 2' });
    const user = userEvent.setup();
    montar();
    await screen.findByText('Sede Centro');

    await user.click(screen.getAllByRole('button', { name: 'Editar' })[0]);
    await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(
      await screen.findByText('Los cambios se guardaron correctamente. La fila se actualizará al recargar la lista.'),
    ).toBeTruthy();
  });

  it('con recarga exitosa NO aparece el aviso (la fila nueva ya se ve)', async () => {
    vi.mocked(servicio.obtenerSedes)
      .mockResolvedValueOnce([sedeCentro])
      .mockResolvedValueOnce([sedeCentro, sedeNorte]);
    vi.mocked(servicio.crearSede).mockResolvedValue(sedeNorte);
    const user = userEvent.setup();
    montar();
    await screen.findByText('Sede Centro');

    await user.click(screen.getByRole('button', { name: /registrar sede/i }));
    await user.type(screen.getByPlaceholderText('Nombre de la sede'), 'Sede Norte');
    await user.click(screen.getByRole('button', { name: 'Crear sede' }));

    expect(await screen.findByText('Sede Norte')).toBeTruthy(); // fila nueva visible
    expect(screen.queryByText(/se creó correctamente/)).toBeNull();
  });
});
