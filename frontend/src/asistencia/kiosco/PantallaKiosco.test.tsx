import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PantallaKiosco } from './PantallaKiosco';
import * as servicio from './servicioKiosco';

vi.mock('./servicioKiosco');

// useNavigate espiable, conservando el resto de react-router (MemoryRouter real).
const navegar = vi.hoisted(() => vi.fn());
vi.mock('react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router')>();
  return { ...actual, useNavigate: () => navegar };
});

// useAuth controlable: null = dispositivo sin sesión; objeto = entró desde la gestión.
const usuarioMock = vi.hoisted(() => ({
  actual: null as { rol: string; empresaId: string | null } | null,
}));
vi.mock('../../core/auth/ContextoAuth', () => ({
  useAuth: () => ({ usuario: usuarioMock.actual }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.actual = null;
  vi.mocked(servicio.obtenerKioscos).mockResolvedValue([]);
  vi.mocked(servicio.obtenerTokenKiosco).mockReturnValue(null);
});

function montar() {
  render(
    <MemoryRouter>
      <PantallaKiosco />
    </MemoryRouter>,
  );
}

describe('PantallaKiosco — botón "Volver a GestorPro" (solo con sesión de gestión)', () => {
  it('NO se muestra sin sesión de negocio (el dispositivo real no tiene JWT)', () => {
    usuarioMock.actual = null;
    montar();
    expect(screen.queryByRole('button', { name: /volver a gestorpro/i })).toBeNull();
  });

  it('se muestra con sesión y al pulsarlo navega a "/" (misma pestaña)', async () => {
    usuarioMock.actual = { rol: 'administrador', empresaId: 'e1' };
    const user = userEvent.setup();
    montar();
    const boton = screen.getByRole('button', { name: /volver a gestorpro/i });
    await user.click(boton);
    expect(navegar).toHaveBeenCalledWith('/');
  });
});
