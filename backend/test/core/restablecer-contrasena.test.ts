import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';

/**
 * Fase 4c — POST /usuarios/:usuarioId/restablecer-contrasena (dos niveles):
 * un admin del tenant restablece SOLO usuarios de su empresa (contraseña temporal
 * born-true + revocación de sesiones + auditoría); el super-admin obtiene el mismo
 * poder ENTRANDO a la empresa vía cambiar-empresa, y en plataforma queda fuera.
 * Denegación 404 ÚNICA (inexistente = otro tenant = plataforma): anti-enumeración.
 */
describe('Fase 4c — POST /usuarios/:id/restablecer-contrasena', () => {
  let app: FastifyInstance;
  const CLAVE_VIEJA = 'ClaveVieja1*';
  const TEMPORAL = 'Temporal123*';

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-restablecer';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  async function nuevaEmpresa() {
    return semilla().empresa.create({
      data: { nombre: `RC ${randomUUID().slice(0, 8)}`, slug: `rc-${randomUUID()}` },
    });
  }
  async function nuevoUsuario(opts: { esSuperAdmin?: boolean; conClave?: boolean } = {}) {
    return semilla().usuario.create({
      data: {
        nombre: 'U',
        email: `rc-${randomUUID()}@x.local`,
        passwordHash: opts.conClave ? await hashearContrasena(CLAVE_VIEJA) : 'x',
        esSuperAdmin: opts.esSuperAdmin ?? false,
      },
    });
  }
  async function conMembresia(usuarioId: string, empresaId: string, rol = 'empleado') {
    return semilla().membresia.create({
      data: { usuarioId, empresaId, rol: rol as 'empleado', predeterminada: true },
    });
  }
  function restablecer(token: string, usuarioId: string, contrasenaTemporal: unknown = TEMPORAL) {
    return app.inject({
      method: 'POST',
      url: `/usuarios/${usuarioId}/restablecer-contrasena`,
      headers: { authorization: `Bearer ${token}` },
      payload: { contrasenaTemporal },
    });
  }

  it('admin restablece a un usuario de SU empresa: 204, temporal born-true, sesiones fuera, auditado', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const objetivo = await nuevoUsuario({ conClave: true });
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(objetivo.id, empresa.id, 'empleado');

    // Sesión viva del objetivo (login real): el reset debe expulsarla.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: objetivo.email, password: CLAVE_VIEJA },
    });
    expect(login.statusCode).toBe(200);
    const { refreshToken } = login.json() as { refreshToken: string };

    const tk = app.jwt.sign({ sub: admin.id, rol: 'administrador', empresaId: empresa.id, esSuperAdmin: false });
    const res = await restablecer(tk, objetivo.id);
    expect(res.statusCode).toBe(204);

    // BD: hash argon2 NUEVO (jamás la temporal en claro) y obligación de rotarla.
    const enBd = await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } });
    expect(enBd.passwordHash.startsWith('$argon2')).toBe(true);
    expect(enBd.passwordHash).not.toBe(objetivo.passwordHash);
    expect(enBd.passwordHash).not.toContain(TEMPORAL);
    expect(enBd.debeCambiarContrasena).toBe(true);

    // Sesiones revocadas: el refresh viejo ya no vale.
    const sesiones = await semilla().sesionRefresco.findMany({ where: { usuarioId: objetivo.id } });
    expect(sesiones).toHaveLength(0);
    const refresco = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(refresco.statusCode).toBe(401);

    // Auditoría: asiento del ADMIN sobre el objetivo, en la empresa, SIN contraseña.
    const asientos = await semilla().auditoria.findMany({
      where: { entidad: 'usuario', entidadId: objetivo.id, accion: 'restablecer_contrasena' },
    });
    expect(asientos).toHaveLength(1);
    expect(asientos[0]?.usuarioId).toBe(admin.id);
    expect(asientos[0]?.empresaId).toBe(empresa.id);
    expect(asientos[0]?.detalle).toBeNull();
    expect(JSON.stringify(asientos[0])).not.toContain(TEMPORAL);

    // Fin a fin: el objetivo entra con la TEMPORAL y queda obligado a cambiarla.
    const loginTemporal = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: objetivo.email, password: TEMPORAL },
    });
    expect(loginTemporal.statusCode).toBe(200);
    expect((loginTemporal.json() as { usuario: { debeCambiarContrasena: boolean } }).usuario.debeCambiarContrasena).toBe(true);
  });

  it('objetivo de OTRA empresa, inexistente o super-admin: 404 con el MISMO cuerpo (anti-enumeración)', async () => {
    const empresa = await nuevaEmpresa();
    const otra = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const ajeno = await nuevoUsuario();
    const superAdmin = await nuevoUsuario({ esSuperAdmin: true });
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(ajeno.id, otra.id, 'empleado');

    const tk = app.jwt.sign({ sub: admin.id, rol: 'administrador', empresaId: empresa.id, esSuperAdmin: false });
    const resAjeno = await restablecer(tk, ajeno.id);
    const resInexistente = await restablecer(tk, randomUUID());
    const resSuper = await restablecer(tk, superAdmin.id);

    expect(resAjeno.statusCode).toBe(404);
    expect(resInexistente.statusCode).toBe(404);
    expect(resSuper.statusCode).toBe(404);
    // Indistinguibles: mismo cuerpo exacto.
    expect(resAjeno.body).toBe(resInexistente.body);
    expect(resSuper.body).toBe(resInexistente.body);

    // Nada cambió en los objetivos (hash y flag intactos, sin asientos).
    const ajenoBd = await semilla().usuario.findUniqueOrThrow({ where: { id: ajeno.id } });
    expect(ajenoBd.passwordHash).toBe('x');
    expect(ajenoBd.debeCambiarContrasena).toBe(false);
    const superBd = await semilla().usuario.findUniqueOrThrow({ where: { id: superAdmin.id } });
    expect(superBd.passwordHash).toBe('x');
    const asientos = await semilla().auditoria.findMany({
      where: { accion: 'restablecer_contrasena', usuarioId: admin.id },
    });
    expect(asientos).toHaveLength(0);
  });

  it('auto-restablecimiento: 400 (la propia cuenta va por cambiar-contrasena) y nada cambia', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    await conMembresia(admin.id, empresa.id, 'administrador');

    const tk = app.jwt.sign({ sub: admin.id, rol: 'administrador', empresaId: empresa.id, esSuperAdmin: false });
    const res = await restablecer(tk, admin.id);
    expect(res.statusCode).toBe(400);
    const enBd = await semilla().usuario.findUniqueOrThrow({ where: { id: admin.id } });
    expect(enBd.passwordHash).toBe('x'); // intacto
  });

  it('auto-restablecimiento con el PROPIO id en MAYÚSCULAS: sigue siendo 400 (no evade el guard)', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    await conMembresia(admin.id, empresa.id, 'administrador');

    // El uuid de Postgres es minúsculas; el patrón de la ruta admite MAYÚSCULAS. Un
    // `===` sensible a mayúsculas dejaría pasar el propio id en mayúsculas mientras
    // Prisma resuelve el mismo usuario (uuid case-insensitive) → toma de cuenta. El
    // servicio normaliza a minúsculas ANTES de comparar, así que sigue siendo 400.
    const tk = app.jwt.sign({ sub: admin.id, rol: 'administrador', empresaId: empresa.id, esSuperAdmin: false });
    const res = await restablecer(tk, admin.id.toUpperCase());
    expect(res.statusCode).toBe(400);
    const enBd = await semilla().usuario.findUniqueOrThrow({ where: { id: admin.id } });
    expect(enBd.passwordHash).toBe('x'); // intacto: no se restableció a sí mismo
    expect(enBd.debeCambiarContrasena).toBe(false);
  });

  it('objetivo super-admin CON membresía en la empresa: 404 por el guard esSuperAdmin, NO por falta de membresía', async () => {
    // Estado corrupto (invariante §4.2: un super-admin no debería tener membresías),
    // insertado a mano para PINEAR el guard `objetivo.esSuperAdmin`: sin él, la membresía
    // presente dejaría pasar el reset de una cuenta de plataforma. Debe cortar ANTES.
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const superConMembresia = await nuevoUsuario({ esSuperAdmin: true });
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(superConMembresia.id, empresa.id, 'administrador');

    const tk = app.jwt.sign({ sub: admin.id, rol: 'administrador', empresaId: empresa.id, esSuperAdmin: false });
    const res = await restablecer(tk, superConMembresia.id);
    expect(res.statusCode).toBe(404);
    const enBd = await semilla().usuario.findUniqueOrThrow({ where: { id: superConMembresia.id } });
    expect(enBd.passwordHash).toBe('x'); // la cuenta de plataforma quedó intacta
  });

  it('empleado y supervisor: 403 (solo administrador)', async () => {
    const empresa = await nuevaEmpresa();
    const objetivo = await nuevoUsuario();
    await conMembresia(objetivo.id, empresa.id, 'empleado');

    for (const rol of ['empleado', 'supervisor'] as const) {
      const tk = app.jwt.sign({ sub: randomUUID(), rol, empresaId: empresa.id, esSuperAdmin: false });
      const res = await restablecer(tk, objetivo.id);
      expect(res.statusCode).toBe(403);
    }
  });

  it('super-admin EN PLATAFORMA (empresaId null): 403 en la ruta de TENANT — usa el endpoint de PLATAFORMA (B2), no ésta', async () => {
    const empresa = await nuevaEmpresa();
    const objetivo = await nuevoUsuario();
    await conMembresia(objetivo.id, empresa.id, 'empleado');
    const superAdmin = await nuevoUsuario({ esSuperAdmin: true });

    const tk = app.jwt.sign({ sub: superAdmin.id, rol: 'empleado', empresaId: null, esSuperAdmin: true });
    const res = await restablecer(tk, objetivo.id);
    expect(res.statusCode).toBe(403);
  });

  it('B4 — super-admin NO entra a la empresa para usar esta ruta de tenant (cambiar-empresa → 403); el reset de admin va por el endpoint de PLATAFORMA', async () => {
    const empresa = await nuevaEmpresa();
    const objetivo = await nuevoUsuario();
    await conMembresia(objetivo.id, empresa.id, 'empleado');
    const superAdmin = await nuevoUsuario({ esSuperAdmin: true });

    const tkPlataforma = app.jwt.sign({ sub: superAdmin.id, rol: 'empleado', empresaId: null, esSuperAdmin: true });
    // B4: ya no puede ENTRAR (dos niveles eliminado).
    const entrar = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-empresa',
      headers: { authorization: `Bearer ${tkPlataforma}` },
      payload: { empresaId: empresa.id },
    });
    expect(entrar.statusCode).toBe(403);
    // Nada se restableció por la vía de tenant.
    const enBd = await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } });
    expect(enBd.debeCambiarContrasena).toBe(false);
  });

  it('cuenta DESACTIVADA: 409 (reactivar primero) y nada cambia — sin 204 engañoso', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const inactivo = await semilla().usuario.create({
      data: {
        nombre: 'U',
        email: `rc-${randomUUID()}@x.local`,
        passwordHash: 'x',
        activo: false,
      },
    });
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(inactivo.id, empresa.id, 'empleado');

    const tk = app.jwt.sign({ sub: admin.id, rol: 'administrador', empresaId: empresa.id, esSuperAdmin: false });
    const res = await restablecer(tk, inactivo.id);
    expect(res.statusCode).toBe(409);

    const enBd = await semilla().usuario.findUniqueOrThrow({ where: { id: inactivo.id } });
    expect(enBd.passwordHash).toBe('x'); // intacto: el reset no aplicó
    expect(enBd.debeCambiarContrasena).toBe(false);
    const asientos = await semilla().auditoria.findMany({
      where: { entidadId: inactivo.id, accion: 'restablecer_contrasena' },
    });
    expect(asientos).toHaveLength(0);
  });

  it('cuenta MULTI-EMPRESA: 409 para el admin de tenant (la contraseña es GLOBAL: fijarla sería toma de cuenta cross-tenant) y nada cambia', async () => {
    const empresa = await nuevaEmpresa();
    const otra = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const dual = await nuevoUsuario({ conClave: true });
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(dual.id, empresa.id, 'empleado');
    await semilla().membresia.create({
      data: { usuarioId: dual.id, empresaId: otra.id, rol: 'administrador' },
    });

    // Sesión viva del dual: el 409 NO debe expulsarla (cero efectos colaterales).
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: dual.email, password: CLAVE_VIEJA },
    });
    expect(login.statusCode).toBe(200);

    const tk = app.jwt.sign({ sub: admin.id, rol: 'administrador', empresaId: empresa.id, esSuperAdmin: false });
    const res = await restablecer(tk, dual.id);
    expect(res.statusCode).toBe(409);

    // Intacto TODO: hash, flag, sesiones; sin asiento. (Si este 409 no existiera,
    // el admin de A conocería la temporal de una cuenta con rol en B → escalada.)
    const enBd = await semilla().usuario.findUniqueOrThrow({ where: { id: dual.id } });
    expect(enBd.passwordHash).toBe(dual.passwordHash);
    expect(enBd.debeCambiarContrasena).toBe(false);
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: dual.id } })).toBe(1);
    expect(
      await semilla().auditoria.count({
        where: { entidadId: dual.id, accion: 'restablecer_contrasena' },
      }),
    ).toBe(0);
  });

  it('validación en la puerta: temporal corta → 400; uuid malformado → 400', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    await conMembresia(admin.id, empresa.id, 'administrador');
    const tk = app.jwt.sign({ sub: admin.id, rol: 'administrador', empresaId: empresa.id, esSuperAdmin: false });

    const corta = await restablecer(tk, randomUUID(), 'corta1*');
    expect(corta.statusCode).toBe(400);
    const malformado = await restablecer(tk, 'no-es-un-uuid');
    expect(malformado.statusCode).toBe(400);
  });
});
