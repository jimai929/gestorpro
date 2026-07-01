import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { LayoutPrincipal } from './LayoutPrincipal';
import * as auth from '../auth/ContextoAuth';
import * as servicioAuth from '../auth/servicioAuth';
import type { Usuario } from '../auth/tipos';

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
    usuario: { id: 'u1', nombre: 'Ana', email: 'ana@x.local', rol: 'administrador', esSuperAdmin: false, empresaId: 'e1', empresaNombre: 'Mi Empresa', debeCambiarContrasena: false },
    estaAutenticado: true,
    cargando: false,
    iniciarSesion: vi.fn(),
    cerrarSesion,
    cambiarEmpresa: vi.fn(),
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

describe('LayoutPrincipal — empresa activa en la barra superior', () => {
  function renderConUsuario(usuario: Usuario, cambiarEmpresa = vi.fn()) {
    vi.mocked(auth.useAuth).mockReturnValue({
      usuario,
      estaAutenticado: true,
      cargando: false,
      iniciarSesion: vi.fn(),
      cerrarSesion: vi.fn().mockResolvedValue(undefined),
      cambiarEmpresa,
    });
    render(
      <MemoryRouter>
        <LayoutPrincipal>contenido</LayoutPrincipal>
      </MemoryRouter>,
    );
  }

  it('usuario normal: muestra el nombre de su empresa (sin botón de volver)', () => {
    renderConUsuario({
      id: 'u1',
      nombre: 'Ana',
      email: 'a@x.local',
      rol: 'administrador',
      esSuperAdmin: false,
      empresaId: 'e1',
      empresaNombre: 'Acme Panamá',
      debeCambiarContrasena: false,
    });
    expect(screen.getByText('Acme Panamá')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Volver a plataforma' })).toBeNull();
  });

  it('super-admin (sin empresa activa): muestra "Plataforma" y no el botón de volver', () => {
    renderConUsuario({
      id: 'sa',
      nombre: 'Super Admin',
      email: 'sa@x.local',
      rol: 'empleado',
      esSuperAdmin: true,
      empresaId: null,
      empresaNombre: null,
      debeCambiarContrasena: false,
    });
    expect(screen.getByText('Plataforma')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Volver a plataforma' })).toBeNull();
  });

  it('super-admin DENTRO de una empresa: muestra su nombre y "Volver a plataforma" llama a cambiarEmpresa(null)', async () => {
    const cambiarEmpresa = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderConUsuario(
      {
        id: 'sa',
        nombre: 'Super Admin',
        email: 'sa@x.local',
        rol: 'empleado',
        esSuperAdmin: true,
        empresaId: 'e1',
        empresaNombre: 'Acme Panamá',
        debeCambiarContrasena: false,
      },
      cambiarEmpresa,
    );
    // La empresa a la que ENTRÓ gana sobre el badge "Plataforma".
    expect(screen.getByText('Acme Panamá')).toBeTruthy();
    expect(screen.queryByText('Plataforma')).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Volver a plataforma' }));
    expect(cambiarEmpresa).toHaveBeenCalledWith(null);
  });

  it('si "Volver a plataforma" falla, el error queda VISIBLE en la barra', async () => {
    const cambiarEmpresa = vi.fn().mockRejectedValue(new Error('Sesión expirada'));
    const user = userEvent.setup();
    renderConUsuario(
      {
        id: 'sa',
        nombre: 'Super Admin',
        email: 'sa@x.local',
        rol: 'empleado',
        esSuperAdmin: true,
        empresaId: 'e1',
        empresaNombre: 'Acme Panamá',
        debeCambiarContrasena: false,
      },
      cambiarEmpresa,
    );
    await user.click(screen.getByRole('button', { name: 'Volver a plataforma' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Sesión expirada')).toBeTruthy();
  });
});
