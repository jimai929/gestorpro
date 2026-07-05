import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';

/**
 * B3 — PATCH /empresas/:empresaId (TRES estados del tenant, solo super-admin vía
 * `soloPlataforma`): activa | suspendida | cancelada. Suspender/cancelar EXPULSAN las
 * sesiones de refresco de los usuarios del tenant (refresh muere YA; login/refresh/
 * cambiar-empresa solo aceptan `estado=activa`, fail-closed). Cancelada es TERMINAL:
 * ninguna transición sale de ella (409). Idempotente sin asiento duplicado; asiento de
 * PLATAFORMA (`suspender_empresa`/`reactivar_empresa`/`cancelar_empresa`), nunca tenant.
 */
describe('B3 — PATCH /empresas/:id (tres estados del tenant)', () => {
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
  async function nuevaEmpresa(estado: 'activa' | 'suspendida' | 'cancelada' = 'activa') {
    return semilla().empresa.create({
      // Espejo legacy coherente: activo ⟺ estado==='activa' (como lo mantiene el servicio).
      data: {
        nombre: `EE ${randomUUID().slice(0, 8)}`,
        slug: `ee-${randomUUID()}`,
        estado,
        activo: estado === 'activa',
      },
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
  function cambiarEstado(token: string, empresaId: string, estado: unknown) {
    return app.inject({
      method: 'PATCH',
      url: `/empresas/${empresaId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { estado },
    });
  }

  it('suspender: 200, sesiones del tenant EXPULSADAS, login y cambiar-empresa vetados, asiento suspender_empresa', async () => {
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

    const res = await cambiarEstado(tokenSuper(), empresa.id, 'suspendida');
    expect(res.statusCode).toBe(200);
    const fila = res.json() as { id: string; estado: string; slug: string };
    expect(fila.id).toBe(empresa.id);
    expect(fila.estado).toBe('suspendida');

    // BD: estado aplicado y espejo legacy `activo` sincronizado; los DATOS del tenant
    // no se tocan.
    const enBd = await semilla().empresa.findUniqueOrThrow({ where: { id: empresa.id } });
    expect(enBd.estado).toBe('suspendida');
    expect(enBd.activo).toBe(false); // espejo legacy mantenido por el servicio

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
      where: { empresaAfectadaId: empresa.id, accion: 'suspender_empresa' },
    });
    expect(asientos).toHaveLength(1);
    expect(asientos[0]?.actorUsuarioId).toBe(superAdminId);
    expect(asientos[0]?.empresaAfectadaId).toBe(empresa.id);
    expect(asientos[0]?.detalle).toMatchObject({ estado: 'suspendida', estadoAnterior: 'activa' });
    expect(await semilla().auditoria.count({ where: { entidadId: empresa.id } })).toBe(0);
  });

  it('reactivar (suspendida → activa): 200, el tenant vuelve a operar; idempotencia sin asiento duplicado', async () => {
    const empresa = await nuevaEmpresa('suspendida');
    const usuario = await usuarioDelTenant(empresa.id);
    const tk = tokenSuper();

    const res = await cambiarEstado(tk, empresa.id, 'activa');
    expect(res.statusCode).toBe(200);
    expect((res.json() as { estado: string }).estado).toBe('activa');
    // Espejo legacy restaurado también.
    expect((await semilla().empresa.findUniqueOrThrow({ where: { id: empresa.id } })).activo).toBe(true);

    // El usuario del tenant vuelve a poder entrar.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: usuario.email, password: CLAVE },
    });
    expect(login.statusCode).toBe(200);

    // Repetir el MISMO estado: 200 no-op sin segundo asiento; la sesión recién
    // creada NO se expulsa (el no-op no toca nada).
    const repetido = await cambiarEstado(tk, empresa.id, 'activa');
    expect(repetido.statusCode).toBe(200);
    expect(
      await semilla().auditoriaPlataforma.count({
        where: { empresaAfectadaId: empresa.id, accion: 'reactivar_empresa' },
      }),
    ).toBe(1);
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: usuario.id } })).toBe(1);
  });

  it('suspender expulsa por MEMBRESÍA en el tenant: usuarios de OTRA empresa quedan intactos (nota: un multi-membresía perdería también sus otras sesiones — colateral fail-closed aceptado, DECISIONES)', async () => {
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

    expect((await cambiarEstado(tokenSuper(), empresa.id, 'suspendida')).statusCode).toBe(200);
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: usuario.id } })).toBe(0);
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: ajeno.id } })).toBe(1);
  });

  it('B4 — el super-admin NO entra a la empresa (cambiar-empresa → 403): la baja/reactivación se hace desde PLATAFORMA (empresaId=null)', async () => {
    const empresa = await nuevaEmpresa();
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
    const { accessToken } = login.json() as { accessToken: string };
    // El login del super-admin da empresaId=null (plataforma).
    const mePost = await app.inject({ method: 'GET', url: '/auth/me', headers: { authorization: `Bearer ${accessToken}` } });
    expect((mePost.json() as { empresaId: string | null }).empresaId).toBeNull();

    // B4: NO puede ENTRAR a la empresa.
    const entrar = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-empresa',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { empresaId: empresa.id },
    });
    expect(entrar.statusCode).toBe(403);

    // Pero SÍ puede suspenderla DESDE PLATAFORMA (soloPlataforma, empresaId=null): la
    // gestión de empresas es una operación de plataforma, no requiere entrar al tenant.
    const res = await app.inject({
      method: 'PATCH',
      url: `/empresas/${empresa.id}`,
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { estado: 'suspendida' },
    });
    expect(res.statusCode).toBe(200);
    expect((await semilla().empresa.findUniqueOrThrow({ where: { id: empresa.id } })).estado).toBe('suspendida');
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
      payload: { estado: 'x' },
    });
    expect(sinToken.statusCode).toBe(401);

    // Admin de tenant + uuid malformado / body inválido → 404 (no el 400 de ajv).
    const uuidMalo = await app.inject({
      method: 'PATCH',
      url: '/empresas/no-es-un-uuid',
      headers: { authorization: `Bearer ${tkTenant}` },
      payload: { estado: 'suspendida' },
    });
    expect(uuidMalo.statusCode).toBe(404);
    const bodyMalo = await app.inject({
      method: 'PATCH',
      url: `/empresas/${empresa.id}`,
      headers: { authorization: `Bearer ${tkTenant}` },
      payload: { estado: 'x' },
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

  it('guards: sin token 401; admin normal 404 (soloPlataforma); inexistente 404; uuid malformado, estado fuera de la lista blanca y body legacy {activo} → 400', async () => {
    const empresa = await nuevaEmpresa();
    const sinToken = await app.inject({
      method: 'PATCH',
      url: `/empresas/${empresa.id}`,
      payload: { estado: 'suspendida' },
    });
    expect(sinToken.statusCode).toBe(401);

    const tkAdmin = app.jwt.sign({
      sub: randomUUID(),
      rol: 'administrador',
      empresaId: empresa.id,
      esSuperAdmin: false,
    });
    expect((await cambiarEstado(tkAdmin, empresa.id, 'suspendida')).statusCode).toBe(404);

    expect((await cambiarEstado(tokenSuper(), randomUUID(), 'suspendida')).statusCode).toBe(404);
    expect((await cambiarEstado(tokenSuper(), 'no-es-un-uuid', 'suspendida')).statusCode).toBe(400);
    // Fuera de la lista blanca del enum → 400 en la puerta.
    expect((await cambiarEstado(tokenSuper(), empresa.id, 'quizas')).statusCode).toBe(400);
    // Body LEGACY {activo:boolean} (contrato pre-B3): ya no es válido → 400.
    const legacy = await app.inject({
      method: 'PATCH',
      url: `/empresas/${empresa.id}`,
      headers: { authorization: `Bearer ${tokenSuper()}` },
      payload: { activo: false },
    });
    expect(legacy.statusCode).toBe(400);

    // Nada de lo anterior mutó la empresa.
    expect((await semilla().empresa.findUniqueOrThrow({ where: { id: empresa.id } })).estado).toBe('activa');
  });

  // ── B3: máquina de estados — cancelada TERMINAL ─────────────────────────────

  it('cancelar (activa → cancelada): 200, sesiones expulsadas, asiento cancelar_empresa; y suspendida → cancelada también', async () => {
    const empresa = await nuevaEmpresa();
    const usuario = await usuarioDelTenant(empresa.id);
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: usuario.email, password: CLAVE },
    });
    expect(login.statusCode).toBe(200);

    const res = await cambiarEstado(tokenSuper(), empresa.id, 'cancelada');
    expect(res.statusCode).toBe(200);
    expect((res.json() as { estado: string }).estado).toBe('cancelada');
    // Sesiones del tenant expulsadas (igual que suspender: fuera YA).
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: usuario.id } })).toBe(0);
    const asientos = await semilla().auditoriaPlataforma.findMany({
      where: { empresaAfectadaId: empresa.id, accion: 'cancelar_empresa' },
    });
    expect(asientos).toHaveLength(1);
    expect(asientos[0]?.detalle).toMatchObject({ estado: 'cancelada', estadoAnterior: 'activa' });

    // suspendida → cancelada: también permitido.
    const suspendida = await nuevaEmpresa('suspendida');
    const res2 = await cambiarEstado(tokenSuper(), suspendida.id, 'cancelada');
    expect(res2.statusCode).toBe(200);
    expect((await semilla().empresa.findUniqueOrThrow({ where: { id: suspendida.id } })).estado).toBe('cancelada');
  });

  it('cancelada es TERMINAL: → activa 409, → suspendida 409, sin asiento; → cancelada es no-op 200 idempotente', async () => {
    const empresa = await nuevaEmpresa('cancelada');
    const tk = tokenSuper();

    // Ninguna transición sale de cancelada por el flujo normal.
    expect((await cambiarEstado(tk, empresa.id, 'activa')).statusCode).toBe(409);
    expect((await cambiarEstado(tk, empresa.id, 'suspendida')).statusCode).toBe(409);
    // Sin asientos de reactivar/suspender: los rechazos no auditan transición alguna.
    expect(
      await semilla().auditoriaPlataforma.count({
        where: { empresaAfectadaId: empresa.id, accion: { in: ['reactivar_empresa', 'suspender_empresa'] } },
      }),
    ).toBe(0);
    // Pedir el estado en el que YA está: no-op idempotente (sin asiento cancelar nuevo).
    const noop = await cambiarEstado(tk, empresa.id, 'cancelada');
    expect(noop.statusCode).toBe(200);
    expect(
      await semilla().auditoriaPlataforma.count({
        where: { empresaAfectadaId: empresa.id, accion: 'cancelar_empresa' },
      }),
    ).toBe(0); // nació cancelada en el seed: jamás hubo transición, jamás hubo asiento
    // Sigue cancelada.
    expect((await semilla().empresa.findUniqueOrThrow({ where: { id: empresa.id } })).estado).toBe('cancelada');
  });
});
