import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogoRestablecerAdmin } from './DialogoRestablecerAdmin';
import { ErrorHttp } from '../core/api';
import type { EmpresaListada } from './tipos';
import * as servicio from './servicioPlataforma';

// i18n cae a español sin proveedor. Se mockea el servicio para no tocar la red.
vi.mock('./servicioPlataforma');

const EMPRESA: EmpresaListada = {
  id: 'e1',
  nombre: 'Acme Panamá',
  slug: 'acme-panama',
  estado: 'activa',
  creadoEn: '2026-06-30T00:00:00.000Z',
  adminEmail: 'ana@acme.com',
};
const TEMPORAL = 'Temp-xyz789ABCdef';

function montar(props: { onCerrar?: () => void; onExito?: () => void } = {}) {
  return render(
    <DialogoRestablecerAdmin
      empresa={EMPRESA}
      onCerrar={props.onCerrar ?? vi.fn()}
      onExito={props.onExito ?? vi.fn()}
    />,
  );
}

/** Pulsa el botón de confirmación "Restablecer contraseña". */
async function confirmar() {
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Restablecer contraseña' }));
  return user;
}

describe('DialogoRestablecerAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('paso de confirmación: muestra el título con la empresa y NO llama al backend aún', () => {
    montar();
    expect(screen.getByText('Restablecer contraseña del admin de Acme Panamá')).toBeTruthy();
    // Está el botón de confirmar y aún no se llamó al backend.
    expect(screen.getByRole('button', { name: 'Restablecer contraseña' })).toBeTruthy();
    expect(servicio.restablecerAdminApi).not.toHaveBeenCalled();
  });

  it('confirmar (200) → muestra la temporal EN CLARO + aviso de cambio obligatorio; "Cerrar" invoca onExito (no antes)', async () => {
    const onExito = vi.fn();
    vi.mocked(servicio.restablecerAdminApi).mockResolvedValue({
      contrasenaTemporal: TEMPORAL,
      debeCambiarContrasena: true,
    });
    montar({ onExito });
    const user = await confirmar();

    await waitFor(() => expect(servicio.restablecerAdminApi).toHaveBeenCalledWith('e1'));
    expect(await screen.findByText('Contraseña restablecida')).toBeTruthy();
    // La temporal se muestra EN CLARO (una vez) para comunicarla.
    expect(screen.getByText(TEMPORAL)).toBeTruthy();
    // Aviso OBLIGATORIO de cambio en el primer ingreso.
    expect(
      screen.getByText('El administrador DEBE cambiar esta contraseña en su primer inicio de sesión.'),
    ).toBeTruthy();
    // Aún no se cerró: onExito solo al pulsar "Cerrar".
    expect(onExito).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onExito).toHaveBeenCalled();
  });

  it('error del backend (409 desactivada) → mensaje visible, NO muestra temporal ni cierra; se puede reintentar', async () => {
    const onExito = vi.fn();
    vi.mocked(servicio.restablecerAdminApi).mockRejectedValue(
      new ErrorHttp(409, 'La empresa está desactivada: reactívala antes de restablecer su administrador.'),
    );
    montar({ onExito });
    await confirmar();

    expect(
      await screen.findByText(
        'La empresa está desactivada: reactívala antes de restablecer su administrador.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('Contraseña restablecida')).toBeNull();
    expect(onExito).not.toHaveBeenCalled();
    // El diálogo sigue en confirmación (reintentable).
    expect(screen.getByRole('button', { name: 'Restablecer contraseña' })).toBeTruthy();
  });

  it('"Cancelar" y "×" invocan onCerrar (sin llamar al backend)', async () => {
    const onCerrar = vi.fn();
    const user = userEvent.setup();
    montar({ onCerrar });
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await user.click(screen.getByRole('button', { name: 'Cerrar' })); // aria-label del ×
    expect(onCerrar).toHaveBeenCalledTimes(2);
    expect(servicio.restablecerAdminApi).not.toHaveBeenCalled();
  });

  it('mientras confirma: "Restablecer contraseña" y "Cancelar" quedan deshabilitados (evita doble reset)', async () => {
    let resolver: () => void = () => {};
    vi.mocked(servicio.restablecerAdminApi).mockReturnValue(
      new Promise((res) => {
        resolver = () => res({ contrasenaTemporal: TEMPORAL, debeCambiarContrasena: true });
      }),
    );
    montar();
    await confirmar();

    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Restablecer contraseña' }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    expect((screen.getByRole('button', { name: 'Cancelar' }) as HTMLButtonElement).disabled).toBe(true);

    resolver();
    expect(await screen.findByText('Contraseña restablecida')).toBeTruthy();
  });

  it('tras el éxito, "Copiar" cambia su etiqueta a "Copiada"', async () => {
    vi.mocked(servicio.restablecerAdminApi).mockResolvedValue({
      contrasenaTemporal: TEMPORAL,
      debeCambiarContrasena: true,
    });
    const user = await (async () => {
      montar();
      return confirmar();
    })();
    expect(await screen.findByText('Contraseña restablecida')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(screen.getByRole('button', { name: 'Copiada' })).toBeTruthy();
  });
});
