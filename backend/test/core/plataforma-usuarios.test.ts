import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';

/**
 * M3-plataforma — gestión GLOBAL de cuentas por el super-admin:
 *   PATCH /plataforma/usuarios/:id/estado (baja/reactivación global)
 *   POST  /plataforma/usuarios/:id/restablecer-contrasena (temporal global)
 * Estas SÍ operan sobre cuentas MULTI-EMPRESA (el módulo de tenant las rechaza con 409,
 * regresión pineada abajo). Guard soloPlataforma (404 al resto). Corre contra Postgres
 * real (Testcontainers) bajo gestorpro_app.
 */
describe('M3-plataforma — /plataforma/usuarios/:id (baja/reset global)', () => {
  let app: FastifyInstance;
  let superAdminId: string;
  const CLAVE = 'ClaveViva1*';

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-plataforma-usuarios';
    const su = await semilla().usuario.create({
      data: { nombre: 'Plataforma', email: `su-${randomUUID()}@gestorpro.local`, passwordHash: 'x', esSuperAdmin: true },
    });
    superAdminId = su.id;
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  function tokenSuper(id = superAdminId) {
    return app.jwt.sign({ sub: id, rol: 'empleado', empresaId: null, esSuperAdmin: true });
  }
  function tokenTenant(id: string, empresaId: string, rol: 'administrador' | 'supervisor' | 'empleado') {
    return app.jwt.sign({ sub: id, rol, empresaId, esSuperAdmin: false });
  }
  async function nuevaEmpresa() {
    return semilla().empresa.create({
      data: { nombre: `PU ${randomUUID().slice(0, 8)}`, slug: `pu-${randomUUID()}` },
    });
  }
  async function nuevoUsuario(opts: { esSuperAdmin?: boolean; conClave?: boolean; activo?: boolean } = {}) {
    return semilla().usuario.create({
      data: {
        nombre: 'U',
        email: `pu-${randomUUID()}@x.local`,
        passwordHash: opts.conClave ? await hashearContrasena(CLAVE) : 'x',
        esSuperAdmin: opts.esSuperAdmin ?? false,
        activo: opts.activo ?? true,
      },
    });
  }
  async function conMembresia(usuarioId: string, empresaId: string, rol: 'administrador' | 'empleado' = 'empleado') {
    return semilla().membresia.create({ data: { usuarioId, empresaId, rol, predeterminada: false } });
  }

  // ── Endpoints de PLATAFORMA ──────────────────────────────────────────────
  function plataformaEstado(token: string, usuarioId: string, activo: unknown) {
    return app.inject({
      method: 'PATCH',
      url: `/plataforma/usuarios/${usuarioId}/estado`,
      headers: { authorization: `Bearer ${token}` },
      payload: { activo },
    });
  }
  function plataformaReset(token: string, usuarioId: string) {
    return app.inject({
      method: 'POST',
      url: `/plataforma/usuarios/${usuarioId}/restablecer-contrasena`,
      headers: { authorization: `Bearer ${token}` },
    });
  }
  // ── Endpoints de TENANT (para las regresiones) ───────────────────────────
  function tenantEstado(token: string, usuarioId: string, activo: unknown) {
    return app.inject({
      method: 'PATCH',
      url: `/usuarios/${usuarioId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { activo },
    });
  }
  function tenantReset(token: string, usuarioId: string) {
    return app.inject({
      method: 'POST',
      url: `/usuarios/${usuarioId}/restablecer-contrasena`,
      headers: { authorization: `Bearer ${token}` },
      payload: { contrasenaTemporal: 'Temporal123*' },
    });
  }

  // ── Baja / reactivación de plataforma ────────────────────────────────────

  it('super-admin desactiva una cuenta de UNA empresa: 200, activo=false, sesiones expulsadas, sin tocar membresía', async () => {
    const empresa = await nuevaEmpresa();
    const objetivo = await nuevoUsuario({ conClave: true });
    await conMembresia(objetivo.id, empresa.id, 'empleado');
    // Sesión viva (login real) que la baja debe expulsar.
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: objetivo.email, password: CLAVE } });
    expect(login.statusCode).toBe(200);

    const res = await plataformaEstado(tokenSuper(), objetivo.id, false);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ id: objetivo.id, activo: false });
    expect(res.body).not.toContain('passwordHash');

    const enBd = await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } });
    expect(enBd.activo).toBe(false);
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: objetivo.id } })).toBe(0);
    // La membresía NO se toca (solo se dio de baja el Usuario global).
    expect(await semilla().membresia.count({ where: { usuarioId: objetivo.id } })).toBe(1);
  });

  it('super-admin desactiva y reactiva una cuenta MULTI-EMPRESA: 200 (NO 409), membresías intactas, Usuario.rol legacy sin cambios', async () => {
    const a = await nuevaEmpresa();
    const b = await nuevaEmpresa();
    const objetivo = await nuevoUsuario({ conClave: true });
    await conMembresia(objetivo.id, a.id, 'administrador');
    await conMembresia(objetivo.id, b.id, 'empleado');
    const rolLegacyAntes = (await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } })).rol;

    const baja = await plataformaEstado(tokenSuper(), objetivo.id, false);
    expect(baja.statusCode).toBe(200); // el tenant daría 409; plataforma NO
    expect((await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } })).activo).toBe(false);

    const alta = await plataformaEstado(tokenSuper(), objetivo.id, true);
    expect(alta.statusCode).toBe(200);
    expect((await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } })).activo).toBe(true);

    // Membresías (número y roles) intactas; Usuario.rol legacy sin cambios.
    const ms = await semilla().membresia.findMany({ where: { usuarioId: objetivo.id }, orderBy: { rol: 'asc' } });
    expect(ms).toHaveLength(2);
    expect(ms.map((m) => m.rol).sort()).toEqual(['administrador', 'empleado']);
    expect((await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } })).rol).toBe(rolLegacyAntes);
  });

  it('idempotente: pedir el estado que ya tiene → 200 sin segundo asiento', async () => {
    const objetivo = await nuevoUsuario({ activo: false });
    const res = await plataformaEstado(tokenSuper(), objetivo.id, false); // ya está inactivo
    expect(res.statusCode).toBe(200);
    const asientos = await semilla().auditoriaPlataforma.findMany({
      where: { accion: 'desactivar_usuario', detalle: { path: ['usuarioObjetivoId'], equals: objetivo.id } },
    });
    expect(asientos).toHaveLength(0);
  });

  // ── Guards de acceso ─────────────────────────────────────────────────────

  it('un token de TENANT (admin/supervisor/empleado) NO puede usar el endpoint de plataforma → 404', async () => {
    const empresa = await nuevaEmpresa();
    const objetivo = await nuevoUsuario();
    await conMembresia(objetivo.id, empresa.id, 'empleado');
    for (const rol of ['administrador', 'supervisor', 'empleado'] as const) {
      const tk = tokenTenant(randomUUID(), empresa.id, rol);
      const estado = await plataformaEstado(tk, objetivo.id, false);
      const reset = await plataformaReset(tk, objetivo.id);
      expect(estado.statusCode).toBe(404); // soloPlataforma: no revela el endpoint
      expect(reset.statusCode).toBe(404);
    }
    // Y NO mutó nada.
    expect((await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } })).activo).toBe(true);
  });

  it('usuario inexistente → 404', async () => {
    const res = await plataformaEstado(tokenSuper(), randomUUID(), false);
    expect(res.statusCode).toBe(404);
  });

  it('no puede desactivarse a SÍ MISMO (evita el auto-lockout de plataforma) → 400', async () => {
    const res = await plataformaEstado(tokenSuper(), superAdminId, false);
    expect(res.statusCode).toBe(400);
    expect((await semilla().usuario.findUniqueOrThrow({ where: { id: superAdminId } })).activo).toBe(true);
  });

  it('no puede operar sobre OTRA cuenta esSuperAdmin → 400 (sin mutación)', async () => {
    const otroSuper = await nuevoUsuario({ esSuperAdmin: true });
    const estado = await plataformaEstado(tokenSuper(), otroSuper.id, false);
    const reset = await plataformaReset(tokenSuper(), otroSuper.id);
    expect(estado.statusCode).toBe(400);
    expect(reset.statusCode).toBe(400);
    expect((await semilla().usuario.findUniqueOrThrow({ where: { id: otroSuper.id } })).activo).toBe(true);
  });

  // ── Reset de contraseña de plataforma ────────────────────────────────────

  it('reset de una cuenta de UNA empresa: 200, temporal EN CLARO, hash cambia, debeCambiar=true, sesiones fuera, membresía intacta', async () => {
    const empresa = await nuevaEmpresa();
    const objetivo = await nuevoUsuario({ conClave: true });
    await conMembresia(objetivo.id, empresa.id, 'empleado');
    const hashAntes = (await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } })).passwordHash;
    const login = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: objetivo.email, password: CLAVE } });
    expect(login.statusCode).toBe(200);

    const res = await plataformaReset(tokenSuper(), objetivo.id);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { contrasenaTemporal: string; debeCambiarContrasena: boolean };
    expect(typeof body.contrasenaTemporal).toBe('string');
    expect(body.contrasenaTemporal.length).toBeGreaterThan(10);
    expect(body.debeCambiarContrasena).toBe(true);

    const enBd = await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } });
    expect(enBd.passwordHash).not.toBe(hashAntes); // hash cambió
    expect(enBd.passwordHash.startsWith('$argon2')).toBe(true);
    expect(enBd.passwordHash).not.toContain(body.contrasenaTemporal); // jamás en claro en BD
    expect(enBd.debeCambiarContrasena).toBe(true);
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: objetivo.id } })).toBe(0);
    expect(await semilla().membresia.count({ where: { usuarioId: objetivo.id } })).toBe(1); // intacta
    // La temporal nueva sirve para entrar (y born-true forzará el cambio).
    const relogin = await app.inject({ method: 'POST', url: '/auth/login', payload: { email: objetivo.email, password: body.contrasenaTemporal } });
    expect(relogin.statusCode).toBe(200);
  });

  it('reset de una cuenta MULTI-EMPRESA: 200 (NO 409), membresías y Usuario.rol legacy intactos', async () => {
    const a = await nuevaEmpresa();
    const b = await nuevaEmpresa();
    const objetivo = await nuevoUsuario({ conClave: true });
    await conMembresia(objetivo.id, a.id, 'administrador');
    await conMembresia(objetivo.id, b.id, 'empleado');
    const rolLegacyAntes = (await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } })).rol;

    const res = await plataformaReset(tokenSuper(), objetivo.id);
    expect(res.statusCode).toBe(200); // el tenant daría 409; plataforma NO

    const ms = await semilla().membresia.findMany({ where: { usuarioId: objetivo.id } });
    expect(ms).toHaveLength(2);
    expect((await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } })).rol).toBe(rolLegacyAntes);
  });

  // ── Auditoría de plataforma ──────────────────────────────────────────────

  it('auditoría: baja y reset dejan asiento en AuditoriaPlataforma (actor, accion, detalle), empresa_afectada NULL, y NADA en la Auditoria de tenant', async () => {
    const empresa = await nuevaEmpresa();
    const objetivo = await nuevoUsuario();
    await conMembresia(objetivo.id, empresa.id, 'empleado');

    await plataformaEstado(tokenSuper(), objetivo.id, false);
    await plataformaReset(tokenSuper(), objetivo.id);

    const baja = await semilla().auditoriaPlataforma.findMany({
      where: { accion: 'desactivar_usuario', detalle: { path: ['usuarioObjetivoId'], equals: objetivo.id } },
    });
    expect(baja).toHaveLength(1);
    expect(baja[0]?.actorUsuarioId).toBe(superAdminId);
    expect(baja[0]?.empresaAfectadaId).toBeNull(); // operación global, sin empresa
    expect(baja[0]?.detalle).toMatchObject({ usuarioObjetivoId: objetivo.id, activo: false });

    const reset = await semilla().auditoriaPlataforma.findMany({
      where: { accion: 'restablecer_contrasena_usuario', detalle: { path: ['usuarioObjetivoId'], equals: objetivo.id } },
    });
    expect(reset).toHaveLength(1);
    expect(reset[0]?.actorUsuarioId).toBe(superAdminId);
    // El detalle del reset NUNCA lleva contraseña.
    expect(JSON.stringify(reset[0]?.detalle)).not.toMatch(/contrasena|password/i);

    // La Auditoria de TENANT no recibió NADA de estas operaciones globales.
    const tenant = await semilla().auditoria.findMany({ where: { entidadId: objetivo.id } });
    expect(tenant).toHaveLength(0);
  });

  // ── Regresión: el TENANT sigue rechazando las cuentas multi-empresa ──────

  it('regresión: el endpoint de TENANT sigue devolviendo 409 en baja y reset de una cuenta MULTI-EMPRESA', async () => {
    const a = await nuevaEmpresa();
    const b = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const objetivo = await nuevoUsuario({ conClave: true });
    await conMembresia(admin.id, a.id, 'administrador');
    await conMembresia(objetivo.id, a.id, 'empleado');
    await conMembresia(objetivo.id, b.id, 'empleado'); // multi-empresa
    const tk = tokenTenant(admin.id, a.id, 'administrador');

    expect((await tenantEstado(tk, objetivo.id, false)).statusCode).toBe(409);
    expect((await tenantReset(tk, objetivo.id)).statusCode).toBe(409);
    // Y NO se mutó nada por el camino de tenant.
    expect((await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } })).activo).toBe(true);
  });
});
