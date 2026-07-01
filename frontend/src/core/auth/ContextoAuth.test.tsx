import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { act } from 'react';
import { ProveedorAuth, useAuth } from './ContextoAuth';
import * as api from '../api';
import * as servicioAuth from './servicioAuth';
import type { Usuario } from './tipos';

// El manejador de refresh-on-401 debe RE-SINCRONIZAR `usuario` tras renovar el token:
// cambiar-empresa actualiza TODAS las sesiones del usuario, así que otra pestaña o
// dispositivo puede cambiar la empresa activa y el token renovado llega con OTRA
// empresa — sin re-sync, la UI mostraría datos de una empresa bajo la etiqueta de otra.
vi.mock('../api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  fijarAccessToken: vi.fn(),
  fijarManejadorRefresh: vi.fn(),
  fijarManejadorDebeCambiar: vi.fn(),
}));
vi.mock('./servicioAuth', () => ({
  cambiarEmpresaApi: vi.fn(),
  eliminarRefreshToken: vi.fn(),
  guardarRefreshToken: vi.fn(),
  loginApi: vi.fn(),
  logoutApi: vi.fn(),
  obtenerRefreshTokenGuardado: vi.fn(),
  refrescarTokenApi: vi.fn(),
}));

function usuarioDe(empresaNombre: string): Usuario {
  return {
    id: 'sa',
    nombre: 'Super Admin',
    email: 'sa@x.local',
    rol: 'empleado',
    esSuperAdmin: true,
    empresaId: `id-${empresaNombre}`,
    empresaNombre,
    debeCambiarContrasena: false,
  };
}

/** Muestra la empresa activa del contexto (o marcadores de estado). */
function Sonda() {
  const { usuario, cargando } = useAuth();
  if (cargando) return <div>cargando</div>;
  return <div>{usuario?.empresaNombre ?? 'sin-usuario'}</div>;
}

describe('ContextoAuth — re-sincronización de usuario tras el refresh silencioso', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tras renovar el access token, re-pide /auth/me y actualiza la empresa activa en la UI', async () => {
    // Captura el manejador que el proveedor registra en el cliente HTTP.
    let manejador: (() => Promise<string | null>) | null = null;
    vi.mocked(api.fijarManejadorRefresh).mockImplementation((fn) => {
      if (fn) manejador = fn;
    });
    vi.mocked(servicioAuth.obtenerRefreshTokenGuardado).mockReturnValue('rt-guardado');
    vi.mocked(servicioAuth.refrescarTokenApi).mockResolvedValue({ accessToken: 'acc-nuevo' });
    vi.mocked(api.api.get)
      .mockResolvedValueOnce(usuarioDe('Acme Panamá')) // rehidratación al montar
      .mockResolvedValueOnce(usuarioDe('Beta SA')); // re-sync tras el refresh

    render(
      <ProveedorAuth>
        <Sonda />
      </ProveedorAuth>,
    );
    expect(await screen.findByText('Acme Panamá')).toBeTruthy();

    // Otra pestaña cambió la empresa activa; el refresh silencioso trae token de Beta.
    await act(async () => {
      await manejador!();
    });

    expect(await screen.findByText('Beta SA')).toBeTruthy();
    // El re-sync NO debe reintentar el refresh ante un 401 propio (evita bucles).
    expect(vi.mocked(api.api.get)).toHaveBeenLastCalledWith('/auth/me', { omitirRefresco: true });
  });

  it('si /auth/me falla tras el refresh, conserva el usuario actual (best-effort)', async () => {
    let manejador: (() => Promise<string | null>) | null = null;
    vi.mocked(api.fijarManejadorRefresh).mockImplementation((fn) => {
      if (fn) manejador = fn;
    });
    vi.mocked(servicioAuth.obtenerRefreshTokenGuardado).mockReturnValue('rt-guardado');
    vi.mocked(servicioAuth.refrescarTokenApi).mockResolvedValue({ accessToken: 'acc-nuevo' });
    vi.mocked(api.api.get)
      .mockResolvedValueOnce(usuarioDe('Acme Panamá')) // rehidratación
      .mockRejectedValueOnce(new Error('offline')); // re-sync falla

    render(
      <ProveedorAuth>
        <Sonda />
      </ProveedorAuth>,
    );
    expect(await screen.findByText('Acme Panamá')).toBeTruthy();

    await act(async () => {
      const token = await manejador!();
      expect(token).toBe('acc-nuevo'); // el refresh en sí NO falla por el re-sync
    });

    expect(screen.getByText('Acme Panamá')).toBeTruthy(); // usuario intacto
  });
});
