import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import { RutaNegocio } from './RutaNegocio';
import * as auth from './ContextoAuth';

// B4: guard inverso de RutaSoloPlataforma. Solo decide por esSuperAdmin (ya va anidado
// bajo RutaProtegida). Es solo UI: el backend es la frontera real. Se mockea useAuth.
vi.mock('./ContextoAuth');

type EstadoAuth = Partial<ReturnType<typeof auth.useAuth>>;

function montar(estado: EstadoAuth) {
  vi.mocked(auth.useAuth).mockReturnValue({
    usuario: null,
    estaAutenticado: false,
    cargando: false,
    iniciarSesion: vi.fn(),
    cerrarSesion: vi.fn().mockResolvedValue(undefined),
    cambiarEmpresa: vi.fn(),
    ...estado,
  });
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Routes>
        <Route element={<RutaNegocio />}>
          <Route path="/dashboard" element={<div>CONTENIDO NEGOCIO</div>} />
        </Route>
        <Route path="/plataforma" element={<div>PANTALLA PLATAFORMA</div>} />
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
  empresaId: esSuperAdmin ? null : 'e1',
  empresaNombre: esSuperAdmin ? null : 'Acme',
  debeCambiarContrasena: false,
  membresias: [],
});

describe('RutaNegocio — el super-admin no entra a áreas de negocio (B4)', () => {
  it('super-admin → redirige a /plataforma, NO ve el negocio', () => {
    montar({ estaAutenticado: true, usuario: usuario(true) });
    expect(screen.getByText('PANTALLA PLATAFORMA')).toBeTruthy();
    expect(screen.queryByText('CONTENIDO NEGOCIO')).toBeNull();
  });

  it('usuario normal (no super-admin) → ve el contenido de negocio', () => {
    montar({ estaAutenticado: true, usuario: usuario(false) });
    expect(screen.getByText('CONTENIDO NEGOCIO')).toBeTruthy();
    expect(screen.queryByText('PANTALLA PLATAFORMA')).toBeNull();
  });
});
