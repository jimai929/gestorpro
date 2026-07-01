import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { RutaSoloPlataforma } from './RutaSoloPlataforma';
import * as auth from './ContextoAuth';

// El guard solo decide acceso por esSuperAdmin (ya va anidado bajo RutaProtegida).
// Es solo UI: el backend (soloPlataforma) es la frontera real. Se mockea useAuth.
vi.mock('./ContextoAuth');

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
    <MemoryRouter initialEntries={['/plataforma']}>
      <Routes>
        <Route element={<RutaSoloPlataforma />}>
          <Route path="/plataforma" element={<div>CONTENIDO PLATAFORMA</div>} />
        </Route>
        <Route path="/" element={<div>PANTALLA INICIO</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const usuario = (esSuperAdmin: boolean) => ({
  id: 'u1',
  nombre: 'Ana',
  email: 'a@x.local',
  rol: 'administrador' as const,
  esSuperAdmin,
  empresaNombre: null,
  debeCambiarContrasena: false,
});

describe('RutaSoloPlataforma — guard de super-admin', () => {
  it('super-admin → entra a la pantalla de plataforma', () => {
    montar({ estaAutenticado: true, usuario: usuario(true) });
    expect(screen.getByText('CONTENIDO PLATAFORMA')).toBeTruthy();
  });

  it('usuario normal (no super-admin) → redirige al inicio, NO ve plataforma', () => {
    montar({ estaAutenticado: true, usuario: usuario(false) });
    expect(screen.getByText('PANTALLA INICIO')).toBeTruthy();
    expect(screen.queryByText('CONTENIDO PLATAFORMA')).toBeNull();
  });
});
