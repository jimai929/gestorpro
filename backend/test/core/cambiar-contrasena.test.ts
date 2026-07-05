import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';

/**
 * POST /auth/cambiar-contrasena — autoservicio: el usuario autenticado cambia su
 * PROPIA contraseña. El `usuarioId` sale SIEMPRE del token, NUNCA del body. Corre
 * contra Postgres real (Testcontainers); el hash (argon2) y la auditoría son reales.
 */
const CLAVE = 'Clave123*';
const NUEVA = 'NuevaClave1*';

describe('auth — POST /auth/cambiar-contrasena (autoservicio)', () => {
  let app: FastifyInstance;
  let empresaId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-cambiar-contrasena';
    const empresa = await semilla().empresa.create({
      data: { nombre: `cc-${randomUUID()}`, slug: `cc-${randomUUID()}` },
    });
    empresaId = empresa.id;
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  // Usuario con contraseña conocida y membresía en la empresa de prueba: la membresía
  // es necesaria para que el login resuelva contexto y para el empresa_id de la auditoría.
  async function nuevoUsuario(clave = CLAVE, debeCambiarContrasena = false) {
    const usuario = await semilla().usuario.create({
      data: {
        nombre: 'U',
        email: `cc-${randomUUID()}@x.local`,
        rol: 'administrador',
        passwordHash: await hashearContrasena(clave),
        debeCambiarContrasena,
      },
    });
    await semilla().membresia.create({
      data: { usuarioId: usuario.id, empresaId, rol: 'administrador', predeterminada: true },
    });
    return usuario;
  }

  function token(usuarioId: string): string {
    return app.jwt.sign({ sub: usuarioId, rol: 'administrador', empresaId, esSuperAdmin: false });
  }

  async function hashDe(usuarioId: string): Promise<string> {
    const u = await semilla().usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    return u.passwordHash;
  }

  async function auditoriasDe(usuarioId: string): Promise<number> {
    return semilla().auditoria.count({
      where: { entidadId: usuarioId, accion: 'cambiar_contrasena' },
    });
  }

  function cambiar(usuarioId: string, body: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/auth/cambiar-contrasena',
      headers: { authorization: `Bearer ${token(usuarioId)}` },
      payload: body,
    });
  }

  it('contraseña actual incorrecta → 401 y el hash NO cambia', async () => {
    const u = await nuevoUsuario();
    const antes = await hashDe(u.id);
    const res = await cambiar(u.id, { contrasenaActual: 'NoEsLaClave9*', contrasenaNueva: NUEVA });
    expect(res.statusCode).toBe(401);
    expect(await hashDe(u.id)).toBe(antes); // intacto
    // Un intento fallido NO deja rastro de auditoría (el servicio corta antes de la tx).
    expect(await auditoriasDe(u.id)).toBe(0);
  });

  it('nueva == actual → 400 y el hash NO cambia', async () => {
    const u = await nuevoUsuario();
    const antes = await hashDe(u.id);
    const res = await cambiar(u.id, { contrasenaActual: CLAVE, contrasenaNueva: CLAVE });
    expect(res.statusCode).toBe(400);
    expect(await hashDe(u.id)).toBe(antes);
    expect(await auditoriasDe(u.id)).toBe(0); // rechazo sin auditoría
  });

  it('sin token → 401 (autenticar corta antes del handler) y nada cambia', async () => {
    const u = await nuevoUsuario();
    const antes = await hashDe(u.id);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-contrasena',
      payload: { contrasenaActual: CLAVE, contrasenaNueva: NUEVA },
    });
    expect(res.statusCode).toBe(401);
    expect(await hashDe(u.id)).toBe(antes);
  });

  it('nueva demasiado débil (< 8) → 400 (schema) y el hash NO cambia', async () => {
    const u = await nuevoUsuario();
    const antes = await hashDe(u.id);
    const res = await cambiar(u.id, { contrasenaActual: CLAVE, contrasenaNueva: 'corta' });
    expect(res.statusCode).toBe(400);
    expect(await hashDe(u.id)).toBe(antes);
  });

  it('correcta → 204; el hash cambia, la clave vieja ya no entra y la nueva sí; audita sin filtrar la clave', async () => {
    const u = await nuevoUsuario();
    const antes = await hashDe(u.id);

    const res = await cambiar(u.id, { contrasenaActual: CLAVE, contrasenaNueva: NUEVA });
    expect(res.statusCode).toBe(204);

    // El hash cambió.
    expect(await hashDe(u.id)).not.toBe(antes);

    // La contraseña vieja ya no inicia sesión; la nueva sí.
    const vieja = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: u.email, password: CLAVE },
    });
    expect(vieja.statusCode).toBe(401);
    const nueva = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: u.email, password: NUEVA },
    });
    expect(nueva.statusCode).toBe(200);

    // Asiento de auditoría: cambiar_contrasena, del propio usuario, en su empresa, y
    // SIN ninguna contraseña en claro en toda la fila.
    const asientos = await semilla().auditoria.findMany({
      where: { entidad: 'usuario', entidadId: u.id, accion: 'cambiar_contrasena' },
    });
    expect(asientos).toHaveLength(1);
    expect(asientos[0]?.usuarioId).toBe(u.id);
    expect(asientos[0]?.empresaId).toBe(empresaId);
    expect(asientos[0]?.detalle).toBeNull(); // el asiento jamás lleva detalle (ni claves)
    const fila = JSON.stringify(asientos[0]);
    expect(fila).not.toContain(CLAVE);
    expect(fila).not.toContain(NUEVA);
  });

  it('cambiar la contraseña REVOCA las sesiones de refresco: el refresh token viejo ya no sirve', async () => {
    const u = await nuevoUsuario();

    // Inicia sesión para obtener un refresh token ANTES del cambio.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: u.email, password: CLAVE },
    });
    expect(login.statusCode).toBe(200);
    const viejoRefresh = (login.json() as { refreshToken: string }).refreshToken;
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: u.id } })).toBe(1);

    // Cambia la contraseña.
    const res = await cambiar(u.id, { contrasenaActual: CLAVE, contrasenaNueva: NUEVA });
    expect(res.statusCode).toBe(204);

    // La sesión quedó revocada: 0 filas y el refresh token viejo ya no emite access tokens.
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: u.id } })).toBe(0);
    const refresh = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refreshToken: viejoRefresh },
    });
    expect(refresh.statusCode).toBe(401);
  });

  it('cambiar la contraseña LIMPIA debeCambiarContrasena (de true a false)', async () => {
    const u = await nuevoUsuario(CLAVE, true); // contraseña temporal: flag = true
    expect((await semilla().usuario.findUniqueOrThrow({ where: { id: u.id } })).debeCambiarContrasena).toBe(true);

    const res = await cambiar(u.id, { contrasenaActual: CLAVE, contrasenaNueva: NUEVA });
    expect(res.statusCode).toBe(204);

    // Tras rotar la clave, ya no está obligado a cambiarla.
    expect((await semilla().usuario.findUniqueOrThrow({ where: { id: u.id } })).debeCambiarContrasena).toBe(false);
  });

  it('usuarioId en el body NO cambia la contraseña de otro: solo cuenta el token', async () => {
    const victima = await nuevoUsuario();
    const atacante = await nuevoUsuario();
    const hashVictimaAntes = await hashDe(victima.id);
    const hashAtacanteAntes = await hashDe(atacante.id);

    // Atacante autenticado como él mismo, pero mete el id de la víctima en el body.
    const res = await cambiar(atacante.id, {
      contrasenaActual: CLAVE,
      contrasenaNueva: NUEVA,
      usuarioId: victima.id,
    });

    // El `usuarioId` del body se IGNORA (additionalProperties:false → ajv lo elimina):
    // el servicio toma el usuarioId del TOKEN. La operación tiene éxito (204) pero solo
    // cambia la contraseña del ATACANTE; la VÍCTIMA queda intacta.
    expect(res.statusCode).toBe(204);
    expect(await hashDe(victima.id)).toBe(hashVictimaAntes); // la VÍCTIMA, intacta
    expect(await hashDe(atacante.id)).not.toBe(hashAtacanteAntes); // solo cambió el atacante
  });

  // ── B5: cuentas de PLATAFORMA (super-admin) cambian su PROPIA contraseña ─────
  // Antes (guard B1) el auto-cambio del super-admin se rechazaba con 403: auditar en la
  // bitácora de TENANT (empresa_id NOT NULL, del GUC) reventaba porque no tiene empresa.
  // B5 lo habilita: el servicio detecta esSuperAdmin y audita en AuditoriaPlataforma (sin
  // tenant), lo que permite cerrar el cambio FORZADO de su clave inicial (nace con el flag).

  // Super-admin REAL: esSuperAdmin=true y SIN membresía (no pertenece a ninguna empresa).
  async function nuevoSuperAdmin(clave = CLAVE, debeCambiarContrasena = false) {
    return semilla().usuario.create({
      data: {
        nombre: 'Plataforma',
        email: `sa-${randomUUID()}@x.local`,
        rol: 'empleado', // mínimo privilegio; su poder viene de esSuperAdmin
        esSuperAdmin: true,
        passwordHash: await hashearContrasena(clave),
        debeCambiarContrasena,
      },
    });
  }

  // Token con la forma exacta de un super-admin sin empresa activa: empresaId null.
  function tokenSuperAdmin(usuarioId: string, debeCambiarContrasena = false): string {
    return app.jwt.sign({
      sub: usuarioId,
      rol: 'empleado',
      empresaId: null,
      esSuperAdmin: true,
      debeCambiarContrasena,
    });
  }

  async function auditoriasPlataformaDe(actorUsuarioId: string): Promise<number> {
    return semilla().auditoriaPlataforma.count({
      where: { actorUsuarioId, accion: 'cambiar_contrasena' },
    });
  }

  it('B5 — super-admin: 204; el hash cambia y audita en AuditoriaPlataforma (NO en la de tenant), sin empresa ni detalle', async () => {
    const sa = await nuevoSuperAdmin();
    const antes = await hashDe(sa.id);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-contrasena',
      // IP propia: el bucket de rate-limit (10/min por IP) es compartido por todo el
      // archivo; sin esto, las peticiones acumuladas darían 429 (no es lo que se prueba).
      remoteAddress: '10.20.0.1',
      headers: { authorization: `Bearer ${tokenSuperAdmin(sa.id)}` },
      payload: { contrasenaActual: CLAVE, contrasenaNueva: NUEVA },
    });
    expect(res.statusCode).toBe(204);

    expect(await hashDe(sa.id)).not.toBe(antes); // el hash cambió
    // La bitácora de TENANT no se toca; el asiento va a la de PLATAFORMA.
    expect(await auditoriasDe(sa.id)).toBe(0);
    expect(await auditoriasPlataformaDe(sa.id)).toBe(1);
    const asiento = await semilla().auditoriaPlataforma.findFirstOrThrow({
      where: { actorUsuarioId: sa.id, accion: 'cambiar_contrasena' },
    });
    expect(asiento.empresaAfectadaId).toBeNull(); // acción de la propia cuenta de plataforma
    expect(asiento.detalle).toBeNull(); // jamás la contraseña
  });

  it('B5 — cambio FORZADO del super-admin: bloqueado en rutas de plataforma pero PUEDE rotar por /auth/cambiar-contrasena (sin lock-out); limpia el flag y revoca sesiones', async () => {
    const sa = await nuevoSuperAdmin(CLAVE, true);
    // Sesión viva real (login funciona aunque deba cambiar la clave): debe ser expulsada.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: sa.email, password: CLAVE },
    });
    expect(login.statusCode).toBe(200);
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: sa.id } })).toBe(1);

    const tk = tokenSuperAdmin(sa.id, true);
    // Con el flag activo, una ruta de plataforma NO exenta queda bloqueada (403 DEBE_CAMBIAR).
    const bloqueada = await app.inject({
      method: 'GET',
      url: '/empresas',
      headers: { authorization: `Bearer ${tk}` },
    });
    expect(bloqueada.statusCode).toBe(403);
    expect((bloqueada.json() as { codigo?: string }).codigo).toBe('DEBE_CAMBIAR_CONTRASENA');

    // Pero /auth/cambiar-contrasena SÍ está en la allowlist → puede cerrar el cambio forzado.
    const cambio = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-contrasena',
      remoteAddress: '10.20.0.2', // IP propia (ver nota de rate-limit arriba)
      headers: { authorization: `Bearer ${tk}` },
      payload: { contrasenaActual: CLAVE, contrasenaNueva: NUEVA },
    });
    expect(cambio.statusCode).toBe(204);

    const enBd = await semilla().usuario.findUniqueOrThrow({ where: { id: sa.id } });
    expect(enBd.debeCambiarContrasena).toBe(false); // flag limpio
    expect(await semilla().sesionRefresco.count({ where: { usuarioId: sa.id } })).toBe(0); // sesiones revocadas
  });

  it('regresión: usuario normal (esSuperAdmin=false) sigue auditando en la bitácora de TENANT → 204', async () => {
    const u = await nuevoUsuario();
    const res = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-contrasena',
      remoteAddress: '10.20.0.3', // IP propia (ver nota de rate-limit arriba)
      headers: { authorization: `Bearer ${token(u.id)}` },
      payload: { contrasenaActual: CLAVE, contrasenaNueva: NUEVA },
    });
    expect(res.statusCode).toBe(204);
    expect(await auditoriasDe(u.id)).toBe(1); // en la de tenant, no en la de plataforma
    expect(await auditoriasPlataformaDe(u.id)).toBe(0);
  });
});
