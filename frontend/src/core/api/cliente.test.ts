import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api, peticion, fijarAccessToken, fijarManejadorRefresh } from './cliente';

// Respuesta fetch mínima simulada.
function respuesta(status: number, cuerpo: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => cuerpo,
  } as Response;
}

describe('cliente HTTP — refresh-on-401', () => {
  beforeEach(() => {
    fijarAccessToken('viejo');
    fijarManejadorRefresh(null);
    vi.restoreAllMocks();
  });
  afterEach(() => {
    fijarAccessToken(null);
    fijarManejadorRefresh(null);
  });

  it('ante un 401, renueva el token y reintenta la petición una vez con el nuevo token', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(respuesta(401)) // 1.er intento: token expirado
      .mockResolvedValueOnce(respuesta(200, { ok: true })); // reintento: éxito
    const manejador = vi.fn(async () => {
      fijarAccessToken('nuevo'); // el manejador real fija el token en memoria
      return 'nuevo';
    });
    fijarManejadorRefresh(manejador);

    const resultado = await api.get<{ ok: boolean }>('/empleados');

    expect(resultado).toEqual({ ok: true });
    expect(manejador).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // El reintento llevó el token NUEVO en Authorization.
    const segundaCab = (fetchMock.mock.calls[1]![1] as RequestInit).headers as Record<string, string>;
    expect(segundaCab['Authorization']).toBe('Bearer nuevo');
  });

  it('si el refresco devuelve null (sesión muerta), no reintenta y propaga el error 401', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta(401, { mensaje: 'No autorizado' }));
    const manejador = vi.fn(async () => null);
    fijarManejadorRefresh(manejador);

    await expect(api.get('/empleados')).rejects.toThrow('No autorizado');
    expect(manejador).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1); // sin reintento
  });

  it('las peticiones con omitirAuth (las de /auth/*) NO disparan el refresco: evita el bucle', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(respuesta(401, { mensaje: 'credenciales' }));
    const manejador = vi.fn(async () => 'nuevo');
    fijarManejadorRefresh(manejador);

    await expect(peticion('/auth/refresh', { method: 'POST', omitirAuth: true })).rejects.toThrow('credenciales');
    expect(manejador).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('varias peticiones que reciben 401 a la vez renuevan el token UNA sola vez (dedup)', async () => {
    let refrescado = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      respuesta(refrescado ? 200 : 401, { ok: true }),
    );
    // El refresco queda PENDIENTE hasta que las 3 peticiones hayan llegado al 401
    // y compartan el mismo refresco en curso.
    let resolverRefresh!: (token: string | null) => void;
    const refrescoPendiente = new Promise<string | null>((res) => {
      resolverRefresh = res;
    });
    const manejador = vi.fn(() => refrescoPendiente);
    fijarManejadorRefresh(manejador);

    const todas = Promise.all([
      api.get<{ ok: boolean }>('/a'),
      api.get<{ ok: boolean }>('/b'),
      api.get<{ ok: boolean }>('/c'),
    ]);

    // Dar tiempo a que las 3 hagan su primer fetch (401) y entren al refresco compartido.
    await new Promise((r) => setTimeout(r, 0));
    refrescado = true;
    fijarAccessToken('nuevo');
    resolverRefresh('nuevo');

    const [a, b, c] = await todas;
    expect(a).toEqual({ ok: true });
    expect(b).toEqual({ ok: true });
    expect(c).toEqual({ ok: true });
    expect(manejador).toHaveBeenCalledTimes(1); // un único refresco compartido para las 3
  });
});
