import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { PantallaInicio } from './PantallaInicio';
import * as auth from './core/auth/ContextoAuth';

// La tarjeta "Plataforma" solo se muestra a super-admin. Se mockea useAuth para
// inyectar el flag; i18n cae a español sin proveedor (textos en español).
vi.mock('./core/auth/ContextoAuth');

// Aísla la pantalla de su layout: LayoutPrincipal (barra lateral, 1b) trae su propia
// navegación —incluido un enlace a /plataforma para super-admin— que duplicaría los
// enlaces de las tarjetas y haría ambiguas las queries. Este test cubre SOLO las
// tarjetas de PantallaInicio, así que el layout se reemplaza por un passthrough.
vi.mock('./core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: ({ children }: { children: unknown }) => children,
}));

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
      membresias: [],
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
