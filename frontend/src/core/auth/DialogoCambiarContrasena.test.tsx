import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogoCambiarContrasena } from './DialogoCambiarContrasena';
import { ErrorHttp } from '../api';
import * as servicio from './servicioAuth';

// El contexto i18n cae a español sin proveedor, así que las etiquetas son en español.
vi.mock('./servicioAuth');

const CLAVE = 'Clave123*';
const NUEVA = 'NuevaClave1*';

function renderModal() {
  const onExito = vi.fn();
  const onCerrar = vi.fn();
  render(<DialogoCambiarContrasena onExito={onExito} onCerrar={onCerrar} />);
  return { onExito, onCerrar };
}

async function llenar(actual: string, nueva: string, confirmar: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Contraseña actual'), actual);
  await user.type(screen.getByLabelText('Nueva contraseña'), nueva);
  await user.type(screen.getByLabelText('Confirmar nueva contraseña'), confirmar);
  await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
  return user;
}

describe('DialogoCambiarContrasena', () => {
  it('nueva contraseña corta (<8) → muestra error y NO llama a la API', async () => {
    renderModal();
    await llenar(CLAVE, 'corta', 'corta');

    expect(
      await screen.findByText('La nueva contraseña debe tener al menos 8 caracteres.'),
    ).toBeTruthy();
    expect(servicio.cambiarContrasenaApi).not.toHaveBeenCalled();
  });

  it('nueva igual a la actual → muestra error y NO llama a la API', async () => {
    renderModal();
    await llenar(CLAVE, CLAVE, CLAVE);

    expect(
      await screen.findByText('La nueva contraseña debe ser distinta de la actual.'),
    ).toBeTruthy();
    expect(servicio.cambiarContrasenaApi).not.toHaveBeenCalled();
  });

  it('la confirmación no coincide → muestra error y NO llama a la API', async () => {
    renderModal();
    await llenar(CLAVE, NUEVA, 'OtraClave9*');

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeTruthy();
    expect(servicio.cambiarContrasenaApi).not.toHaveBeenCalled();
  });

  it('si el backend falla: muestra el error y NO marca éxito (no llama onExito)', async () => {
    vi.mocked(servicio.cambiarContrasenaApi).mockRejectedValue(
      new Error('Credenciales inválidas.'),
    );
    const { onExito } = renderModal();
    await llenar(CLAVE, NUEVA, NUEVA);

    expect(await screen.findByText('Credenciales inválidas.')).toBeTruthy();
    expect(onExito).not.toHaveBeenCalled();
  });

  it('mientras envía: deshabilita los campos y el botón de envío (estado de carga)', async () => {
    // Promesa que no resuelve hasta que queramos: deja la petición "en vuelo".
    let resolver: () => void = () => {};
    vi.mocked(servicio.cambiarContrasenaApi).mockReturnValue(
      new Promise<void>((res) => {
        resolver = res;
      }),
    );
    renderModal();
    await llenar(CLAVE, NUEVA, NUEVA);

    // En vuelo: el campo y el botón de envío quedan deshabilitados.
    await waitFor(() =>
      expect((screen.getByLabelText('Contraseña actual') as HTMLInputElement).disabled).toBe(true),
    );
    expect(
      (screen.getByRole('button', { name: 'Cambiar contraseña' }) as HTMLButtonElement).disabled,
    ).toBe(true);

    // Al resolver, pasa al estado de éxito.
    resolver();
    expect(await screen.findByText('Contraseña actualizada')).toBeTruthy();
  });

  it('éxito: llama a la API con (actual, nueva), muestra el aviso y onExito solo al pulsar el botón', async () => {
    vi.mocked(servicio.cambiarContrasenaApi).mockResolvedValue(undefined);
    const { onExito } = renderModal();
    const user = await llenar(CLAVE, NUEVA, NUEVA);

    await waitFor(() =>
      expect(servicio.cambiarContrasenaApi).toHaveBeenCalledWith(CLAVE, NUEVA),
    );
    // Estado de éxito visible; aún NO se cerró la sesión (espera al botón).
    expect(await screen.findByText('Contraseña actualizada')).toBeTruthy();
    expect(onExito).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Ir a iniciar sesión' }));
    expect(onExito).toHaveBeenCalled();
  });

  it('error 429 (rate limit) → muestra un mensaje DISTINTO "espera y reintenta" (no el texto crudo)', async () => {
    vi.mocked(servicio.cambiarContrasenaApi).mockRejectedValue(new ErrorHttp(429, 'Rate limit exceeded'));
    renderModal();
    await llenar(CLAVE, NUEVA, NUEVA);

    expect(
      await screen.findByText('Demasiados intentos. Espera un momento e inténtalo de nuevo.'),
    ).toBeTruthy();
    expect(screen.queryByText('Rate limit exceeded')).toBeNull(); // no se muestra el texto crudo
  });

  it('modo forzado: SIN botón Cancelar ni cerrar (×), con aviso de contraseña temporal', () => {
    render(<DialogoCambiarContrasena forzado onExito={vi.fn()} />);
    expect(screen.getByText('Tu contraseña es temporal. Debes cambiarla para continuar.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull();
    expect(screen.queryByLabelText('Cerrar')).toBeNull();
  });
});
