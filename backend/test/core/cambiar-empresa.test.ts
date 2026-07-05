import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';
import type { PayloadAccess } from '../../src/core/auth/auth.tipos.js';

/**
 * Fase 4c — POST /auth/cambiar-empresa (HTTP) y su efecto sobre `autorizar`:
 * el super-admin que "entra" a una empresa (§4.4 modo 1) pasa los guards de rol
 * DENTRO de ese tenant (su poder viene de esSuperAdmin, no del rol `empleado` del
 * token); con empresaId=null NO pasa. Corre contra Postgres real (Testcontainers).
 */
describe('Fase 4c — POST /auth/cambiar-empresa (HTTP)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-cambiar-empresa';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  async function nuevaEmpresa() {
    return semilla().empresa.create({
      data: { nombre: `CE ${randomUUID().slice(0, 8)}`, slug: `ce-${randomUUID()}` },
    });
  }
  async function nuevoUsuario(esSuperAdmin = false) {
    return semilla().usuario.create({
      data: {
        nombre: 'U',
        email: `ce-${randomUUID()}@x.local`,
        passwordHash: 'x',
        esSuperAdmin,
      },
    });
  }
  function cambiar(token: string | null, empresaId: unknown) {
    return app.inject({
      method: 'POST',
      url: '/auth/cambiar-empresa',
      ...(token ? { headers: { authorization: `Bearer ${token}` } } : {}),
      payload: { empresaId },
    });
  }

  type RespCambio = {
    accessToken: string;
    usuario: {
      rol: string;
      empresaId: string | null;
      empresaNombre: string | null;
      esSuperAdmin: boolean;
    };
  };

  it('401 sin token', async () => {
    const res = await cambiar(null, randomUUID());
    expect(res.statusCode).toBe(401);
  });

  it('400 si empresaId no tiene forma de uuid (nunca llega a Prisma)', async () => {
    const u = await nuevoUsuario();
    const tk = app.jwt.sign({ sub: u.id, rol: 'administrador', empresaId: null, esSuperAdmin: false });
    const res = await cambiar(tk, 'no-es-un-uuid');
    expect(res.statusCode).toBe(400);
  });

  it('usuario con membresía: 200 con access NUEVO de la destino y usuario público', async () => {
    const e1 = await nuevaEmpresa();
    const e2 = await nuevaEmpresa();
    const u = await nuevoUsuario();
    await semilla().membresia.create({
      data: { usuarioId: u.id, empresaId: e1.id, rol: 'administrador', predeterminada: true },
    });
    await semilla().membresia.create({
      data: { usuarioId: u.id, empresaId: e2.id, rol: 'supervisor', predeterminada: false },
    });

    const tk = app.jwt.sign({ sub: u.id, rol: 'administrador', empresaId: e1.id, esSuperAdmin: false });
    const res = await cambiar(tk, e2.id);
    expect(res.statusCode).toBe(200);
    const body = res.json() as RespCambio;
    expect(body.usuario.empresaId).toBe(e2.id);
    expect(body.usuario.empresaNombre).toBe(e2.nombre);
    expect(body.usuario.rol).toBe('supervisor');
    // El access devuelto es un JWT REAL firmado con la empresa destino.
    const payload = app.jwt.verify<PayloadAccess>(body.accessToken);
    expect(payload.empresaId).toBe(e2.id);
    expect(payload.rol).toBe('supervisor');
  });

  it('sin membresía en la destino: 403 con mensaje único (no revela existencia)', async () => {
    const e1 = await nuevaEmpresa();
    const ajena = await nuevaEmpresa();
    const u = await nuevoUsuario();
    await semilla().membresia.create({
      data: { usuarioId: u.id, empresaId: e1.id, rol: 'administrador', predeterminada: true },
    });
    const tk = app.jwt.sign({ sub: u.id, rol: 'administrador', empresaId: e1.id, esSuperAdmin: false });

    const resAjena = await cambiar(tk, ajena.id);
    const resInexistente = await cambiar(tk, randomUUID());
    expect(resAjena.statusCode).toBe(403);
    expect(resInexistente.statusCode).toBe(403);
    // Mismo cuerpo exacto: sin membresía e inexistente son INDISTINGUIBLES.
    expect(resAjena.body).toBe(resInexistente.body);
  });

  it('contraseña temporal: bloqueado por el cambio forzado (403 DEBE_CAMBIAR_CONTRASENA)', async () => {
    const e1 = await nuevaEmpresa();
    const u = await nuevoUsuario();
    const tk = app.jwt.sign({
      sub: u.id,
      rol: 'administrador',
      empresaId: e1.id,
      esSuperAdmin: false,
      debeCambiarContrasena: true,
    });
    const res = await cambiar(tk, e1.id);
    expect(res.statusCode).toBe(403);
    expect((res.json() as { codigo?: string }).codigo).toBe('DEBE_CAMBIAR_CONTRASENA');
  });

  it('B4 — super-admin: NO puede entrar a ningún tenant (cambiar-empresa → 403, mismo mensaje anti-enumeración)', async () => {
    const e1 = await nuevaEmpresa();
    const superAdmin = await nuevoUsuario(true);
    const tk = app.jwt.sign({ sub: superAdmin.id, rol: 'empleado', empresaId: null, esSuperAdmin: true });

    const res = await cambiar(tk, e1.id);
    // B4: sin membresía → 403 (el super-admin nunca la tiene). No obtiene contexto de tenant.
    expect(res.statusCode).toBe(403);
    // Mismo cuerpo que "sin membresía"/"inexistente": indistinguible (anti-enumeración).
    const usuarioNormal = await nuevoUsuario();
    await semilla().membresia.create({
      data: { usuarioId: usuarioNormal.id, empresaId: e1.id, rol: 'administrador', predeterminada: true },
    });
    const tkNormal = app.jwt.sign({ sub: usuarioNormal.id, rol: 'administrador', empresaId: e1.id, esSuperAdmin: false });
    const resSinMembresia = await cambiar(tkNormal, randomUUID());
    expect(res.body).toBe(resSinMembresia.body);
  });

  it('super-admin EN PLATAFORMA (empresaId null): `autorizar` NO le abre rutas de tenant', async () => {
    const superAdmin = await nuevoUsuario(true);
    const tk = app.jwt.sign({ sub: superAdmin.id, rol: 'empleado', empresaId: null, esSuperAdmin: true });
    const res = await app.inject({
      method: 'POST',
      url: '/usuarios',
      headers: { authorization: `Bearer ${tk}` },
      payload: {
        nombre: 'Nadie',
        email: `nadie-${randomUUID()}@x.local`,
        password: 'Clave123*',
        rol: 'empleado',
      },
    });
    expect(res.statusCode).toBe(403); // fuera de un tenant no hay nada que autorizar
  });

  it('B4 — super-admin con token empresaId=null: cambiar-empresa(null) → 200 no-op (queda en plataforma)', async () => {
    const superAdmin = await nuevoUsuario(true);
    // Tras B4 el token del super-admin SIEMPRE trae empresaId=null (su único estado).
    const tk = app.jwt.sign({ sub: superAdmin.id, rol: 'empleado', empresaId: null, esSuperAdmin: true });
    const res = await cambiar(tk, null);
    expect(res.statusCode).toBe(200);
    const body = res.json() as RespCambio;
    expect(body.usuario.empresaId).toBeNull();
    expect(body.usuario.empresaNombre).toBeNull();
    const payload = app.jwt.verify<PayloadAccess>(body.accessToken);
    expect(payload.empresaId).toBeNull();
  });

  it('B4 — token RESIDUAL esSuperAdmin=true + empresaId≠null es RECHAZADO (403) en cualquier ruta autenticada', async () => {
    const e1 = await nuevaEmpresa();
    const superAdmin = await nuevoUsuario(true);
    // Token firmado ANTES de B4 (o forjado): super-admin con contexto de tenant. autenticar
    // lo rechaza con 403 sin esperar su TTL — no puede portar contexto de negocio.
    const tkResidual = app.jwt.sign({ sub: superAdmin.id, rol: 'empleado', empresaId: e1.id, esSuperAdmin: true });
    // cambiar-empresa (ruta [autenticar]):
    expect((await cambiar(tkResidual, e1.id)).statusCode).toBe(403);
    // /auth/me (ruta [autenticar]): también 403.
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${tkResidual}` } });
    expect(me.statusCode).toBe(403);
  });
});
