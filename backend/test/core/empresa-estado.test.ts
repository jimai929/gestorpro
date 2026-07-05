import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';

/**
 * Fase 4c — PATCH /empresas/:empresaId (baja/reactivación LÓGICA del tenant, solo
 * super-admin vía `soloPlataforma`). La baja EXPULSA las sesiones de refresco de los
 * usuarios del tenant (refresh muere YA; login/refresh/cambiar-empresa ya rechazan
 * empresas inactivas, fail-closed preexistente). Idempotente sin asiento duplicado;
 * asiento con usuarioId real del super-admin y empresa_id EXPLÍCITO (bypass).
 */
describe('Fase 4c — PATCH /empresas/:id (baja/reactivación del tenant)', () => {
  let app: FastifyInstance;
  let superAdminId: string;
  const CLAVE = 'ClaveViva1*';

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-empresa-estado';
    const su = await semilla().usuario.create({
      data: {
        nombre: 'Plataforma',
        email: `super-ee-${randomUUID()}@gestorpro.local`,
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
      data: { nombre: `EE ${randomUUID().slice(0, 8)}`, slug: `ee-${randomUUID()}`, activo },
    });
  }
  async function usuarioDelTenant(empresaId: string) {
    const u = await semilla().usuario.create({
      data: {
        nombre: 'U',
        email: `ee-${randomUUID()}@x.local`,
        passwordHash: await hashearContrasena(CLAVE),
      },
    });
    await semilla().membresia.create({
      data: { usuarioId: u.id, empresaId, rol: 'empleado', predeterminada: true },
    });
    return u;
  }
  function cambiarEstado(token: string, empresaId: string, activo: unknown) {
    return app.inject({
      method: 'PATCH',
      url: `/empresas/${empresaId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { activo },
    });
  }

  it('desactivar: 200, sesiones del tenant EXPULSADAS, login y cambiar-empresa vetados, asiento con empresa_id explícito', async () => {
    const empresa = await nuevaEmpresa();
    const usuario = await usuarioDelTenant(empresa.id);

    // Sesión viva del usuario del tenant: la baja debe expulsarla.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: usuario.email, password: CLAVE },
    });
    expect(login.statusCode).toBe(200);
    const { refreshToken } = login.json() as { refreshToken: string };

    const res = await cambiarEstado(tokenSuper(), empresa.id, false);
    expect(res.statusCode).toBe(200);
    const fila = res.json() as { id: string; activo: boolean; slug: string };
    expect(fila.id).toBe(empresa.id);
    expect(fila.activo).toBe(false);

    // BD: baja lógica aplicada; los DATOS del tenant no se tocan.
    const enBd = await semilla().empresa.findUniqueOrThrow({ where: { id: empresa.id } });
    expect(enBd.activo).toBe(false);

    // Sesiones expulsadas: el refresh viejo muere YA (no espera los ≤15 min de I5).
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: usuario.id } })).toBe(0);
    const refresco = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(refresco.statusCode).toBe(401);

    // Login vetado (resolverContextoActivo fail-closed sobre empresa inactiva).
    const reLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: usuario.email, password: CLAVE },
    });
    expect(reLogin.statusCode).toBe(401);

    // El super-admin tampoco puede ENTRAR a una empresa dada de baja.
    const entrar = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-empresa',
      headers: { authorization: `Bearer ${tokenSuper()}` },
      payload: { empresaId: empresa.id },
    });
    expect(entrar.statusCode).toBe(403);

    // Auditoría de PLATAFORMA (NO la de tenant): asiento del super-admin REAL con
    // empresaAfectadaId = la empresa. La `Auditoria` de tenant no se toca.
    const asientos = await semilla().auditoriaPlataforma.findMany({
      where: { empresaAfectadaId: empresa.id, accion: 'desactivar_empresa' },
    });
    expect(asientos).toHaveLength(1);
    expect(asientos[0]?.actorUsuarioId).toBe(superAdminId);
    expect(asientos[0]?.empresaAfectadaId).toBe(empresa.id);
    expect(await semilla().auditoria.count({ where: { entidadId: empresa.id } })).toBe(0);
  });

  it('reactivar: 200, el tenant vuelve a operar; idempotencia sin asiento duplicado', async () => {
    const empresa = await nuevaEmpresa(false);
    const usuario = await usuarioDelTenant(empresa.id);
    const tk = tokenSuper();

    const res = await cambiarEstado(tk, empresa.id, true);
    expect(res.statusCode).toBe(200);
    expect((res.json() as { activo: boolean }).activo).toBe(true);

    // El usuario del tenant vuelve a poder entrar.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: usuario.email, password: CLAVE },
    });
    expect(login.statusCode).toBe(200);

    // Repetir el MISMO estado: 200 no-op sin segundo asiento; la sesión recién
    // creada NO se expulsa (el no-op no toca nada).
    const repetido = await cambiarEstado(tk, empresa.id, true);
    expect(repetido.statusCode).toBe(200);
    expect(
      await semilla().auditoriaPlataforma.count({
        where: { empresaAfectadaId: empresa.id, accion: 'reactivar_empresa' },
      }),
    ).toBe(1);
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: usuario.id } })).toBe(1);
  });

  it('la baja expulsa por MEMBRESÍA en el tenant: usuarios de OTRA empresa quedan intactos (nota: un multi-membresía perdería también sus otras sesiones — colateral fail-closed aceptado, DECISIONES)', async () => {
    const empresa = await nuevaEmpresa();
    const otra = await nuevaEmpresa();
    const usuario = await usuarioDelTenant(empresa.id);
    const ajeno = await usuarioDelTenant(otra.id);

    for (const u of [usuario, ajeno]) {
      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: u.email, password: CLAVE },
      });
      expect(login.statusCode).toBe(200);
    }

    expect((await cambiarEstado(tokenSuper(), empresa.id, false)).statusCode).toBe(200);
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: usuario.id } })).toBe(0);
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: ajeno.id } })).toBe(1);
  });

  it('sesión de SOPORTE del super-admin dentro de la empresa dada de baja: el refresh cae a plataforma (no 401)', async () => {
    const empresa = await nuevaEmpresa();
    // El super-admin entra a la empresa con una sesión REAL (login + cambiar-empresa).
    await semilla().usuario.update({
      where: { id: superAdminId },
      data: { passwordHash: await hashearContrasena(CLAVE) },
    });
    const superEmail = (await semilla().usuario.findUniqueOrThrow({ where: { id: superAdminId } })).email;
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: superEmail, password: CLAVE },
    });
    expect(login.statusCode).toBe(200);
    const { accessToken, refreshToken } = login.json() as { accessToken: string; refreshToken: string };
    const entrar = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-empresa',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { empresaId: empresa.id },
    });
    expect(entrar.statusCode).toBe(200);

    // Da de baja la empresa DESDE DENTRO de esa sesión de soporte.
    const tkDentro = (entrar.json() as { accessToken: string }).accessToken;
    const res = await app.inject({
      method: 'PATCH',
      url: `/empresas/${empresa.id}`,
      headers: { authorization: `Bearer ${tkDentro}` },
      payload: { activo: false },
    });
    expect(res.statusCode).toBe(200);

    // Su sesión NO fue expulsada (no tiene membresía) y el refresh no muere:
    // resolverContextoActivo deja de honrar la preferida inactiva → cae a plataforma.
    const refresco = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(refresco.statusCode).toBe(200);
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { authorization: `Bearer ${(refresco.json() as { accessToken: string }).accessToken}` },
    });
    expect(me.statusCode).toBe(200);
    expect((me.json() as { empresaId: string | null }).empresaId).toBeNull();
  });

  it('anti-enumeración con input MALFORMADO: los guards cortan ANTES que la validación de schema', async () => {
    // La validación ajv corre entre onRequest y preHandler: con los guards en
    // preHandler, un no-super-admin recibiría el 400 de ajv (con el patrón uuid y la
    // forma del body) ANTES del guard — confirmando la existencia y el contrato de la
    // ruta de plataforma. Los guards van en onRequest para que el 401/404 gane SIEMPRE.
    const empresa = await nuevaEmpresa();
    const tkTenant = app.jwt.sign({
      sub: randomUUID(),
      rol: 'administrador',
      empresaId: empresa.id,
      esSuperAdmin: false,
    });

    // Sin token + input malformado → 401 (no el 400 de ajv).
    const sinToken = await app.inject({
      method: 'PATCH',
      url: '/empresas/no-es-un-uuid',
      payload: { activo: 'x' },
    });
    expect(sinToken.statusCode).toBe(401);

    // Admin de tenant + uuid malformado / body inválido → 404 (no el 400 de ajv).
    const uuidMalo = await app.inject({
      method: 'PATCH',
      url: '/empresas/no-es-un-uuid',
      headers: { authorization: `Bearer ${tkTenant}` },
      payload: { activo: false },
    });
    expect(uuidMalo.statusCode).toBe(404);
    const bodyMalo = await app.inject({
      method: 'PATCH',
      url: `/empresas/${empresa.id}`,
      headers: { authorization: `Bearer ${tkTenant}` },
      payload: { activo: 'x' },
    });
    expect(bodyMalo.statusCode).toBe(404);

    // La MISMA clase de fuga aplicaba al POST /empresas preexistente: también pineado.
    const postMalo = await app.inject({
      method: 'POST',
      url: '/empresas',
      headers: { authorization: `Bearer ${tkTenant}` },
      payload: { nombre: 'x' }, // faltan campos: ajv daría 400 con el contrato entero
    });
    expect(postMalo.statusCode).toBe(404);
  });

  it('guards: sin token 401; admin normal 404 (soloPlataforma); inexistente 404; uuid malformado y activo no coercible 400', async () => {
    const empresa = await nuevaEmpresa();
    const sinToken = await app.inject({
      method: 'PATCH',
      url: `/empresas/${empresa.id}`,
      payload: { activo: false },
    });
    expect(sinToken.statusCode).toBe(401);

    const tkAdmin = app.jwt.sign({
      sub: randomUUID(),
      rol: 'administrador',
      empresaId: empresa.id,
      esSuperAdmin: false,
    });
    expect((await cambiarEstado(tkAdmin, empresa.id, false)).statusCode).toBe(404);

    expect((await cambiarEstado(tokenSuper(), randomUUID(), false)).statusCode).toBe(404);
    expect((await cambiarEstado(tokenSuper(), 'no-es-un-uuid', false)).statusCode).toBe(400);
    expect((await cambiarEstado(tokenSuper(), empresa.id, 'quizas')).statusCode).toBe(400);

    // Nada de lo anterior mutó la empresa.
    expect((await semilla().empresa.findUniqueOrThrow({ where: { id: empresa.id } })).activo).toBe(true);
  });
});
