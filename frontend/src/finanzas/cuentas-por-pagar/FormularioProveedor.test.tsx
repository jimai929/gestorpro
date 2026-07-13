import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormularioProveedor } from './FormularioProveedor';
import * as servicio from './servicioCuentas';

vi.mock('./servicioCuentas');

describe('FormularioProveedor — manejo de fallo del backend', () => {
  it('si el POST falla: muestra el error en la UI y NO cierra (no llama onGuardado)', async () => {
    vi.mocked(servicio.crearProveedor).mockRejectedValue(new Error('Fallo del backend'));
    const onGuardado = vi.fn();
    const user = userEvent.setup();

    render(<FormularioProveedor onGuardado={onGuardado} onCancelar={vi.fn()} />);

    await user.type(screen.getByLabelText('Nombre *'), 'Proveedor X');
    await user.click(screen.getByRole('button', { name: 'Crear proveedor' }));

    // El error se muestra en la UI…
    expect(await screen.findByText('Fallo del backend')).toBeTruthy();
    // …y el formulario NO se cierra: el padre cierra/selecciona vía onGuardado,
    // que sólo debe llamarse en éxito.
    expect(onGuardado).not.toHaveBeenCalled();
  });

  it('si el POST tiene éxito: llama onGuardado con el proveedor creado', async () => {
    const creado = {
      id: 'p1',
      nombre: 'Proveedor X',
      identificacionFiscal: null,
      telefono: null,
      personaContacto: null,
      activo: true,
      creadoEn: '2026-01-01',
      deudaTotal: 0,
    };
    vi.mocked(servicio.crearProveedor).mockResolvedValue(creado);
    const onGuardado = vi.fn();
    const user = userEvent.setup();

    render(<FormularioProveedor onGuardado={onGuardado} onCancelar={vi.fn()} />);

    await user.type(screen.getByLabelText('Nombre *'), 'Proveedor X');
    await user.click(screen.getByRole('button', { name: 'Crear proveedor' }));

    await waitFor(() => expect(onGuardado).toHaveBeenCalledWith(creado));
  });
});

describe('FormularioProveedor — navegación con Enter integrada (useNavegacionEnter)', () => {
  it('Enter en un campo enfoca el siguiente input del formulario', () => {
    render(<FormularioProveedor onGuardado={vi.fn()} onCancelar={vi.fn()} />);
    const campos = screen.getAllByRole('textbox'); // nombre, RUC, teléfono, contacto
    campos[0]!.focus();
    fireEvent.keyDown(campos[0]!, { key: 'Enter' });
    expect(document.activeElement).toBe(campos[1]);
  });
});
