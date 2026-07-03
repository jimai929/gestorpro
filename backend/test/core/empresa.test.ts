import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';

/**
 * 4c.3 — POST /empresas (plataforma). Alta de tenant + su primer admin + membresía,
 * en una transacción, vía bypass de super-admin AUDITADO (§4.4). Verifica: guard
 * 404 a no-super-admin, creación atómica, asiento de auditoría (empresaId explícito
 * + usuarioId del super-admin REAL), y el invariante §4.2 (super-admin sin membresía).
 */
describe('4c.3 — POST /empresas', () => {
  let app: FastifyInstance;
  let superAdminId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-empresas';
    // super-admin real en BD, SIN membresía (invariante §4.2).
    const su = await semilla().usuario.create({
      data: {
        nombre: 'Plataforma',
        email: `super-${randomUUID()}@gestorpro.local`,
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
  // Empresa REAL y activa para el token del admin de tenant: desde I5 `autenticar`
  // verifica la empresa del token en cada request (una inexistente → 401, y este
  // suite quiere probar el 404 de soloPlataforma, no el corte de I5).
  async function tokenAdmin(): Promise<string> {
    const empresa = await semilla().empresa.create({
      data: { nombre: `ET ${randomUUID().slice(0, 8)}`, slug: `et-${randomUUID()}` },
    });
    return app.jwt.sign({
      sub: randomUUID(),
      rol: 'administrador',
      empresaId: empresa.id,
      esSuperAdmin: false,
    });
  }
  function cuerpo(slug: string, adminEmail: string) {
    return {
      nombre: `Empresa ${slug}`,
      slug,
      adminNombre: 'Admin',
      adminEmail,
      adminPassword: 'Clave123*',
    };
  }

  it('admin normal → 404 (soloPlataforma no revela el endpoint)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/empresas',
      headers: { authorization: `Bearer ${await tokenAdmin()}` },
      payload: cuerpo(`x-${randomUUID().slice(0, 8)}`, `a-${randomUUID()}@x.local`),
    });
    expect(res.statusCode).toBe(404);
  });

  it('super-admin crea tenant + admin + membresía; audita; y sigue con 0 membresías', async () => {
    const slug = `acme-${randomUUID().slice(0, 8)}`;
    const adminEmail = `admin-${randomUUID()}@acme.local`;
    const res = await app.inject({
      method: 'POST',
      url: '/empresas',
      headers: { authorization: `Bearer ${tokenSuper()}` },
      payload: cuerpo(slug, adminEmail),
    });
    expect(res.statusCode).toBe(201);
    const creada = res.json() as { id: string; slug: string; adminId: string };
    expect(creada.slug).toBe(slug);

    // Empresa creada (god-view).
    expect(await semilla().empresa.findUnique({ where: { id: creada.id } })).not.toBeNull();

    // El admin NUEVO tiene UNA membresía admin, SOLO en la nueva empresa.
    const membresias = await semilla().membresia.findMany({ where: { usuarioId: creada.adminId } });
    expect(membresias).toHaveLength(1);
    expect(membresias[0]?.empresaId).toBe(creada.id);
    expect(membresias[0]?.rol).toBe('administrador');

    // El admin nace con contraseña TEMPORAL: debe cambiarla en el primer login.
    const admin = await semilla().usuario.findUniqueOrThrow({ where: { id: creada.adminId } });
    expect(admin.debeCambiarContrasena).toBe(true);

    // Asiento de auditoría: crear_empresa, empresa_id = nueva, usuario_id = super-admin REAL.
    const asientos = await semilla().auditoria.findMany({
      where: { entidad: 'empresa', entidadId: creada.id },
    });
    expect(asientos).toHaveLength(1);
    expect(asientos[0]?.accion).toBe('crear_empresa');
    expect(asientos[0]?.empresaId).toBe(creada.id);
    expect(asientos[0]?.usuarioId).toBe(superAdminId);

    // INVARIANTE §4.2: el super-admin NO ganó ninguna membresía al crear el tenant.
    expect(await semilla().membresia.count({ where: { usuarioId: superAdminId } })).toBe(0);
  });

  it('email de admin duplicado → 409 y ROLLBACK (no queda empresa a medias)', async () => {
    const email = `dup-${randomUUID()}@x.local`;
    const ok = await app.inject({
      method: 'POST',
      url: '/empresas',
      headers: { authorization: `Bearer ${tokenSuper()}` },
      payload: cuerpo(`dup1-${randomUUID().slice(0, 8)}`, email),
    });
    expect(ok.statusCode).toBe(201);

    // Segundo alta con el MISMO email de admin pero slug DISTINTO: falla en
    // usuario.create (P2002) DESPUÉS de empresa.create → la tx debe revertir todo.
    const slug2 = `dup2-${randomUUID().slice(0, 8)}`;
    const conflicto = await app.inject({
      method: 'POST',
      url: '/empresas',
      headers: { authorization: `Bearer ${tokenSuper()}` },
      payload: cuerpo(slug2, email),
    });
    expect(conflicto.statusCode).toBe(409);
    // Rollback: la empresa del segundo intento NO quedó.
    expect(await semilla().empresa.count({ where: { slug: slug2 } })).toBe(0);
  });
});
