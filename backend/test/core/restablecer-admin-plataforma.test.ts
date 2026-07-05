import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';

/**
 * Plataforma (B2) — POST /empresas/:empresaId/restablecer-admin: el super-admin
 * restablece la contraseña del admin PRINCIPAL de una empresa SIN entrar al tenant.
 * El servidor GENERA una temporal fuerte (no la acepta del body), la hashea (argon2),
 * fuerza el cambio en el primer login y revoca las sesiones del admin; la temporal se
 * devuelve EN CLARO UNA vez en la respuesta y NUNCA se persiste/audita/loguea. Audita
 * `resetear_password_admin` en AuditoriaPlataforma (no en la de tenant). Errores honestos
 * (super-admin god-view): 404 empresa/admin, 409 desactivada. Guard soloPlataforma (404).
 */
describe('Plataforma — POST /empresas/:id/restablecer-admin', () => {
  let app: FastifyInstance;
  let superAdminId: string;
  const CLAVE_VIEJA = 'ClaveVieja1*';

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-restablecer-admin-plat';
    const su = await semilla().usuario.create({
      data: {
        nombre: 'Plataforma',
        email: `super-ra-${randomUUID()}@gestorpro.local`,
        passwordHash: 'x',
        esSuperAdmin: true,
      },
    });
    superAdminId = su.id;
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  function tokenSuper(): string {
    return app.jwt.sign({ sub: superAdminId, rol: 'empleado', empresaId: null, esSuperAdmin: true });
  }
  async function nuevaEmpresa(activo = true) {
    return semilla().empresa.create({
      // B3: los reads van por `estado`; el boolean del helper se mapea (espejo coherente).
      data: {
        nombre: `RA ${randomUUID().slice(0, 8)}`,
        slug: `ra-${randomUUID()}`,
        activo,
        estado: activo ? 'activa' : 'suspendida',
      },
    });
  }
  /** Crea empresa + su admin PRINCIPAL (membresía predeterminada+administrador) con clave conocida. */
  async function empresaConAdmin(opts: { activoEmpresa?: boolean; activoAdmin?: boolean } = {}) {
    const empresa = await nuevaEmpresa(opts.activoEmpresa ?? true);
    const admin = await semilla().usuario.create({
      data: {
        nombre: 'Admin',
        email: `admin-ra-${randomUUID()}@x.local`,
        passwordHash: await hashearContrasena(CLAVE_VIEJA),
        activo: opts.activoAdmin ?? true,
      },
    });
    await semilla().membresia.create({
      data: { usuarioId: admin.id, empresaId: empresa.id, rol: 'administrador', predeterminada: true },
    });
    return { empresa, admin };
  }
  function resetear(token: string, empresaId: string) {
    return app.inject({
      method: 'POST',
      url: `/empresas/${empresaId}/restablecer-admin`,
      headers: { authorization: `Bearer ${token}` },
    });
  }

  it('happy: 200 con temporal EN CLARO; hash argon2 nuevo; debeCambiar=true; sesiones fuera; audita en AuditoriaPlataforma SIN clave; tenant auditoria intacta; login con la temporal fuerza el cambio', async () => {
    const { empresa, admin } = await empresaConAdmin();
    // Sesión viva del admin (login real): el reset debe expulsarla.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: admin.email, password: CLAVE_VIEJA },
    });
    expect(login.statusCode).toBe(200);
    const { refreshToken } = login.json() as { refreshToken: string };

    const res = await resetear(tokenSuper(), empresa.id);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { contrasenaTemporal: string; debeCambiarContrasena: boolean };
    expect(body.contrasenaTemporal.length).toBeGreaterThanOrEqual(16); // generada fuerte
    expect(body.debeCambiarContrasena).toBe(true);
    // Superficie MÍNIMA: la respuesta NO expone la identidad del objetivo (solo va al audit).
    expect(res.json()).not.toHaveProperty('usuarioId');
    expect(res.json()).not.toHaveProperty('email');
    expect(Object.keys(res.json() as object).sort()).toEqual(['contrasenaTemporal', 'debeCambiarContrasena']);

    // BD: hash argon2 NUEVO (jamás la temporal en claro) + obligación de rotarla.
    const enBd = await semilla().usuario.findUniqueOrThrow({ where: { id: admin.id } });
    expect(enBd.passwordHash.startsWith('$argon2')).toBe(true);
    expect(enBd.passwordHash).not.toBe(admin.passwordHash);
    expect(enBd.passwordHash).not.toContain(body.contrasenaTemporal);
    expect(enBd.debeCambiarContrasena).toBe(true);

    // Sesiones expulsadas: el refresh viejo ya no vale.
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: admin.id } })).toBe(0);
    const refresco = await app.inject({ method: 'POST', url: '/auth/refresh', payload: { refreshToken } });
    expect(refresco.statusCode).toBe(401);

    // Auditoría de PLATAFORMA: asiento del super-admin REAL, SIN contraseña en claro.
    const asientos = await semilla().auditoriaPlataforma.findMany({
      where: { empresaAfectadaId: empresa.id, accion: 'resetear_password_admin' },
    });
    expect(asientos).toHaveLength(1);
    expect(asientos[0]?.actorUsuarioId).toBe(superAdminId);
    // La identidad del objetivo vive SOLO aquí (audit), no en la respuesta.
    expect((asientos[0]?.detalle as { usuarioId: string }).usuarioId).toBe(admin.id);
    expect((asientos[0]?.detalle as { email: string }).email).toBe(admin.email);
    expect(JSON.stringify(asientos[0])).not.toContain(body.contrasenaTemporal);
    // La operación de plataforma NO contamina la bitácora de tenant.
    expect(await semilla().auditoria.count({ where: { entidadId: admin.id } })).toBe(0);

    // Fin a fin: la vieja ya NO entra; la temporal entra y exige cambio.
    const viejo = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: admin.email, password: CLAVE_VIEJA },
    });
    expect(viejo.statusCode).toBe(401);
    const conTemporal = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: admin.email, password: body.contrasenaTemporal },
    });
    expect(conTemporal.statusCode).toBe(200);
    expect(
      (conTemporal.json() as { usuario: { debeCambiarContrasena: boolean } }).usuario.debeCambiarContrasena,
    ).toBe(true);
  });

  it('genera una temporal DISTINTA en cada llamada (no determinista)', async () => {
    const { empresa } = await empresaConAdmin();
    const p1 = (await resetear(tokenSuper(), empresa.id)).json() as { contrasenaTemporal: string };
    const p2 = (await resetear(tokenSuper(), empresa.id)).json() as { contrasenaTemporal: string };
    expect(p1.contrasenaTemporal).not.toBe(p2.contrasenaTemporal);
  });

  it('empresa inexistente → 404; empresa desactivada → 409; empresa sin admin predeterminado → 404', async () => {
    expect((await resetear(tokenSuper(), randomUUID())).statusCode).toBe(404);
    const { empresa: inactiva } = await empresaConAdmin({ activoEmpresa: false });
    expect((await resetear(tokenSuper(), inactiva.id)).statusCode).toBe(409);
    const sinAdmin = await nuevaEmpresa(); // empresa SIN ninguna membresía admin
    expect((await resetear(tokenSuper(), sinAdmin.id)).statusCode).toBe(404);
  });

  it('cuenta del admin desactivada → 409 (reactivar primero) y nada cambia', async () => {
    const { empresa, admin } = await empresaConAdmin({ activoAdmin: false });
    const res = await resetear(tokenSuper(), empresa.id);
    expect(res.statusCode).toBe(409);
    const enBd = await semilla().usuario.findUniqueOrThrow({ where: { id: admin.id } });
    expect(enBd.passwordHash).toBe(admin.passwordHash); // intacto
    expect(enBd.debeCambiarContrasena).toBe(false);
    expect(
      await semilla().auditoriaPlataforma.count({
        where: { empresaAfectadaId: empresa.id, accion: 'resetear_password_admin' },
      }),
    ).toBe(0);
  });

  it('objetivo super-admin con membresía admin (estado corrupto §4.2) → 404 y la cuenta de plataforma queda intacta', async () => {
    const empresa = await nuevaEmpresa();
    const superConMembresia = await semilla().usuario.create({
      data: { nombre: 'S', email: `sc-${randomUUID()}@x.local`, passwordHash: 'x', esSuperAdmin: true },
    });
    await semilla().membresia.create({
      data: { usuarioId: superConMembresia.id, empresaId: empresa.id, rol: 'administrador', predeterminada: true },
    });
    const res = await resetear(tokenSuper(), empresa.id);
    expect(res.statusCode).toBe(404);
    expect(
      (await semilla().usuario.findUniqueOrThrow({ where: { id: superConMembresia.id } })).passwordHash,
    ).toBe('x'); // no se restableció una cuenta de plataforma
  });

  it('admin MULTI-EMPRESA: el super-admin SÍ resetea (autoridad cross-tenant, sin 409)', async () => {
    const { empresa, admin } = await empresaConAdmin();
    const otra = await nuevaEmpresa();
    await semilla().membresia.create({
      data: { usuarioId: admin.id, empresaId: otra.id, rol: 'empleado' },
    });
    const res = await resetear(tokenSuper(), empresa.id);
    expect(res.statusCode).toBe(200);
    expect(
      (await semilla().usuario.findUniqueOrThrow({ where: { id: admin.id } })).debeCambiarContrasena,
    ).toBe(true);
  });

  it('no super-admin (administrador/empleado) → 404, TAMBIÉN con uuid malformado (guards onRequest antes que ajv); super-admin en plataforma (empresaId null) SÍ puede', async () => {
    const { empresa } = await empresaConAdmin();
    for (const rol of ['administrador', 'empleado'] as const) {
      const tk = app.jwt.sign({ sub: randomUUID(), rol, empresaId: empresa.id, esSuperAdmin: false });
      expect((await resetear(tk, empresa.id)).statusCode).toBe(404);
    }
    // uuid malformado con token no-super: el guard 404 corta ANTES del 400 de ajv.
    const tkTenant = app.jwt.sign({ sub: randomUUID(), rol: 'administrador', empresaId: empresa.id, esSuperAdmin: false });
    const malformado = await app.inject({
      method: 'POST',
      url: '/empresas/no-es-uuid/restablecer-admin',
      headers: { authorization: `Bearer ${tkTenant}` },
    });
    expect(malformado.statusCode).toBe(404);
    // Es una ruta de PLATAFORMA: el super-admin la usa SIN entrar (empresaId null).
    expect((await resetear(tokenSuper(), empresa.id)).statusCode).toBe(200);
  });
});
