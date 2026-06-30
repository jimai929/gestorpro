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

  // ── Guard B1: cuentas de PLATAFORMA (super-admin) ──────────────────────────
  // Un super-admin no tiene empresa (empresaId null). Su auto-cambio reventaba más
  // adentro al auditar (empresa_id NOT NULL + RLS) → 500 opaco. El guard lo rechaza
  // en la ENTRADA con 403 de dominio, ANTES de abrir transacción: cero efectos.

  // Super-admin REAL: esSuperAdmin=true y SIN membresía (no pertenece a ninguna empresa).
  async function nuevoSuperAdmin(clave = CLAVE) {
    return semilla().usuario.create({
      data: {
        nombre: 'Plataforma',
        email: `sa-${randomUUID()}@x.local`,
        rol: 'empleado', // mínimo privilegio; su poder viene de esSuperAdmin
        esSuperAdmin: true,
        passwordHash: await hashearContrasena(clave),
      },
    });
  }

  // Token con la forma exacta de un super-admin sin empresa activa: empresaId null.
  function tokenSuperAdmin(usuarioId: string): string {
    return app.jwt.sign({ sub: usuarioId, rol: 'empleado', empresaId: null, esSuperAdmin: true });
  }

  it('super-admin (esSuperAdmin=true, empresaId=null) → 403 de dominio (NO 500); hash intacto y SIN auditoría', async () => {
    const sa = await nuevoSuperAdmin();
    const antes = await hashDe(sa.id);

    const res = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-contrasena',
      headers: { authorization: `Bearer ${tokenSuperAdmin(sa.id)}` },
      payload: { contrasenaActual: CLAVE, contrasenaNueva: NUEVA },
    });

    // Rechazo claro en la entrada: 403, NO el 500 opaco que daba antes.
    expect(res.statusCode).toBe(403);
    const cuerpo = res.json() as { mensaje?: string; codigo?: string };
    expect(cuerpo.mensaje).toMatch(/plataforma/i);
    // No se reutiliza el contrato del cambio forzado.
    expect(cuerpo.codigo).toBeUndefined();

    // Cero efectos: el guard corta ANTES de la transacción.
    expect(await hashDe(sa.id)).toBe(antes); // hash intacto
    expect(await auditoriasDe(sa.id)).toBe(0); // sin asiento de auditoría
  });

  it('regresión: usuario normal (esSuperAdmin=false) NO se ve afectado por el guard B1 → sigue 204', async () => {
    const u = await nuevoUsuario();
    const res = await cambiar(u.id, { contrasenaActual: CLAVE, contrasenaNueva: NUEVA });
    expect(res.statusCode).toBe(204);
  });
});
