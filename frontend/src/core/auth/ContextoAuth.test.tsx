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
  esperarRefrescoEnCurso: vi.fn().mockResolvedValue(undefined),
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
    membresias: [],
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

describe('ContextoAuth — carreras de cambiarEmpresa (guard de versión de sesión)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.esperarRefrescoEnCurso).mockResolvedValue(undefined);
  });

  /** Sonda con acciones: expone cambiarEmpresa y cerrarSesion a los tests. */
  let acciones: { cambiarEmpresa: (id: string | null) => Promise<void>; cerrarSesion: () => Promise<void> };
  function SondaAcciones() {
    const ctx = useAuth();
    acciones = { cambiarEmpresa: ctx.cambiarEmpresa, cerrarSesion: ctx.cerrarSesion };
    if (ctx.cargando) return <div>cargando</div>;
    return <div>{ctx.usuario?.empresaNombre ?? 'sin-usuario'}</div>;
  }
  function montarSinSesion() {
    vi.mocked(servicioAuth.obtenerRefreshTokenGuardado).mockReturnValue(null);
    render(
      <ProveedorAuth>
        <SondaAcciones />
      </ProveedorAuth>,
    );
  }

  it('espera al refresco EN CURSO antes de pedir el cambio, y RE-IMPONE el token del cambio después', async () => {
    montarSinSesion();
    expect(await screen.findByText('sin-usuario')).toBeTruthy();
    vi.mocked(servicioAuth.cambiarEmpresaApi).mockResolvedValue({
      accessToken: 'acc-cambio',
      usuario: usuarioDe('Beta SA'),
    });

    await act(async () => {
      await acciones.cambiarEmpresa('id-Beta SA');
    });

    // Orden: esperar refresco → POST. Y tras el POST, SEGUNDA espera + re-imposición
    // del token del cambio (cubre un refresh que arrancó DURANTE el POST y escribió
    // su token viejo después del nuestro: la última escritura es la del cambio).
    const ordenEspera = vi.mocked(api.esperarRefrescoEnCurso).mock.invocationCallOrder;
    const ordenPost = vi.mocked(servicioAuth.cambiarEmpresaApi).mock.invocationCallOrder[0]!;
    expect(ordenEspera.length).toBe(2);
    expect(ordenEspera[0]!).toBeLessThan(ordenPost);
    expect(ordenEspera[1]!).toBeGreaterThan(ordenPost);
    const llamadasToken = vi.mocked(api.fijarAccessToken).mock.calls.map((c) => c[0]);
    expect(llamadasToken.filter((t) => t === 'acc-cambio')).toHaveLength(2); // imposición + re-imposición
    expect(llamadasToken[llamadasToken.length - 1]).toBe('acc-cambio'); // última escritura = cambio
    expect(screen.getByText('Beta SA')).toBeTruthy();
  });

  it('cerrar sesión con un cambiarEmpresa EN VUELO: el cambio tardío NO resucita la sesión', async () => {
    montarSinSesion();
    expect(await screen.findByText('sin-usuario')).toBeTruthy();

    // POST de cambio DIFERIDO: resolverá después del logout.
    let resolverCambio: (v: { accessToken: string; usuario: Usuario }) => void = () => {};
    vi.mocked(servicioAuth.cambiarEmpresaApi).mockReturnValue(
      new Promise((res) => {
        resolverCambio = res;
      }),
    );

    let promesaCambio: Promise<void>;
    await act(async () => {
      promesaCambio = acciones.cambiarEmpresa('id-Beta SA');
      await acciones.cerrarSesion(); // logout mientras el cambio viaja
    });
    await act(async () => {
      resolverCambio({ accessToken: 'acc-cambio', usuario: usuarioDe('Beta SA') });
      await promesaCambio!;
    });

    // La sesión sigue cerrada: ni usuario resucitado ni token del cambio escrito.
    expect(screen.getByText('sin-usuario')).toBeTruthy();
    const llamadasToken = vi.mocked(api.fijarAccessToken).mock.calls.map((c) => c[0]);
    expect(llamadasToken).not.toContain('acc-cambio');
    expect(llamadasToken[llamadasToken.length - 1]).toBeNull(); // la última escritura fue el logout
  });

  it('un /me tardío del refresh NO pisa al usuario recién cambiado de empresa', async () => {
    let manejador: (() => Promise<string | null>) | null = null;
    vi.mocked(api.fijarManejadorRefresh).mockImplementation((fn) => {
      if (fn) manejador = fn;
    });
    montarSinSesion();
    expect(await screen.findByText('sin-usuario')).toBeTruthy();

    // Refresh cuyo /me de re-sync queda DIFERIDO (resolverá tarde, con datos viejos).
    vi.mocked(servicioAuth.obtenerRefreshTokenGuardado).mockReturnValue('rt');
    vi.mocked(servicioAuth.refrescarTokenApi).mockResolvedValue({ accessToken: 'acc-refresh' });
    let resolverMe: (u: Usuario) => void = () => {};
    vi.mocked(api.api.get).mockReturnValue(
      new Promise((res) => {
        resolverMe = res;
      }),
    );
    await act(async () => {
      await manejador!();
    });

    // Mientras el /me viaja, el usuario CAMBIA de empresa (escritura intencional).
    vi.mocked(servicioAuth.cambiarEmpresaApi).mockResolvedValue({
      accessToken: 'acc-cambio',
      usuario: usuarioDe('Beta SA'),
    });
    await act(async () => {
      await acciones.cambiarEmpresa('id-Beta SA');
    });
    expect(screen.getByText('Beta SA')).toBeTruthy();

    // El /me tardío llega con la empresa VIEJA: el guard de versión lo descarta.
    await act(async () => {
      resolverMe(usuarioDe('Acme Panamá'));
    });
    expect(screen.getByText('Beta SA')).toBeTruthy(); // no fue pisado
  });
});
