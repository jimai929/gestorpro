import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';

/**
 * Fase 4c — PATCH /usuarios/:usuarioId (baja/reactivación LÓGICA de un usuario del
 * tenant). Guards espejo de restablecer-contrasena: 404 ÚNICO anti-enumeración,
 * auto-baja prohibida (400, también con uuid en mayúsculas), plataforma invisible.
 * Propios de esta ruta: cuenta multi-empresa → 409 (Usuario.activo es GLOBAL: nada
 * de lock-out cross-tenant desde un solo tenant); desactivar EXPULSA las sesiones;
 * idempotente sin asiento duplicado.
 */
describe('Fase 4c — PATCH /usuarios/:id (baja/reactivación)', () => {
  let app: FastifyInstance;
  const CLAVE = 'ClaveViva1*';

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-usuarios-estado';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  async function nuevaEmpresa() {
    return semilla().empresa.create({
      data: { nombre: `UE ${randomUUID().slice(0, 8)}`, slug: `ue-${randomUUID()}` },
    });
  }
  async function nuevoUsuario(opts: { esSuperAdmin?: boolean; conClave?: boolean; activo?: boolean } = {}) {
    return semilla().usuario.create({
      data: {
        nombre: 'U',
        email: `ue-${randomUUID()}@x.local`,
        passwordHash: opts.conClave ? await hashearContrasena(CLAVE) : 'x',
        esSuperAdmin: opts.esSuperAdmin ?? false,
        activo: opts.activo ?? true,
      },
    });
  }
  async function conMembresia(usuarioId: string, empresaId: string, rol = 'empleado') {
    return semilla().membresia.create({
      data: { usuarioId, empresaId, rol: rol as 'empleado', predeterminada: true },
    });
  }
  function cambiarEstado(token: string, usuarioId: string, activo: unknown) {
    return app.inject({
      method: 'PATCH',
      url: `/usuarios/${usuarioId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { activo },
    });
  }
  function tokenAdmin(adminId: string, empresaId: string) {
    return app.jwt.sign({ sub: adminId, rol: 'administrador', empresaId, esSuperAdmin: false });
  }

  it('desactivar: 200 con la fila, sesiones EXPULSADAS, login rechazado, asiento desactivar_usuario', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const objetivo = await nuevoUsuario({ conClave: true });
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(objetivo.id, empresa.id, 'empleado');

    // Sesión viva del objetivo (login real): la baja debe expulsarla.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: objetivo.email, password: CLAVE },
    });
    expect(login.statusCode).toBe(200);
    const { refreshToken } = login.json() as { refreshToken: string };

    const res = await cambiarEstado(tokenAdmin(admin.id, empresa.id), objetivo.id, false);
    expect(res.statusCode).toBe(200);
    const fila = res.json() as { id: string; activo: boolean; rol: string };
    expect(fila.id).toBe(objetivo.id);
    expect(fila.activo).toBe(false);
    expect(fila.rol).toBe('empleado'); // rol de la MEMBRESÍA
    expect(res.body).not.toContain('passwordHash');

    // BD: baja lógica aplicada; contraseña y flag intactos (la baja no toca secretos).
    const enBd = await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } });
    expect(enBd.activo).toBe(false);
    expect(enBd.debeCambiarContrasena).toBe(false);

    // Sesiones expulsadas: el refresh viejo ya no vale y el login queda vetado.
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: objetivo.id } })).toBe(0);
    const refresco = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken },
    });
    expect(refresco.statusCode).toBe(401);
    const reLogin = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: objetivo.email, password: CLAVE },
    });
    expect(reLogin.statusCode).toBe(401);

    // Auditoría: asiento del ADMIN sobre el objetivo, en la empresa.
    const asientos = await semilla().auditoria.findMany({
      where: { entidad: 'usuario', entidadId: objetivo.id, accion: 'desactivar_usuario' },
    });
    expect(asientos).toHaveLength(1);
    expect(asientos[0]?.usuarioId).toBe(admin.id);
    expect(asientos[0]?.empresaId).toBe(empresa.id);
  });

  it('reactivar: 200, vuelve a poder entrar, asiento reactivar_usuario; idempotencia sin asiento duplicado', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const objetivo = await nuevoUsuario({ conClave: true, activo: false });
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(objetivo.id, empresa.id, 'empleado');
    const tk = tokenAdmin(admin.id, empresa.id);

    const res = await cambiarEstado(tk, objetivo.id, true);
    expect(res.statusCode).toBe(200);
    expect((res.json() as { activo: boolean }).activo).toBe(true);

    // Reactivado: el login vuelve a funcionar (la contraseña no cambió).
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: objetivo.email, password: CLAVE },
    });
    expect(login.statusCode).toBe(200);

    // Repetir el MISMO estado: 200 no-op, sin segundo asiento (idempotente sin ruido).
    const repetido = await cambiarEstado(tk, objetivo.id, true);
    expect(repetido.statusCode).toBe(200);
    const asientos = await semilla().auditoria.findMany({
      where: { entidad: 'usuario', entidadId: objetivo.id, accion: 'reactivar_usuario' },
    });
    expect(asientos).toHaveLength(1);
  });

  it('objetivo de OTRA empresa, inexistente o super-admin (aun con membresía): 404 con el MISMO cuerpo y sin mutación', async () => {
    const empresa = await nuevaEmpresa();
    const otra = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const ajeno = await nuevoUsuario();
    const superConMembresia = await nuevoUsuario({ esSuperAdmin: true });
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(ajeno.id, otra.id, 'empleado');
    // Estado corrupto (invariante §4.2), sembrado a mano para PINEAR el guard esSuperAdmin.
    await conMembresia(superConMembresia.id, empresa.id, 'administrador');
    const tk = tokenAdmin(admin.id, empresa.id);

    const resAjeno = await cambiarEstado(tk, ajeno.id, false);
    const resInexistente = await cambiarEstado(tk, randomUUID(), false);
    const resSuper = await cambiarEstado(tk, superConMembresia.id, false);
    expect(resAjeno.statusCode).toBe(404);
    expect(resInexistente.statusCode).toBe(404);
    expect(resSuper.statusCode).toBe(404);
    // Indistinguibles: mismo cuerpo exacto (anti-enumeración).
    expect(resAjeno.body).toBe(resInexistente.body);
    expect(resSuper.body).toBe(resInexistente.body);

    // Nada cambió: los objetivos siguen activos.
    expect((await semilla().usuario.findUniqueOrThrow({ where: { id: ajeno.id } })).activo).toBe(true);
    expect((await semilla().usuario.findUniqueOrThrow({ where: { id: superConMembresia.id } })).activo).toBe(true);
  });

  it('cuenta multi-empresa: 409 en AMBAS direcciones y sin mutación (nada de lock-out cross-tenant)', async () => {
    const empresa = await nuevaEmpresa();
    const otra = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const dual = await nuevoUsuario({ conClave: true });
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(dual.id, empresa.id, 'empleado');
    await semilla().membresia.create({
      data: { usuarioId: dual.id, empresaId: otra.id, rol: 'empleado' },
    });
    const tk = tokenAdmin(admin.id, empresa.id);

    // Sesión viva del dual: el 409 NO debe expulsarla (cero efectos colaterales).
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: dual.email, password: CLAVE },
    });
    expect(login.statusCode).toBe(200);

    const baja = await cambiarEstado(tk, dual.id, false);
    expect(baja.statusCode).toBe(409);
    const alta = await cambiarEstado(tk, dual.id, true);
    expect(alta.statusCode).toBe(409);

    const enBd = await semilla().usuario.findUniqueOrThrow({ where: { id: dual.id } });
    expect(enBd.activo).toBe(true); // intacto
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: dual.id } })).toBe(1);
    expect(
      await semilla().auditoria.count({
        where: { entidadId: dual.id, accion: { in: ['desactivar_usuario', 'reactivar_usuario'] } },
      }),
    ).toBe(0);
  });

  it('B4 — cuenta multi-empresa: el super-admin YA NO puede gestionarla por "dos niveles" (no entra: cambiar-empresa → 403)', async () => {
    // Tras B4 desaparece el escape "dos niveles": el super-admin no entra a ningún tenant.
    // El admin de tenant sigue recibiendo 409 sobre una cuenta multi-empresa (probado en
    // otro it). La gestión de cuentas multi-empresa quedaría para un endpoint de plataforma
    // futuro; B4 solo cierra el acceso, no lo reemplaza.
    const empresa = await nuevaEmpresa();
    const otra = await nuevaEmpresa();
    const dual = await nuevoUsuario({ conClave: true });
    await conMembresia(dual.id, empresa.id, 'empleado');
    await semilla().membresia.create({
      data: { usuarioId: dual.id, empresaId: otra.id, rol: 'empleado' },
    });
    const superAdmin = await nuevoUsuario({ esSuperAdmin: true });
    const tkPlataforma = app.jwt.sign({
      sub: superAdmin.id,
      rol: 'empleado',
      empresaId: null,
      esSuperAdmin: true,
    });

    // No puede ENTRAR a la empresa.
    const entrar = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-empresa',
      headers: { authorization: `Bearer ${tkPlataforma}` },
      payload: { empresaId: empresa.id },
    });
    expect(entrar.statusCode).toBe(403);

    // Y desde plataforma (empresaId=null) tampoco pasa el guard de tenant.
    expect((await cambiarEstado(tkPlataforma, dual.id, false)).statusCode).toBe(403);
    expect((await semilla().usuario.findUniqueOrThrow({ where: { id: dual.id } })).activo).toBe(true);
  });

  it('auto-baja: 400 (también con el propio id en MAYÚSCULAS) y nada cambia', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    await conMembresia(admin.id, empresa.id, 'administrador');
    const tk = tokenAdmin(admin.id, empresa.id);

    const directo = await cambiarEstado(tk, admin.id, false);
    expect(directo.statusCode).toBe(400);
    // El patrón de la ruta admite hex MAYÚSCULAS y Postgres resuelve el uuid
    // case-insensitive: sin normalizar, el admin se desactivaría a sí mismo.
    const mayusculas = await cambiarEstado(tk, admin.id.toUpperCase(), false);
    expect(mayusculas.statusCode).toBe(400);

    const enBd = await semilla().usuario.findUniqueOrThrow({ where: { id: admin.id } });
    expect(enBd.activo).toBe(true); // sigue activo: el tenant no pierde a su admin
  });

  it('B4 — empleado, supervisor y super-admin (plataforma): 403; el super-admin ya no entra para gestionar usuarios', async () => {
    const empresa = await nuevaEmpresa();
    const objetivo = await nuevoUsuario();
    await conMembresia(objetivo.id, empresa.id, 'empleado');
    const superAdmin = await nuevoUsuario({ esSuperAdmin: true });

    for (const rol of ['empleado', 'supervisor'] as const) {
      const tk = app.jwt.sign({ sub: randomUUID(), rol, empresaId: empresa.id, esSuperAdmin: false });
      expect((await cambiarEstado(tk, objetivo.id, false)).statusCode).toBe(403);
    }

    // Super-admin en plataforma (su único estado tras B4): el guard de tenant lo rechaza.
    const tkPlataforma = app.jwt.sign({ sub: superAdmin.id, rol: 'empleado', empresaId: null, esSuperAdmin: true });
    expect((await cambiarEstado(tkPlataforma, objetivo.id, false)).statusCode).toBe(403);

    // Y NO puede entrar para hacerlo (cambiar-empresa → 403).
    const entrar = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-empresa',
      headers: { authorization: `Bearer ${tkPlataforma}` },
      payload: { empresaId: empresa.id },
    });
    expect(entrar.statusCode).toBe(403);
    // Nada cambió: el objetivo sigue activo.
    expect((await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } })).activo).toBe(true);
  });

  it('validación en la puerta: uuid malformado y activo no coercible → 400; extras del body se DESPOJAN sin efecto', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const objetivo = await nuevoUsuario();
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(objetivo.id, empresa.id, 'empleado');
    const tk = tokenAdmin(admin.id, empresa.id);

    expect((await cambiarEstado(tk, 'no-es-un-uuid', false)).statusCode).toBe(400);
    // OJO: ajv de Fastify coerce 'true'/'false' string a boolean (comportamiento
    // global de la app); lo que se pinea aquí es que un valor NO coercible es 400.
    expect((await cambiarEstado(tk, objetivo.id, 'quizas')).statusCode).toBe(400);
    // Las 400 no mutaron nada.
    expect((await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } })).activo).toBe(true);

    // additionalProperties:false + removeAdditional (default global de la app):
    // el campo extra `rol` se DESPOJA en la puerta — la baja aplica, el rol JAMÁS
    // se muta por esta ruta.
    const extras = await app.inject({
      method: 'PATCH',
      url: `/usuarios/${objetivo.id}`,
      headers: { authorization: `Bearer ${tk}` },
      payload: { activo: false, rol: 'administrador' },
    });
    expect(extras.statusCode).toBe(200);
    const membresia = await semilla().membresia.findUniqueOrThrow({
      where: { usuarioId_empresaId: { usuarioId: objetivo.id, empresaId: empresa.id } },
    });
    expect(membresia.rol).toBe('empleado'); // el extra no tuvo NINGÚN efecto
    expect((await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } })).activo).toBe(false);
  });
});
