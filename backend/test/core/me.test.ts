import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';

/**
 * 4c.5 — GET /auth/me devuelve rol/empresaId/esSuperAdmin tomados del TOKEN
 * (contexto activo), no del registro global de usuario. Alinea /me con el contrato
 * de /login (UsuarioPublico) y evita que el rol global legado contradiga al de la
 * membresía activa.
 */
describe('4c.5 — GET /auth/me', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-me';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  async function nuevoUsuario(esSuperAdmin = false) {
    return semilla().usuario.create({
      data: { nombre: 'U', email: `me-${randomUUID()}@x.local`, passwordHash: 'x', esSuperAdmin },
    });
  }

  type RespMe = {
    id: string;
    rol: string;
    empresaId: string | null;
    esSuperAdmin: boolean;
    debeCambiarContrasena: boolean;
  };

  it('usuario normal: /me refleja el rol y empresaId del TOKEN, no el rol global', async () => {
    const u = await nuevoUsuario(false); // rol global = empleado (default del schema)
    const empresaId = randomUUID();
    const token = app.jwt.sign({ sub: u.id, rol: 'administrador', empresaId, esSuperAdmin: false });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RespMe;
    expect(body.id).toBe(u.id);
    expect(body.rol).toBe('administrador'); // del token (membresía), NO el global 'empleado'
    expect(body.empresaId).toBe(empresaId);
    expect(body.esSuperAdmin).toBe(false);
    expect(body.debeCambiarContrasena).toBe(false); // token sin el campo → false (?? false)
  });

  it('/me refleja debeCambiarContrasena=true del token', async () => {
    const u = await nuevoUsuario(false);
    const token = app.jwt.sign({
      sub: u.id,
      rol: 'administrador',
      empresaId: randomUUID(),
      esSuperAdmin: false,
      debeCambiarContrasena: true,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect((res.json() as RespMe).debeCambiarContrasena).toBe(true);
  });

  it('super-admin: /me devuelve empresaId=null y esSuperAdmin=true', async () => {
    const u = await nuevoUsuario(true);
    const token = app.jwt.sign({ sub: u.id, rol: 'empleado', empresaId: null, esSuperAdmin: true });
    const res = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as RespMe;
    expect(body.empresaId).toBeNull();
    expect(body.esSuperAdmin).toBe(true);
  });
});
