import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { LayoutPrincipal } from './LayoutPrincipal';
import * as auth from '../auth/ContextoAuth';
import * as servicioAuth from '../auth/servicioAuth';

// Integración del flujo de cambio de contraseña desde el header: abrir el modal,
// cambiar la contraseña con éxito y verificar que se cierra la sesión (el backend ya
// revocó todas las sesiones, así que el usuario debe reingresar). Se mockea useAuth
// (para inyectar un usuario y espiar cerrarSesion) y la API de cambio de contraseña.
vi.mock('../auth/ContextoAuth');
vi.mock('../auth/servicioAuth');

const CLAVE = 'Clave123*';
const NUEVA = 'NuevaClave1*';

function montar(cerrarSesion: () => Promise<void>) {
  vi.mocked(auth.useAuth).mockReturnValue({
    usuario: { id: 'u1', nombre: 'Ana', email: 'ana@x.local', rol: 'administrador', debeCambiarContrasena: false },
    estaAutenticado: true,
    cargando: false,
    iniciarSesion: vi.fn(),
    cerrarSesion,
  });
  render(
    <MemoryRouter>
      <LayoutPrincipal>contenido</LayoutPrincipal>
    </MemoryRouter>,
  );
}

describe('LayoutPrincipal — cambio de contraseña (integración)', () => {
  it('el botón del header abre el modal; tras el éxito se cierra la sesión (cerrarSesion)', async () => {
    const cerrarSesion = vi.fn().mockResolvedValue(undefined);
    vi.mocked(servicioAuth.cambiarContrasenaApi).mockResolvedValue(undefined);
    const user = userEvent.setup();
    montar(cerrarSesion);

    // Al inicio no hay modal.
    expect(screen.queryByRole('dialog')).toBeNull();

    // El botón del header abre el modal.
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
    const dialogo = screen.getByRole('dialog');

    // Rellena y envía.
    await user.type(within(dialogo).getByLabelText('Contraseña actual'), CLAVE);
    await user.type(within(dialogo).getByLabelText('Nueva contraseña'), NUEVA);
    await user.type(within(dialogo).getByLabelText('Confirmar nueva contraseña'), NUEVA);
    await user.click(within(dialogo).getByRole('button', { name: 'Cambiar contraseña' }));

    // Estado de éxito; aún NO se cerró la sesión (espera al botón).
    expect(await screen.findByText('Contraseña actualizada')).toBeTruthy();
    expect(cerrarSesion).not.toHaveBeenCalled();

    // El botón de éxito cierra la sesión (→ RutaProtegida lleva a /login).
    await user.click(screen.getByRole('button', { name: 'Ir a iniciar sesión' }));
    expect(servicioAuth.cambiarContrasenaApi).toHaveBeenCalledWith(CLAVE, NUEVA);
    expect(cerrarSesion).toHaveBeenCalled();
  });
});
