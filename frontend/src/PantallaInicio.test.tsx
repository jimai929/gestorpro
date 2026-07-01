import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PantallaInicio } from './PantallaInicio';
import * as auth from './core/auth/ContextoAuth';

// La tarjeta "Plataforma" solo se muestra a super-admin. Se mockea useAuth para
// inyectar el flag; i18n cae a español sin proveedor (textos en español).
vi.mock('./core/auth/ContextoAuth');

function montar(esSuperAdmin: boolean) {
  vi.mocked(auth.useAuth).mockReturnValue({
    usuario: {
      id: 'u1',
      nombre: 'Ana',
      email: 'a@x.local',
      rol: 'administrador',
      esSuperAdmin,
      empresaId: null,
      empresaNombre: null,
      debeCambiarContrasena: false,
    },
    estaAutenticado: true,
    cargando: false,
    iniciarSesion: vi.fn(),
    cerrarSesion: vi.fn().mockResolvedValue(undefined),
    cambiarEmpresa: vi.fn(),
  });
  render(
    <MemoryRouter>
      <PantallaInicio />
    </MemoryRouter>,
  );
}

describe('PantallaInicio — tarjeta de Plataforma (solo super-admin)', () => {
  it('super-admin → ve la tarjeta de Plataforma con enlace a /plataforma', () => {
    montar(true);
    expect(screen.getByRole('heading', { name: 'Plataforma' })).toBeTruthy();
    const enlace = screen.getByRole('link', { name: /Plataforma/ }) as HTMLAnchorElement;
    expect(enlace.getAttribute('href')).toBe('/plataforma');
  });

  it('usuario normal → NO ve la tarjeta de Plataforma (pero sí los demás módulos)', () => {
    montar(false);
    expect(screen.queryByRole('heading', { name: 'Plataforma' })).toBeNull();
    // Sanity: los módulos normales siguen visibles.
    expect(screen.getByRole('heading', { name: 'Finanzas' })).toBeTruthy();
  });
});
