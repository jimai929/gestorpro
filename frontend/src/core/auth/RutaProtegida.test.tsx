import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router';
import { RutaProtegida } from './RutaProtegida';
import * as auth from './ContextoAuth';
import * as servicio from './servicioAuth';

// Gate de cambio forzado: con debeCambiarContrasena=true se BLOQUEA el app y se muestra
// el cambio obligatorio; con false se entra normal. Se mockea useAuth y la API de cambio.
vi.mock('./ContextoAuth');
vi.mock('./servicioAuth');

type EstadoAuth = Partial<ReturnType<typeof auth.useAuth>>;

function montar(estado: EstadoAuth) {
  vi.mocked(auth.useAuth).mockReturnValue({
    usuario: null,
    estaAutenticado: false,
    cargando: false,
    iniciarSesion: vi.fn(),
    cerrarSesion: vi.fn().mockResolvedValue(undefined),
    ...estado,
  });
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<RutaProtegida />}>
          <Route path="/" element={<div>CONTENIDO APP</div>} />
        </Route>
        <Route path="/login" element={<div>PANTALLA LOGIN</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const usuario = (debeCambiarContrasena: boolean) => ({
  id: 'u1',
  nombre: 'Ana',
  email: 'a@x.local',
  rol: 'administrador' as const,
  esSuperAdmin: false,
  empresaNombre: null,
  debeCambiarContrasena,
});

const INTRO = 'Tu contraseña es temporal. Debes cambiarla para continuar.';

describe('RutaProtegida — gate de cambio de contraseña forzado', () => {
  it('flag=true: BLOQUEA el app y muestra el cambio forzado (no entra a la app)', () => {
    montar({ estaAutenticado: true, usuario: usuario(true) });
    expect(screen.getByText(INTRO)).toBeTruthy();
    expect(screen.queryByText('CONTENIDO APP')).toBeNull(); // no se cuela al app
  });

  it('flag=false: usuario normal entra a la app', () => {
    montar({ estaAutenticado: true, usuario: usuario(false) });
    expect(screen.getByText('CONTENIDO APP')).toBeTruthy();
    expect(screen.queryByText(INTRO)).toBeNull();
  });

  it('no autenticado → redirige a /login', () => {
    montar({ estaAutenticado: false, usuario: null });
    expect(screen.getByText('PANTALLA LOGIN')).toBeTruthy();
  });

  it('cambio forzado exitoso → cierra la sesión (contrato 1: re-login, no reutiliza el token)', async () => {
    const cerrarSesion = vi.fn().mockResolvedValue(undefined);
    vi.mocked(servicio.cambiarContrasenaApi).mockResolvedValue(undefined);
    montar({ estaAutenticado: true, usuario: usuario(true), cerrarSesion });
    const user = userEvent.setup();

    await user.type(screen.getByLabelText('Contraseña actual'), 'Clave123*');
    await user.type(screen.getByLabelText('Nueva contraseña'), 'NuevaClave1*');
    await user.type(screen.getByLabelText('Confirmar nueva contraseña'), 'NuevaClave1*');
    await user.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    expect(await screen.findByText('Contraseña actualizada')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Ir a iniciar sesión' }));
    expect(cerrarSesion).toHaveBeenCalled();
  });
});
