import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormularioVenta } from './FormularioVenta';
import * as servicio from './servicioDashboard';

vi.mock('./servicioDashboard');

const sedeA = { id: 'sa', nombre: 'Sede A', activo: true, modoExcepcion: 'pin', creadoEn: '2026-01-01' };
const sedeB = { id: 'sb', nombre: 'Sede B', activo: true, modoExcepcion: 'pin', creadoEn: '2026-01-01' };

const rolCajera = { id: 'rc', clave: 'cajera', nombre: 'Cajera' };
const rolVerif = { id: 'rv', clave: 'verificador', nombre: 'Verificador' };

// María (sede A) es cajera y verificador; Ana (sede B) solo cajera; Carlos (sede A) solo verificador.
const maria = { id: 'e1', numero: 'E001', nombre: 'María Pérez', sedeId: 'sa', roles: [rolCajera, rolVerif] };
const ana = { id: 'e3', numero: 'E003', nombre: 'Ana Ruiz', sedeId: 'sb', roles: [rolCajera] };
const carlos = { id: 'e4', numero: 'E004', nombre: 'Carlos Méndez', sedeId: 'sa', roles: [rolVerif] };

// Ana (sede B) va primero a propósito, para comprobar que el orden la baja.
const cajeras = [ana, maria];
const verificadores = [maria, carlos];

beforeEach(() => {
  vi.mocked(servicio.obtenerSedes).mockResolvedValue([sedeA, sedeB]);
  vi.mocked(servicio.obtenerEmpleadosPorRol).mockImplementation((rol: string) =>
    Promise.resolve(rol === 'cajera' ? cajeras : verificadores),
  );
});

/** Monta el formulario y espera a que carguen sedes y empleados. */
async function montar() {
  const user = userEvent.setup();
  render(<FormularioVenta onRegistrada={vi.fn()} />);
  await screen.findByRole('option', { name: 'Sede A' });
  await screen.findByRole('option', { name: /Ana Ruiz/ }); // cajeras cargadas
  await screen.findByRole('option', { name: /Carlos Méndez/ }); // verificadores cargados
  // Orden de los <select>: 0 Sede · 1 Turno · 2 Cajera · 3 Cerrado por.
  const combos = screen.getAllByRole('combobox');
  return { user, sedeSel: combos[0]!, cajeraSel: combos[2]!, verifSel: combos[3]! };
}

describe('FormularioVenta — selects de cajera y verificador', () => {
  it('Cajera muestra solo empleados con rol cajera; Cerrado por solo verificadores', async () => {
    const { user, sedeSel, cajeraSel, verifSel } = await montar();
    await user.selectOptions(sedeSel, 'sa');

    expect(within(cajeraSel).queryByRole('option', { name: /María Pérez/ })).toBeTruthy();
    expect(within(cajeraSel).queryByRole('option', { name: /Ana Ruiz/ })).toBeTruthy();
    expect(within(cajeraSel).queryByRole('option', { name: /Carlos Méndez/ })).toBeNull();

    expect(within(verifSel).queryByRole('option', { name: /María Pérez/ })).toBeTruthy();
    expect(within(verifSel).queryByRole('option', { name: /Carlos Méndez/ })).toBeTruthy();
    expect(within(verifSel).queryByRole('option', { name: /Ana Ruiz/ })).toBeNull();
  });

  it('ordena los de la sede del cierre primero y usa el snapshot "E001 - Nombre" como valor', async () => {
    const { user, sedeSel, cajeraSel } = await montar();
    await user.selectOptions(sedeSel, 'sa'); // sede A

    const opciones = within(cajeraSel).getAllByRole('option') as HTMLOptionElement[];
    // [0] placeholder · [1] María (sede A, va primero) · [2] Ana (otra sede)
    expect(opciones[1]!.textContent).toMatch(/María Pérez/);
    expect(opciones[2]!.textContent).toMatch(/Ana Ruiz/);
    expect(opciones[1]!.value).toBe('E001 - María Pérez');
  });

  it('al cambiar de sede RESETEA cajera y cerrado por', async () => {
    const { user, sedeSel, cajeraSel, verifSel } = await montar();
    await user.selectOptions(sedeSel, 'sa');
    await user.selectOptions(cajeraSel, 'E001 - María Pérez');
    await user.selectOptions(verifSel, 'E004 - Carlos Méndez');
    expect((cajeraSel as HTMLSelectElement).value).toBe('E001 - María Pérez');
    expect((verifSel as HTMLSelectElement).value).toBe('E004 - Carlos Méndez');

    await user.selectOptions(sedeSel, 'sb');
    expect((cajeraSel as HTMLSelectElement).value).toBe('');
    expect((verifSel as HTMLSelectElement).value).toBe('');
  });

  it('advierte (sin bloquear) si la cajera y quien verifica son la misma persona', async () => {
    const { user, sedeSel, cajeraSel, verifSel } = await montar();
    await user.selectOptions(sedeSel, 'sa');
    await user.selectOptions(cajeraSel, 'E001 - María Pérez');
    await user.selectOptions(verifSel, 'E001 - María Pérez');
    expect(screen.getByText(/misma persona/i)).toBeTruthy();
  });
});

describe('FormularioVenta — fallo de carga y reintento', () => {
  it('si las sedes fallan, el select queda "No disponible" y ofrece reintentar', async () => {
    vi.mocked(servicio.obtenerSedes).mockRejectedValueOnce(new Error('boom'));
    render(<FormularioVenta onRegistrada={vi.fn()} />);

    // Aparece el aviso con reintento (no se traga el error ni finge "Seleccionar sede").
    const reintentar = await screen.findByRole('button', { name: /reintentar/i });
    expect(reintentar).toBeTruthy();
    expect(screen.getByRole('option', { name: 'No disponible' })).toBeTruthy();
  });

  it('reintentar recupera las sedes tras un fallo transitorio', async () => {
    vi.mocked(servicio.obtenerSedes).mockRejectedValueOnce(new Error('boom'));
    const user = userEvent.setup();
    render(<FormularioVenta onRegistrada={vi.fn()} />);

    const reintentar = await screen.findByRole('button', { name: /reintentar/i });
    await user.click(reintentar);

    // La segunda carga resuelve (mock por defecto): aparecen las sedes y se va el aviso.
    await screen.findByRole('option', { name: 'Sede A' });
    expect(screen.queryByRole('button', { name: /reintentar/i })).toBeNull();
  });

  it('si los empleados fallan, cajera y verificador avisan con reintento (uno por select)', async () => {
    // Promise.all rechaza si cualquiera de los dos falla; basta con el primero.
    vi.mocked(servicio.obtenerEmpleadosPorRol).mockRejectedValueOnce(new Error('boom'));
    render(<FormularioVenta onRegistrada={vi.fn()} />);

    const reintentos = await screen.findAllByRole('button', { name: /reintentar/i });
    expect(reintentos).toHaveLength(2);
  });
});
