import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { authPlugin } from '../../src/core/auth/auth.plugin.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';

/**
 * 4c.1 — guard `soloPlataforma`. App MÍNIMA con una ruta protegida por
 * [autenticar, soloPlataforma]: aísla el guard sin depender de ningún endpoint de
 * plataforma. Regla de diseño: un no-super-admin recibe 404 (NO 403), para no
 * revelar la existencia del endpoint (anti-enumeración).
 */
describe('4c.1 — guard soloPlataforma', () => {
  let app: FastifyInstance;
  let superAdminId: string;
  let empresaId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-solo-plataforma';
    // Entidades REALES: desde I5, `autenticar` verifica por request la empresa del
    // token y el claim esSuperAdmin contra BD (inexistente = revocado → 401), y este
    // suite prueba el guard soloPlataforma, no el corte de I5.
    const su = await semilla().usuario.create({
      data: {
        nombre: 'Plataforma',
        email: `sp-${randomUUID()}@gestorpro.local`,
        passwordHash: 'x',
        esSuperAdmin: true,
      },
    });
    superAdminId = su.id;
    const empresa = await semilla().empresa.create({
      data: { nombre: `SP ${randomUUID().slice(0, 8)}`, slug: `sp-${randomUUID()}` },
    });
    empresaId = empresa.id;
    app = Fastify();
    await app.register(authPlugin);
    app.get(
      '/_test/plataforma',
      { preHandler: [app.autenticar, app.soloPlataforma] },
      async () => ({ ok: true }),
    );
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  function token(esSuperAdmin: boolean): string {
    return app.jwt.sign({
      sub: esSuperAdmin ? superAdminId : randomUUID(),
      rol: 'administrador',
      empresaId: esSuperAdmin ? null : empresaId,
      esSuperAdmin,
    });
  }

  it('sin token → 401 (autenticar corta antes del guard)', async () => {
    const res = await app.inject({ method: 'GET', url: '/_test/plataforma' });
    expect(res.statusCode).toBe(401);
  });

  it('admin normal (esSuperAdmin=false) → 404 (no revela el endpoint)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/_test/plataforma',
      headers: { authorization: `Bearer ${token(false)}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('super-admin (esSuperAdmin=true) → 200 (pasa el guard)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/_test/plataforma',
      headers: { authorization: `Bearer ${token(true)}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
