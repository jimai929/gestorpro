import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';
import type { PayloadAccess } from '../../src/core/auth/auth.tipos.js';

/**
 * B4 — CIERRE CENTRAL: el super-admin SOLO opera la plataforma. Nunca entra a un tenant
 * ni porta contexto de negocio. Se verifica el cierre en la capa de auth (no ruta por
 * ruta):
 *  - login/refresh dan SIEMPRE empresaId=null para el super-admin;
 *  - cambiar-empresa a un tenant → 403;
 *  - un token RESIDUAL esSuperAdmin+empresaId≠null es rechazado (403) en cualquier ruta
 *    autenticada, sin esperar su TTL (cierra el residuo de ≤15 min);
 *  - las rutas de tenant (autorizar y las autenticar-only bajo RLS) no dan datos al
 *    super-admin en plataforma;
 *  - la plataforma (soloPlataforma) y el usuario NORMAL siguen intactos.
 */
describe('B4 — super-admin sin contexto de tenant (cierre central)', () => {
  let app: FastifyInstance;
  const CLAVE = 'ClaveViva1*';

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-b4-cierre';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  async function nuevaEmpresa(activo = true) {
    return semilla().empresa.create({
      data: { nombre: `B4 ${randomUUID().slice(0, 8)}`, slug: `b4-${randomUUID()}`, activo },
    });
  }
  async function superAdminConClave() {
    return semilla().usuario.create({
      data: {
        nombre: 'Plataforma',
        email: `b4-super-${randomUUID()}@gestorpro.local`,
        passwordHash: await hashearContrasena(CLAVE),
        esSuperAdmin: true,
      },
    });
  }
  function login(email: string) {
    return app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: CLAVE } });
  }
  function conToken(method: 'GET' | 'POST' | 'PATCH', url: string, token: string, payload?: unknown) {
    return app.inject({ method, url, headers: { authorization: `Bearer ${token}` }, ...(payload ? { payload } : {}) });
  }

  it('login del super-admin: empresaId=null en el usuario público y en el access token', async () => {
    const su = await superAdminConClave();
    const res = await login(su.email);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { accessToken: string; usuario: { empresaId: string | null; esSuperAdmin: boolean } };
    expect(body.usuario.empresaId).toBeNull();
    expect(body.usuario.esSuperAdmin).toBe(true);
    expect(app.jwt.verify<PayloadAccess>(body.accessToken).empresaId).toBeNull();
  });

  it('cambiar-empresa a un tenant → 403 (no puede entrar); refresh sigue en plataforma (empresaId=null)', async () => {
    const su = await superAdminConClave();
    const empresa = await nuevaEmpresa();
    const res = await login(su.email);
    const { accessToken, refreshToken } = res.json() as { accessToken: string; refreshToken: string };

    const entrar = await conToken('POST', '/auth/cambiar-empresa', accessToken, { empresaId: empresa.id });
    expect(entrar.statusCode).toBe(403);

    const refresco = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });
    expect(refresco.statusCode).toBe(200);
    expect(app.jwt.verify<PayloadAccess>((refresco.json() as { accessToken: string }).accessToken).empresaId).toBeNull();
  });

  it('token RESIDUAL esSuperAdmin+empresaId≠null → 403 en rutas autenticadas (business API y /auth/me), sin leer datos', async () => {
    const su = await superAdminConClave();
    const empresa = await nuevaEmpresa();
    // Token firmado como ANTES de B4 (contexto de tenant): rechazado por autenticar.
    const residual = app.jwt.sign({ sub: su.id, rol: 'empleado', empresaId: empresa.id, esSuperAdmin: true });

    // Rutas de negocio (autenticar-only y con rol) + /auth/me: TODAS 403 en autenticar,
    // ningún dato. (Rutas reales verificadas: /sedes, /categorias-gasto, /ventas/cajeras.)
    for (const url of ['/sedes', '/categorias-gasto', '/ventas/cajeras', '/usuarios', '/auth/me']) {
      expect((await conToken('GET', url, residual)).statusCode).toBe(403);
    }
  });

  it('super-admin en plataforma (empresaId=null): rutas de tenant con rol → 403; autenticar-only bajo RLS → sin datos', async () => {
    const su = await superAdminConClave();
    const tk = app.jwt.sign({ sub: su.id, rol: 'empleado', empresaId: null, esSuperAdmin: true });

    // Con rol: autorizar (sin bypass) → 403.
    expect((await conToken('GET', '/usuarios', tk)).statusCode).toBe(403);
    // autenticar-only: pasa el guard pero RLS con empresaId=null → 0 filas (fail-closed).
    const sedes = await conToken('GET', '/sedes', tk);
    expect(sedes.statusCode).toBe(200);
    expect((sedes.json() as unknown[]).length).toBe(0);
  });

  it('la PLATAFORMA sigue abierta al super-admin: GET /empresas → 200', async () => {
    const su = await superAdminConClave();
    const tk = app.jwt.sign({ sub: su.id, rol: 'empleado', empresaId: null, esSuperAdmin: true });
    expect((await conToken('GET', '/empresas', tk)).statusCode).toBe(200);
  });

  it('usuario NORMAL multi-empresa: cambiar-empresa entre SUS empresas sigue 200 (no afectado por B4)', async () => {
    const e1 = await nuevaEmpresa();
    const e2 = await nuevaEmpresa();
    const u = await semilla().usuario.create({
      data: { nombre: 'U', email: `b4-u-${randomUUID()}@x.local`, passwordHash: await hashearContrasena(CLAVE) },
    });
    await semilla().membresia.create({ data: { usuarioId: u.id, empresaId: e1.id, rol: 'administrador', predeterminada: true } });
    await semilla().membresia.create({ data: { usuarioId: u.id, empresaId: e2.id, rol: 'supervisor' } });

    const res = await login(u.email);
    const { accessToken } = res.json() as { accessToken: string };
    const cambio = await conToken('POST', '/auth/cambiar-empresa', accessToken, { empresaId: e2.id });
    expect(cambio.statusCode).toBe(200);
    expect((cambio.json() as { usuario: { empresaId: string } }).usuario.empresaId).toBe(e2.id);
  });
});
