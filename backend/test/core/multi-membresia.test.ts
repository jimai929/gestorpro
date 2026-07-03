import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';

/**
 * Multi-membresía (Fase 4c, cierre): fallback del contexto activo sobre empresas
 * ACTIVAS + membresías en UsuarioPublico (selector del front).
 * - La baja de la empresa PREDETERMINADA ya no bloquea al usuario de sus otras
 *   empresas (cerraba BUGS_PREEXISTENTES: antes login/refresh daban 401 total).
 * - login y /me devuelven `membresias` (solo activas, orden predeterminada primero).
 */
describe('Fase 4c — multi-membresía: fallback + selector', () => {
  let app: FastifyInstance;
  const CLAVE = 'ClaveViva1*';

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-multi-membresia';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  async function nuevaEmpresa(nombre: string, activo = true) {
    return semilla().empresa.create({
      data: { nombre, slug: `mm-${randomUUID()}`, activo },
    });
  }
  async function usuarioConClave() {
    return semilla().usuario.create({
      data: { nombre: 'Multi', email: `mm-${randomUUID()}@x.local`, passwordHash: await hashearContrasena(CLAVE) },
    });
  }
  function login(email: string) {
    return app.inject({ method: 'POST', url: '/auth/login', payload: { email, password: CLAVE } });
  }

  type Publico = {
    empresaId: string | null;
    empresaNombre: string | null;
    rol: string;
    membresias: { empresaId: string; empresaNombre: string; rol: string }[];
  };

  it('login devuelve las membresías ACTIVAS (predeterminada primero) y excluye las de empresas dadas de baja', async () => {
    const alfa = await nuevaEmpresa('Alfa');
    const beta = await nuevaEmpresa('Beta');
    const caida = await nuevaEmpresa('Caída', false);
    const u = await usuarioConClave();
    await semilla().membresia.create({
      data: { usuarioId: u.id, empresaId: alfa.id, rol: 'administrador', predeterminada: true },
    });
    await semilla().membresia.create({
      data: { usuarioId: u.id, empresaId: beta.id, rol: 'empleado' },
    });
    await semilla().membresia.create({
      data: { usuarioId: u.id, empresaId: caida.id, rol: 'empleado' },
    });

    const res = await login(u.email);
    expect(res.statusCode).toBe(200);
    const { usuario } = res.json() as { usuario: Publico };
    // Entra en la predeterminada, con su rol de MEMBRESÍA en ella.
    expect(usuario.empresaId).toBe(alfa.id);
    expect(usuario.rol).toBe('administrador');
    // Selector: SOLO las activas, predeterminada primero; la caída es invisible.
    expect(usuario.membresias).toEqual([
      { empresaId: alfa.id, empresaNombre: 'Alfa', rol: 'administrador' },
      { empresaId: beta.id, empresaNombre: 'Beta', rol: 'empleado' },
    ]);
  });

  it('FALLBACK: predeterminada dada de baja → login entra a la siguiente activa (antes: lockout total)', async () => {
    const caida = await nuevaEmpresa('Predeterminada Caída', false);
    const viva = await nuevaEmpresa('Viva');
    const u = await usuarioConClave();
    await semilla().membresia.create({
      data: { usuarioId: u.id, empresaId: caida.id, rol: 'administrador', predeterminada: true },
    });
    await semilla().membresia.create({
      data: { usuarioId: u.id, empresaId: viva.id, rol: 'empleado' },
    });

    const res = await login(u.email);
    expect(res.statusCode).toBe(200); // antes: 401 (BUGS_PREEXISTENTES, cerrado aquí)
    const { usuario } = res.json() as { usuario: Publico };
    expect(usuario.empresaId).toBe(viva.id);
    expect(usuario.rol).toBe('empleado');
    expect(usuario.membresias).toEqual([
      { empresaId: viva.id, empresaNombre: 'Viva', rol: 'empleado' },
    ]);
  });

  it('SIN fallback en refresh: la empresa activa de la sesión cae → 401 (nada de conmutar en silencio); el RE-LOGIN sí entra a la otra', async () => {
    // Deliberado (hallazgo del revisor): si el refresh conmutara de empresa, el
    // retry-on-401 del cliente RE-EJECUTARÍA la mutación en vuelo contra la otra
    // empresa (dinero al tenant equivocado, invisible). El refresh falla VISIBLE y
    // el usuario re-loguea: el LOGIN (acto explícito) sí hace el fallback.
    const alfa = await nuevaEmpresa('Alfa R');
    const beta = await nuevaEmpresa('Beta R');
    const u = await usuarioConClave();
    await semilla().membresia.create({
      data: { usuarioId: u.id, empresaId: alfa.id, rol: 'empleado', predeterminada: true },
    });
    await semilla().membresia.create({
      data: { usuarioId: u.id, empresaId: beta.id, rol: 'empleado' },
    });

    const sesion = await login(u.email);
    const { refreshToken } = sesion.json() as { refreshToken: string };

    // La empresa activa de la sesión (alfa, la predeterminada) se da de baja.
    await semilla().empresa.update({ where: { id: alfa.id }, data: { activo: false } });

    const refresco = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(refresco.statusCode).toBe(401); // fail-closed: fallo visible

    // El re-login (explícito) SÍ conmuta a la empresa que sigue activa.
    const reLogin = await login(u.email);
    expect(reLogin.statusCode).toBe(200);
    const { usuario } = reLogin.json() as { usuario: Publico };
    expect(usuario.empresaId).toBe(beta.id);
    expect(usuario.membresias).toEqual([
      { empresaId: beta.id, empresaNombre: 'Beta R', rol: 'empleado' },
    ]);
  });

  it('usuario de UNA sola empresa dada de baja: sigue fuera (401 en login) — el fallback no inventa acceso', async () => {
    const caida = await nuevaEmpresa('Única Caída', false);
    const u = await usuarioConClave();
    await semilla().membresia.create({
      data: { usuarioId: u.id, empresaId: caida.id, rol: 'empleado', predeterminada: true },
    });
    expect((await login(u.email)).statusCode).toBe(401);
  });

  it('cambiar-empresa entre DOS empresas propias: el flujo completo del selector', async () => {
    const alfa = await nuevaEmpresa('Alfa S');
    const beta = await nuevaEmpresa('Beta S');
    const u = await usuarioConClave();
    await semilla().membresia.create({
      data: { usuarioId: u.id, empresaId: alfa.id, rol: 'administrador', predeterminada: true },
    });
    await semilla().membresia.create({
      data: { usuarioId: u.id, empresaId: beta.id, rol: 'empleado' },
    });

    const sesion = await login(u.email);
    const { accessToken } = sesion.json() as { accessToken: string };

    const cambio = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-empresa',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { empresaId: beta.id },
    });
    expect(cambio.statusCode).toBe(200);
    const { usuario } = cambio.json() as { usuario: Publico };
    expect(usuario.empresaId).toBe(beta.id);
    expect(usuario.rol).toBe('empleado'); // rol de la membresía en beta
    // El selector sigue mostrando AMBAS (el cambio no altera membresías).
    expect(usuario.membresias.map((m) => m.empresaId).sort()).toEqual(
      [alfa.id, beta.id].sort(),
    );
  });

  it('super-admin: membresias=[] en login y /me (su selector es la plataforma)', async () => {
    const su = await semilla().usuario.create({
      data: {
        nombre: 'Plataforma',
        email: `mm-su-${randomUUID()}@gestorpro.local`,
        passwordHash: await hashearContrasena(CLAVE),
        esSuperAdmin: true,
      },
    });
    const res = await login(su.email);
    expect(res.statusCode).toBe(200);
    const { usuario, accessToken } = res.json() as { usuario: Publico; accessToken: string };
    expect(usuario.membresias).toEqual([]);
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect((me.json() as Publico).membresias).toEqual([]);
  });
});
