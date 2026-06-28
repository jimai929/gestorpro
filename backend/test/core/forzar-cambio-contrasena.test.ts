import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';
import type { PayloadAccess } from '../../src/core/auth/auth.tipos.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';

/**
 * Commit 2 — bloqueo de cambio de contraseña FORZADO. Un usuario con
 * debeCambiarContrasena=true queda bloqueado en TODO endpoint autenticado (403 +
 * codigo DEBE_CAMBIAR_CONTRASENA) SALVO la allowlist /auth/* de autoservicio, hasta
 * que rote la clave. Default-block: el guard vive dentro de `autenticar`. Corre contra
 * Postgres real (Testcontainers).
 */
const CLAVE = 'Clave123*';
const NUEVA = 'NuevaClave1*';

describe('Commit 2 — forzar cambio de contraseña (guard en autenticar)', () => {
  let app: FastifyInstance;
  let empresaA: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-forzar-cambio';
    const a = await semilla().empresa.create({
      data: { nombre: `A-${randomUUID()}`, slug: `a-${randomUUID()}` },
    });
    empresaA = a.id;
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  /** Firma un token; si `debeCambiarContrasena` es undefined, se OMITE (simula token viejo). */
  function token(opts: { sub?: string; debeCambiarContrasena?: boolean } = {}): string {
    const payload: PayloadAccess = {
      sub: opts.sub ?? randomUUID(),
      rol: 'administrador',
      empresaId: empresaA,
      esSuperAdmin: false,
    };
    // Se OMITE el campo si es undefined (simula un token viejo, anterior a Commit 1).
    if (opts.debeCambiarContrasena !== undefined) {
      payload.debeCambiarContrasena = opts.debeCambiarContrasena;
    }
    return app.jwt.sign(payload);
  }

  /** Usuario real (con clave conocida y membresía en A) para login y cambio de contraseña. */
  async function usuarioConClave(clave: string, debeCambiarContrasena: boolean) {
    const u = await semilla().usuario.create({
      data: {
        nombre: 'U',
        email: `fc-${randomUUID()}@x.local`,
        rol: 'administrador',
        passwordHash: await hashearContrasena(clave),
        debeCambiarContrasena,
      },
    });
    await semilla().membresia.create({
      data: { usuarioId: u.id, empresaId: empresaA, rol: 'administrador', predeterminada: true },
    });
    return u;
  }

  function get(url: string, tk: string) {
    return app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${tk}` } });
  }

  it('1. flag=true en endpoint de negocio (GET /sedes) → 403 + codigo DEBE_CAMBIAR_CONTRASENA', async () => {
    const res = await get('/sedes', token({ debeCambiarContrasena: true }));
    expect(res.statusCode).toBe(403);
    expect((res.json() as { codigo: string }).codigo).toBe('DEBE_CAMBIAR_CONTRASENA');
  });

  it('2. ★ flag=true en POST /auth/cambiar-contrasena → RinDE 204 (exento; sin deadlock)', async () => {
    const u = await usuarioConClave(CLAVE, true);
    const tk = token({ sub: u.id, debeCambiarContrasena: true });
    const res = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-contrasena',
      headers: { authorization: `Bearer ${tk}` },
      payload: { contrasenaActual: CLAVE, contrasenaNueva: NUEVA },
    });
    expect(res.statusCode).toBe(204); // NO 403: el guard exime esta ruta
  });

  it('3. flag=true en GET /auth/me y POST /auth/logout → PASAN (allowlist)', async () => {
    const u = await usuarioConClave(CLAVE, true);
    const tk = token({ sub: u.id, debeCambiarContrasena: true });
    const me = await get('/auth/me', tk);
    expect(me.statusCode).toBe(200);
    expect((me.json() as { debeCambiarContrasena: boolean }).debeCambiarContrasena).toBe(true);

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { authorization: `Bearer ${tk}` },
      payload: { refreshToken: randomUUID() }, // idempotente
    });
    expect(logout.statusCode).toBe(204);
  });

  it('4. end-to-end: flag=true → /sedes 403 → cambia clave → re-login → /sedes 200', async () => {
    const u = await usuarioConClave(CLAVE, true);

    // login: el token y el usuario público traen flag=true.
    const login1 = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: u.email, password: CLAVE },
    });
    expect(login1.statusCode).toBe(200);
    const body1 = login1.json() as { accessToken: string; usuario: { debeCambiarContrasena: boolean } };
    expect(body1.usuario.debeCambiarContrasena).toBe(true);

    // negocio bloqueado.
    const sedes1 = await get('/sedes', body1.accessToken);
    expect(sedes1.statusCode).toBe(403);
    expect((sedes1.json() as { codigo: string }).codigo).toBe('DEBE_CAMBIAR_CONTRASENA');

    // cambia la contraseña (exento) → limpia el flag + revoca sesiones.
    const cambio = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-contrasena',
      headers: { authorization: `Bearer ${body1.accessToken}` },
      payload: { contrasenaActual: CLAVE, contrasenaNueva: NUEVA },
    });
    expect(cambio.statusCode).toBe(204);

    // re-login con la NUEVA clave: ahora el flag es false.
    const login2 = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: u.email, password: NUEVA },
    });
    expect(login2.statusCode).toBe(200);
    const body2 = login2.json() as { accessToken: string; usuario: { debeCambiarContrasena: boolean } };
    expect(body2.usuario.debeCambiarContrasena).toBe(false);

    // negocio AHORA permitido.
    const sedes2 = await get('/sedes', body2.accessToken);
    expect(sedes2.statusCode).toBe(200);
  });

  it('5. token VIEJO sin el campo → endpoint de negocio PASA (?? false, sin lock-out)', async () => {
    const res = await get('/sedes', token({})); // sin debeCambiarContrasena en el payload
    expect(res.statusCode).toBe(200);
  });

  it('6. flag=false (usuario normal) → endpoint de negocio PASA', async () => {
    const res = await get('/sedes', token({ debeCambiarContrasena: false }));
    expect(res.statusCode).toBe(200);
  });

  it('7. petición NO autenticada (POST /auth/login) → no la afecta el guard', async () => {
    const u = await usuarioConClave(CLAVE, false);
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: u.email, password: CLAVE },
    });
    expect(res.statusCode).toBe(200); // login funciona normal (no pasa por autenticar)
  });

  it('8. ruta de la allowlist CON query string sigue exenta (blinda el split("?"))', async () => {
    // Si alguien borra el split('?'), /auth/me?x=1 con flag=true daría 403 → deadlock.
    const u = await usuarioConClave(CLAVE, true);
    const tk = token({ sub: u.id, debeCambiarContrasena: true });
    const me = await get('/auth/me?_=cachebuster', tk);
    expect(me.statusCode).toBe(200);
  });

  it('9. el guard es method-agnóstico: POST de negocio con flag=true → 403 (antes de autorizar)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/sedes',
      headers: { authorization: `Bearer ${token({ debeCambiarContrasena: true })}` },
      payload: { nombre: 'Sede X' },
    });
    expect(res.statusCode).toBe(403);
    expect((res.json() as { codigo: string }).codigo).toBe('DEBE_CAMBIAR_CONTRASENA');
  });

  it('10. tras cambiar la clave, el token VIEJO (flag=true) sigue bloqueado → over-block seguro (re-login)', async () => {
    const u = await usuarioConClave(CLAVE, true);
    const tk = token({ sub: u.id, debeCambiarContrasena: true });
    const cambio = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-contrasena',
      headers: { authorization: `Bearer ${tk}` },
      payload: { contrasenaActual: CLAVE, contrasenaNueva: NUEVA },
    });
    expect(cambio.statusCode).toBe(204);
    // El JWT viejo conserva flag=true (stateless); el front DEBE re-loguear, no reutilizarlo.
    const sedes = await get('/sedes', tk);
    expect(sedes.statusCode).toBe(403);
  });
});
