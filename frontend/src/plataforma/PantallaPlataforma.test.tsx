import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PantallaPlataforma } from './PantallaPlataforma';
import { ErrorHttp } from '../core/api';
import type { EmpresaListada } from './tipos';
import * as servicio from './servicioPlataforma';
import * as auth from '../core/auth/ContextoAuth';

// Cableado real de la pantalla (fetch + mutación de estado): se mockean el servicio
// y el contexto de auth; el router es un MemoryRouter (useNavigate real).
vi.mock('./servicioPlataforma');
vi.mock('../core/auth/ContextoAuth');
// El LayoutPrincipal real usa useAuth y la barra completa; aquí no aporta.
vi.mock('../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const ACME: EmpresaListada = {
  id: 'e1',
  nombre: 'Acme Panamá',
  slug: 'acme-panama',
  estado: 'activa',
  creadoEn: '2026-06-30T00:00:00.000Z',
  adminEmail: 'ana@acme.com',
};

function montar() {
  return render(
    <MemoryRouter>
      <PantallaPlataforma />
    </MemoryRouter>,
  );
}

describe('PantallaPlataforma — cableado de transiciones de estado (B3)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(auth.useAuth).mockReturnValue({
      cambiarEmpresa: vi.fn(),
    } as unknown as ReturnType<typeof auth.useAuth>);
  });

  it('suspender con éxito: PATCH con (id, "suspendida") y la lista se RECARGA mostrando Suspendida', async () => {
    vi.mocked(servicio.listarEmpresasApi)
      .mockResolvedValueOnce([ACME])
      .mockResolvedValueOnce([{ ...ACME, estado: 'suspendida' }]);
    vi.mocked(servicio.cambiarEstadoEmpresaApi).mockResolvedValue({ ...ACME, estado: 'suspendida' });
    const user = userEvent.setup();
    montar();

    // Carga inicial.
    expect(await screen.findByText('Acme Panamá')).toBeTruthy();
    expect(screen.getByText('Activa')).toBeTruthy();

    // Dos clics: armar → confirmar.
    await user.click(screen.getByRole('button', { name: 'Suspender' }));
    await user.click(screen.getByRole('button', { name: '¿Confirmar suspensión?' }));

    await waitFor(() =>
      expect(servicio.cambiarEstadoEmpresaApi).toHaveBeenCalledWith('e1', 'suspendida'),
    );
    // Solo tras el éxito real se recarga y la fila refleja el estado nuevo.
    expect(await screen.findByText('Suspendida')).toBeTruthy();
    expect(servicio.listarEmpresasApi).toHaveBeenCalledTimes(2);
  });

  it('cancelar con error del backend (p. ej. 409 terminal): mensaje visible y la lista NO se recarga', async () => {
    vi.mocked(servicio.listarEmpresasApi).mockResolvedValue([ACME]);
    vi.mocked(servicio.cambiarEstadoEmpresaApi).mockRejectedValue(
      new ErrorHttp(409, 'La empresa está cancelada: es un estado terminal.'),
    );
    const user = userEvent.setup();
    montar();

    expect(await screen.findByText('Acme Panamá')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cancelar empresa' }));
    await user.click(screen.getByRole('button', { name: '¿Cancelar DEFINITIVAMENTE?' }));

    expect(await screen.findByText('La empresa está cancelada: es un estado terminal.')).toBeTruthy();
    // La tabla sigue visible con los datos previos (el error no la tapa).
    expect(screen.getByText('Acme Panamá')).toBeTruthy();
    expect(servicio.listarEmpresasApi).toHaveBeenCalledTimes(1); // sin recarga
  });
});
