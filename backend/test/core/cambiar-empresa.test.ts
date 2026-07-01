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

  it('super-admin: entra sin membresía y `autorizar` le abre rutas de admin DENTRO del tenant', async () => {
    const e1 = await nuevaEmpresa();
    const superAdmin = await nuevoUsuario(true);
    const tk = app.jwt.sign({ sub: superAdmin.id, rol: 'empleado', empresaId: null, esSuperAdmin: true });

    const res = await cambiar(tk, e1.id);
    expect(res.statusCode).toBe(200);
    const body = res.json() as RespCambio;
    expect(body.usuario.rol).toBe('empleado'); // mínimo privilegio
    expect(body.usuario.esSuperAdmin).toBe(true);
    expect(body.usuario.empresaId).toBe(e1.id);

    // Con el access NUEVO, una ruta autorizar('administrador') responde 201 dentro
    // del tenant: crea un usuario en e1 (operación real de soporte, con auditoría).
    const email = `soporte-${randomUUID()}@x.local`;
    const resCrear = await app.inject({
      method: 'POST',
      url: '/usuarios',
      headers: { authorization: `Bearer ${body.accessToken}` },
      payload: { nombre: 'Soporte', email, password: 'Clave123*', rol: 'empleado' },
    });
    expect(resCrear.statusCode).toBe(201);
    const creado = resCrear.json() as { id: string };
    const membresias = await semilla().membresia.findMany({ where: { usuarioId: creado.id } });
    expect(membresias).toHaveLength(1);
    expect(membresias[0]?.empresaId).toBe(e1.id); // en el tenant al que ENTRÓ
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

  it('super-admin: empresaId null = volver a plataforma (200, sin empresa activa)', async () => {
    const e1 = await nuevaEmpresa();
    const superAdmin = await nuevoUsuario(true);
    const tk = app.jwt.sign({
      sub: superAdmin.id,
      rol: 'empleado',
      empresaId: e1.id,
      esSuperAdmin: true,
    });
    const res = await cambiar(tk, null);
    expect(res.statusCode).toBe(200);
    const body = res.json() as RespCambio;
    expect(body.usuario.empresaId).toBeNull();
    expect(body.usuario.empresaNombre).toBeNull();
    const payload = app.jwt.verify<PayloadAccess>(body.accessToken);
    expect(payload.empresaId).toBeNull();
  });
});
