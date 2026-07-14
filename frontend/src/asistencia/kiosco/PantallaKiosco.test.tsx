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

describe('PantallaKiosco — errores del paso de excepción visibles', () => {
  const kioscoDemo = {
    id: 'k1', nombre: 'K1', sedeId: 'sa', activo: true, sede: { nombre: 'Central' },
  };

  // Regresión: los fallos NO-401 (red, 500, 429) al confirmar la excepción se escribían
  // en errorEnvio, que solo se renderiza en el paso facial → el empleado confirmaba su
  // PIN, el spinner paraba y NO veía ningún error: fichaje perdido en silencio.
  it('un fallo de red al confirmar el PIN se muestra EN el paso de excepción', async () => {
    vi.mocked(servicio.obtenerKioscos).mockResolvedValue([kioscoDemo]);
    vi.mocked(servicio.obtenerTokenKiosco).mockReturnValue('tok-dispositivo');
    vi.mocked(servicio.registrarFichaje)
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        datos: { requiereExcepcion: true, modoExcepcion: 'pin', mensaje: 'Se requiere excepción' },
      })
      .mockRejectedValueOnce(new Error('Sin conexión con el servidor'));
    const user = userEvent.setup();
    montar();

    // Paso 1: kiosco + tipo de fichaje.
    await user.selectOptions(await screen.findByLabelText('Kiosco'), 'k1');
    await user.click(screen.getByRole('button', { name: 'Entrada' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    // Paso 2: identificación.
    await user.type(screen.getByPlaceholderText('Número de empleado o QR'), 'E001');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    // Paso 3: enviar → 409 → paso de excepción.
    await user.click(screen.getByRole('button', { name: 'Registrar fichaje' }));
    await screen.findByText('Verificación fallida');

    // Paso 4: confirmar con PIN → fallo de red.
    await user.type(screen.getByLabelText('PIN personal del empleado:'), '1234');
    await user.click(screen.getByRole('button', { name: 'Confirmar fichaje' }));

    // El error se ve AQUÍ, en el paso de excepción (antes iba a errorEnvio, invisible).
    expect(await screen.findByText('Sin conexión con el servidor')).toBeTruthy();
    expect(screen.getByText('Verificación fallida')).toBeTruthy(); // seguimos en el paso
    expect(screen.getByRole('button', { name: 'Confirmar fichaje' })).toBeTruthy(); // reintentable
  });

  it('un error de status (p. ej. 429) al confirmar el PIN también se muestra en el paso de excepción', async () => {
    vi.mocked(servicio.obtenerKioscos).mockResolvedValue([kioscoDemo]);
    vi.mocked(servicio.obtenerTokenKiosco).mockReturnValue('tok-dispositivo');
    vi.mocked(servicio.registrarFichaje)
      .mockResolvedValueOnce({
        ok: false,
        status: 409,
        datos: { requiereExcepcion: true, modoExcepcion: 'pin', mensaje: 'Se requiere excepción' },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        datos: { mensaje: 'Demasiados intentos, espere un momento.' },
      });
    const user = userEvent.setup();
    montar();

    await user.selectOptions(await screen.findByLabelText('Kiosco'), 'k1');
    await user.click(screen.getByRole('button', { name: 'Entrada' }));
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.type(screen.getByPlaceholderText('Número de empleado o QR'), 'E001');
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    await user.click(screen.getByRole('button', { name: 'Registrar fichaje' }));
    await screen.findByText('Verificación fallida');

    await user.type(screen.getByLabelText('PIN personal del empleado:'), '1234');
    await user.click(screen.getByRole('button', { name: 'Confirmar fichaje' }));

    expect(await screen.findByText('Demasiados intentos, espere un momento.')).toBeTruthy();
    expect(screen.getByText('Verificación fallida')).toBeTruthy();
  });
});

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
