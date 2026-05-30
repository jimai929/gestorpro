import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormularioCaja } from './FormularioCaja';
import * as servicio from './servicioCajas';
import * as servicioSedes from '../sedes/servicioSedes';

vi.mock('./servicioCajas');
vi.mock('../sedes/servicioSedes');

const sede = {
  id: 's1',
  nombre: 'Sede Central',
  activo: true,
  modoExcepcion: 'pin' as const,
  creadoEn: '2026-01-01',
};

/** Rellena los tres campos requeridos (número, nombre y sede) del formulario. */
async function rellenarCampos(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Número *'), '1');
  await user.type(screen.getByLabelText('Nombre *'), 'Caja principal');
  // La sede se carga al montar vía obtenerSedes; esperamos a que aparezca la opción.
  await screen.findByRole('option', { name: 'Sede Central' });
  await user.selectOptions(screen.getByRole('combobox'), 'Sede Central');
}

describe('FormularioCaja — manejo de fallo del backend', () => {
  it('si el POST falla: muestra el error en la UI y NO cierra (no llama onGuardado)', async () => {
    vi.mocked(servicioSedes.obtenerSedes).mockResolvedValue([sede]);
    vi.mocked(servicio.crearCaja).mockRejectedValue(new Error('Fallo del backend'));
    const onGuardado = vi.fn();
    const user = userEvent.setup();

    render(<FormularioCaja onGuardado={onGuardado} onCancelar={vi.fn()} />);

    await rellenarCampos(user);
    await user.click(screen.getByRole('button', { name: 'Crear caja' }));

    // El error se muestra en la UI…
    expect(await screen.findByText('Fallo del backend')).toBeTruthy();
    // …y el formulario NO se cierra: el padre cierra/selecciona vía onGuardado,
    // que sólo debe llamarse en éxito.
    expect(onGuardado).not.toHaveBeenCalled();
  });

  it('si el POST tiene éxito: llama onGuardado con la caja creada', async () => {
    const creada = {
      id: 'c1',
      sedeId: 's1',
      numero: '1',
      nombre: 'Caja principal',
      activo: true,
      creadoEn: '2026-01-01',
    };
    vi.mocked(servicioSedes.obtenerSedes).mockResolvedValue([sede]);
    vi.mocked(servicio.crearCaja).mockResolvedValue(creada);
    const onGuardado = vi.fn();
    const user = userEvent.setup();

    render(<FormularioCaja onGuardado={onGuardado} onCancelar={vi.fn()} />);

    await rellenarCampos(user);
    await user.click(screen.getByRole('button', { name: 'Crear caja' }));

    await waitFor(() => expect(onGuardado).toHaveBeenCalledWith(creada));
  });
});
