import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';
import { sembrarDosEmpresas, type DosEmpresas } from './_fixture-dos-empresas.js';

/**
 * ⑥ Bypass acotado del kiosco (Fase 8, HTTP). `POST /fichajes` es público: el
 * dispositivo se identifica con su token (header `x-kiosco-token`).
 * `resolverContextoKiosco` usa `txBootstrapDispositivo` (bypass acotado a LEER la
 * fila del kiosco) y RESUELVE el `empresaId` de la sede del kiosco; el fichaje en
 * sí corre DESPUÉS bajo RLS normal de ESA empresa. Por tanto un token de kiosco solo
 * puede operar datos del tenant dueño del kiosco, nunca de otro.
 */
describe('Fase 8 ⑥ — kiosco: el token solo opera su propio tenant', () => {
  let app: FastifyInstance;
  let f: DosEmpresas;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-kiosco-bypass';
    f = await sembrarDosEmpresas();
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  it('6.1 token de A + empleado de A ⇒ 201 registrado (opera en su tenant)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/fichajes',
      headers: { 'x-kiosco-token': f.A.kioscoToken },
      payload: {
        kioscoId: f.A.kioscoId,
        tipo: 'entrada',
        numero: f.A.empleadoNumero,
        fotoCaptura: 'sim:match',
      },
    });
    expect(res.statusCode).toBe(201);
    expect((res.json() as { estado: string }).estado).toBe('registrado');
    // God-view: el fichaje quedó colgado del empleado de A.
    expect(await semilla().fichaje.count({ where: { empleadoId: f.A.empleadoId } })).toBeGreaterThan(0);
  });

  it('6.2 token de B contra empleado de A ⇒ 404 (no cruza el tenant del kiosco)', async () => {
    const antes = await semilla().fichaje.count({ where: { empleadoId: f.A.empleadoId } });
    const res = await app.inject({
      method: 'POST',
      url: '/fichajes',
      headers: { 'x-kiosco-token': f.B.kioscoToken },
      payload: {
        kioscoId: f.B.kioscoId, // kiosco (y token) de B: el device-auth SÍ pasa (token válido de B)
        tipo: 'entrada',
        numero: f.A.empleadoNumero, // empleado de A: invisible bajo el contexto de B
        fotoCaptura: 'sim:match',
      },
    });
    // El token de B es válido (no 401), pero el empleado de A no existe en el tenant
    // del kiosco → 404 "no identificado". 404 (no 403/401-revelador) es la convención
    // anti-enumeración: no se revela que el empleado existe en OTRO tenant.
    expect(res.statusCode).toBe(404);
    // Y NO se creó ningún fichaje para el empleado de A.
    expect(await semilla().fichaje.count({ where: { empleadoId: f.A.empleadoId } })).toBe(antes);
  });

  it('6.3 token de kiosco falsificado ⇒ 401, sin bypass', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/fichajes',
      headers: { 'x-kiosco-token': 'token-falsificado-' + randomUUID() },
      payload: { kioscoId: f.A.kioscoId, tipo: 'entrada', numero: f.A.empleadoNumero, fotoCaptura: 'sim:match' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('6.3b sin header de token ⇒ 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/fichajes',
      payload: { kioscoId: f.A.kioscoId, tipo: 'entrada', numero: f.A.empleadoNumero, fotoCaptura: 'sim:match' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('6.6 token de un kiosco inactivo ⇒ 401', async () => {
    const token = randomUUID() + randomUUID();
    const kiosco = await semilla().kiosco.create({
      data: {
        nombre: `K-inactivo-${randomUUID().slice(0, 8)}`,
        sedeId: f.A.sedeId,
        tokenHash: await hashearContrasena(token),
        activo: false,
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/fichajes',
      headers: { 'x-kiosco-token': token },
      payload: { kioscoId: kiosco.id, tipo: 'entrada', numero: f.A.empleadoNumero, fotoCaptura: 'sim:match' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('6.5 GET /kioscos público NO expone modoExcepcion ni tokenHash', async () => {
    const res = await app.inject({ method: 'GET', url: '/kioscos' });
    expect(res.statusCode).toBe(200);
    const kioscos = res.json() as Array<Record<string, unknown>>;
    expect(kioscos.length).toBeGreaterThan(0);
    for (const k of kioscos) {
      expect(k.tokenHash).toBeUndefined();
      expect(k.modoExcepcion).toBeUndefined();
      // La sede expuesta solo lleva nombre, nunca su modoExcepcion.
      const sede = k.sede as Record<string, unknown> | undefined;
      if (sede) expect(sede.modoExcepcion).toBeUndefined();
    }
  });
});
