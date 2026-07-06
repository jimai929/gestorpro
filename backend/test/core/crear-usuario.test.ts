import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';
import type { Rol } from '../../src/generated/prisma/enums.js';

/**
 * Fase 4c — POST /usuarios: un administrador del tenant crea usuarios (administrador|
 * supervisor|empleado, M3a) en su PROPIA empresa. Reglas de seguridad: empresaId SIEMPRE del token
 * (nunca del body); esSuperAdmin intocable (default false); rol en lista blanca;
 * email UNIQUE GLOBAL. Corre contra Postgres real (Testcontainers) bajo gestorpro_app.
 */
describe('Fase 4c — POST /usuarios (alta de usuarios en el tenant)', () => {
  let app: FastifyInstance;
  let empresaA: string;
  let empresaB: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-crear-usuario';
    const a = await semilla().empresa.create({
      data: { nombre: `A-${randomUUID()}`, slug: `a-${randomUUID()}` },
    });
    const b = await semilla().empresa.create({
      data: { nombre: `B-${randomUUID()}`, slug: `b-${randomUUID()}` },
    });
    empresaA = a.id;
    empresaB = b.id;
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  function token(rol: Rol, empresaId: string | null, esSuperAdmin = false): string {
    return app.jwt.sign({ sub: randomUUID(), rol, empresaId, esSuperAdmin });
  }
  function cuerpo(email: string, rol = 'empleado', extra: Record<string, unknown> = {}) {
    return { nombre: 'Nuevo', email, password: 'Clave123*', rol, ...extra };
  }
  function crear(tokenStr: string, body: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: '/usuarios',
      headers: { authorization: `Bearer ${tokenStr}` },
      payload: body,
    });
  }
  type RespUsuario = { id: string; nombre: string; email: string; rol: string; passwordHash?: string };

  it('admin crea usuario → 201; membresía en SU tenant, predeterminada, hash argon2, auditoría sin clave', async () => {
    const email = `u-${randomUUID()}@x.local`;
    const adminSub = randomUUID();
    const tk = app.jwt.sign({ sub: adminSub, rol: 'administrador', empresaId: empresaA, esSuperAdmin: false });
    const res = await crear(tk, cuerpo(email, 'empleado'));
    expect(res.statusCode).toBe(201);
    const body = res.json() as RespUsuario;
    expect(body).toMatchObject({ nombre: 'Nuevo', email, rol: 'empleado' });
    expect(body.id).toBeTruthy();
    expect(body.passwordHash).toBeUndefined(); // jamás se devuelve el hash

    const ms = await semilla().membresia.findMany({ where: { usuarioId: body.id } });
    expect(ms).toHaveLength(1);
    expect(ms[0]?.empresaId).toBe(empresaA);
    expect(ms[0]?.predeterminada).toBe(true);
    expect(ms[0]?.rol).toBe('empleado');

    // La contraseña queda HASHEADA (argon2) en BD, jamás en claro (regla dura del proyecto).
    const u = await semilla().usuario.findUniqueOrThrow({ where: { id: body.id } });
    expect(u.passwordHash.startsWith('$argon2')).toBe(true);
    expect(u.passwordHash).not.toContain('Clave123*');
    // Contraseña temporal: el nuevo usuario debe cambiarla en el primer login.
    expect(u.debeCambiarContrasena).toBe(true);

    // Asiento de auditoría: 1, crear_usuario, del admin (token), en el tenant A, SIN clave.
    const asientos = await semilla().auditoria.findMany({
      where: { entidad: 'usuario', entidadId: body.id, accion: 'crear_usuario' },
    });
    expect(asientos).toHaveLength(1);
    expect(asientos[0]?.usuarioId).toBe(adminSub); // el ADMIN que ejecuta, no el nuevo usuario
    expect(asientos[0]?.empresaId).toBe(empresaA); // tenant del GUC (override), no por accidente
    expect(JSON.stringify(asientos[0])).not.toContain('Clave123*');
  });

  it('body con empresaId forjado (otro tenant) → IGNORADO: el usuario se crea solo en el tenant del admin', async () => {
    const email = `u-${randomUUID()}@x.local`;
    const res = await crear(
      token('administrador', empresaA),
      cuerpo(email, 'empleado', { empresaId: empresaB }), // intento de forjar B
    );
    expect(res.statusCode).toBe(201); // el campo extra se descarta (ajv), no rompe
    const body = res.json() as RespUsuario;
    const ms = await semilla().membresia.findMany({ where: { usuarioId: body.id } });
    expect(ms).toHaveLength(1);
    expect(ms[0]?.empresaId).toBe(empresaA); // SU tenant, no el forjado B
    expect(
      await semilla().membresia.count({ where: { usuarioId: body.id, empresaId: empresaB } }),
    ).toBe(0);
  });

  it('body con esSuperAdmin:true → IGNORADO: el nuevo usuario queda esSuperAdmin=false', async () => {
    const email = `u-${randomUUID()}@x.local`;
    const res = await crear(
      token('administrador', empresaA),
      cuerpo(email, 'administrador', { esSuperAdmin: true }), // intento de escalar
    );
    expect(res.statusCode).toBe(201);
    const body = res.json() as RespUsuario;
    const u = await semilla().usuario.findUnique({ where: { id: body.id } });
    expect(u?.esSuperAdmin).toBe(false); // intocable, default
    // el rol 'administrador' se propaga a la membresía (no solo el caso empleado del test 1).
    const ms = await semilla().membresia.findMany({ where: { usuarioId: body.id } });
    expect(ms[0]?.rol).toBe('administrador');
  });

  it('M3a: admin crea un supervisor → 201; la membresía en SU tenant queda con rol=supervisor', async () => {
    const email = `u-${randomUUID()}@x.local`;
    const res = await crear(token('administrador', empresaA), cuerpo(email, 'supervisor'));
    expect(res.statusCode).toBe(201);
    const body = res.json() as RespUsuario;
    expect(body.rol).toBe('supervisor');
    const ms = await semilla().membresia.findMany({ where: { usuarioId: body.id } });
    expect(ms).toHaveLength(1);
    expect(ms[0]?.empresaId).toBe(empresaA);
    expect(ms[0]?.rol).toBe('supervisor');
  });

  it('rol fuera de la lista blanca → 400 (schema): un string arbitrario o un rol de plataforma', async () => {
    // M3a: `supervisor` YA es asignable; lo que sigue cortado es cualquier valor que
    // no sea un rol INTERNO de empresa (administrador|supervisor|empleado).
    const arb = await crear(token('administrador', empresaA), cuerpo(`u-${randomUUID()}@x.local`, 'root'));
    expect(arb.statusCode).toBe(400);
    const plat = await crear(token('administrador', empresaA), cuerpo(`u-${randomUUID()}@x.local`, 'plataforma'));
    expect(plat.statusCode).toBe(400);
  });

  it('empleado (no admin) → 403 y NO crea ningún usuario', async () => {
    const email = `u-${randomUUID()}@x.local`;
    const res = await crear(token('empleado', empresaA), cuerpo(email));
    expect(res.statusCode).toBe(403);
    expect(await semilla().usuario.findUnique({ where: { email } })).toBeNull();
  });

  it('super-admin (empresaId=null, rol empleado) → 403 (bloqueado por autorizar(administrador))', async () => {
    // Super-admin REAL: desde I5 el claim esSuperAdmin se verifica contra BD en cada
    // request (inexistente = revocado → 401, y aquí se prueba el 403 de autorizar).
    const su = await semilla().usuario.create({
      data: {
        nombre: 'Plataforma',
        email: `su-${randomUUID()}@gestorpro.local`,
        passwordHash: 'x',
        esSuperAdmin: true,
      },
    });
    const tk = app.jwt.sign({ sub: su.id, rol: 'empleado', empresaId: null, esSuperAdmin: true });
    const res = await crear(tk, cuerpo(`u-${randomUUID()}@x.local`));
    expect(res.statusCode).toBe(403);
  });

  it('admin con empresaId=null (sin empresa activa) → 403 (guard de profundidad de la ruta)', async () => {
    // rol='administrador' pasa autorizar(), pero empresaId=null dispara el guard de la ruta.
    const res = await crear(token('administrador', null), cuerpo(`u-${randomUUID()}@x.local`));
    expect(res.statusCode).toBe(403);
  });

  it('email YA existente (incluso en OTRO tenant) → 409 (unique global)', async () => {
    const email = `dup-${randomUUID()}@x.local`;
    const ok = await crear(token('administrador', empresaA), cuerpo(email, 'empleado'));
    expect(ok.statusCode).toBe(201);
    // El admin de B intenta el MISMO email → conflicto global (no per-empresa).
    const dup = await crear(token('administrador', empresaB), cuerpo(email, 'empleado'));
    expect(dup.statusCode).toBe(409);
  });

  it('aislamiento: el usuario creado por el admin de A pertenece SOLO a A, no es miembro de B', async () => {
    // NOTA: `usuario` y `membresia` están EXCLUIDOS de RLS (post-migrate.sql:39) — el
    // aislamiento de usuarios es por MEMBRESÍA (email unique global + filtro por
    // empresaId), no por fila RLS. Se verifica la garantía REAL: el usuario es miembro de
    // A y de NINGÚN otro tenant (no puede actuar en B).
    const email = `iso-${randomUUID()}@x.local`;
    const res = await crear(token('administrador', empresaA), cuerpo(email, 'empleado'));
    expect(res.statusCode).toBe(201);
    const body = res.json() as RespUsuario;

    const ms = await semilla().membresia.findMany({ where: { usuarioId: body.id } });
    expect(ms).toHaveLength(1);
    expect(ms[0]?.empresaId).toBe(empresaA);
    expect(
      await semilla().membresia.count({ where: { usuarioId: body.id, empresaId: empresaB } }),
    ).toBe(0); // NO es miembro de B
  });
});
