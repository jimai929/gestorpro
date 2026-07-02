import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogoRestablecerContrasena } from './DialogoRestablecerContrasena';
import { ErrorHttp } from '../../core/api';
import type { UsuarioListado } from './tipos';
import * as servicio from './servicioUsuarios';

// i18n cae a español sin proveedor. Se mockea el servicio para no tocar la red.
vi.mock('./servicioUsuarios');

const USUARIO: UsuarioListado = {
  id: 'u1',
  nombre: 'Ana Empleada',
  email: 'ana@acme.com',
  rol: 'empleado',
  activo: true,
  debeCambiarContrasena: false,
  creadoEn: '2026-06-30T00:00:00.000Z',
};

function montar(props: { onCerrar?: () => void; onExito?: () => void } = {}) {
  return render(
    <DialogoRestablecerContrasena
      usuario={USUARIO}
      onCerrar={props.onCerrar ?? vi.fn()}
      onExito={props.onExito ?? vi.fn()}
    />,
  );
}

/** Escribe la temporal y su confirmación y pulsa "Restablecer". */
async function enviar(temporal: string, confirmar: string = temporal) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Contraseña temporal'), temporal);
  await user.type(screen.getByLabelText('Confirmar contraseña temporal'), confirmar);
  await user.click(screen.getByRole('button', { name: 'Restablecer' }));
  return user;
}

describe('DialogoRestablecerContrasena', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('muestra el título con el nombre del usuario objetivo', () => {
    montar();
    expect(screen.getByText('Restablecer contraseña — Ana Empleada')).toBeTruthy();
  });

  it('temporal corta (<8) → error y NO llama al backend', async () => {
    montar();
    await enviar('corta1*');
    expect(
      await screen.findByText('La contraseña temporal debe tener al menos 8 caracteres.'),
    ).toBeTruthy();
    expect(servicio.restablecerContrasenaApi).not.toHaveBeenCalled();
  });

  it('confirmación distinta → error y NO llama al backend', async () => {
    montar();
    await enviar('Temporal123*', 'Distinta123*');
    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeTruthy();
    expect(servicio.restablecerContrasenaApi).not.toHaveBeenCalled();
  });

  it('éxito (204) → muestra el aviso de comunicar la temporal y "Cerrar" invoca onExito', async () => {
    const onExito = vi.fn();
    vi.mocked(servicio.restablecerContrasenaApi).mockResolvedValue(undefined);
    montar({ onExito });
    const user = await enviar('Temporal123*');

    await waitFor(() =>
      expect(servicio.restablecerContrasenaApi).toHaveBeenCalledWith('u1', 'Temporal123*'),
    );
    expect(await screen.findByText('Contraseña restablecida')).toBeTruthy();
    expect(
      screen.getByText(
        'Comunica la contraseña temporal a Ana Empleada: deberá cambiarla en su próximo ingreso.',
      ),
    ).toBeTruthy();
    // Aún no se cerró: onExito solo al pulsar "Cerrar" (el padre refresca la lista).
    expect(onExito).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onExito).toHaveBeenCalled();
  });

  it('error del backend (404) → mensaje visible, NO se cierra ni marca éxito', async () => {
    const onExito = vi.fn();
    vi.mocked(servicio.restablecerContrasenaApi).mockRejectedValue(
      new ErrorHttp(404, 'Usuario no encontrado.'),
    );
    montar({ onExito });
    await enviar('Temporal123*');

    expect(await screen.findByText('Usuario no encontrado.')).toBeTruthy();
    expect(screen.queryByText('Contraseña restablecida')).toBeNull();
    expect(onExito).not.toHaveBeenCalled();
    // El formulario sigue usable para reintentar.
    expect(screen.getByRole('button', { name: 'Restablecer' })).toBeTruthy();
  });

  it('"Cancelar" y "×" invocan onCerrar (sin llamar al backend)', async () => {
    const onCerrar = vi.fn();
    const user = userEvent.setup();
    montar({ onCerrar });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Cerrar' })); // aria-label del ×
    expect(onCerrar).toHaveBeenCalledTimes(2);
    expect(servicio.restablecerContrasenaApi).not.toHaveBeenCalled();
  });

  it('mientras envía: deshabilita campos y botones (estado de carga)', async () => {
    let resolver: () => void = () => {};
    vi.mocked(servicio.restablecerContrasenaApi).mockReturnValue(
      new Promise<void>((res) => {
        resolver = () => res(undefined);
      }),
    );
    montar();
    await enviar('Temporal123*');

    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Restablecer' }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    expect((screen.getByLabelText('Contraseña temporal') as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    resolver();
    expect(await screen.findByText('Contraseña restablecida')).toBeTruthy();
  });
});
