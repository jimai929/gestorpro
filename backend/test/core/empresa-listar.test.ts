import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';

/**
 * GET /empresas — listado de tenants para el super-admin. Lectura cross-tenant
 * PROTEGIDA por el guard de RUTA `soloPlataforma` (404 al resto), NO por RLS
 * (empresa/membresia/usuario están fuera de RLS; sin bypass). Cada fila lleva el
 * correo del primer admin (membresía predeterminada/administrador).
 */
describe('GET /empresas — listado de tenants (solo super-admin)', () => {
  let app: FastifyInstance;
  let superAdminId: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-empresas-listar';
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
      data: { nombre: `EL ${randomUUID().slice(0, 8)}`, slug: `el-${randomUUID()}` },
    });
    return app.jwt.sign({
      sub: randomUUID(),
      rol: 'administrador',
      empresaId: empresa.id,
      esSuperAdmin: false,
    });
  }
  async function crearEmpresaVia(slug: string, adminEmail: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/empresas',
      headers: { authorization: `Bearer ${tokenSuper()}` },
      payload: { nombre: `Empresa ${slug}`, slug, adminNombre: 'Admin', adminEmail, adminPassword: 'Clave123*' },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; slug: string; adminId: string };
  }

  type Fila = {
    id: string;
    nombre: string;
    slug: string;
    estado: 'activa' | 'suspendida' | 'cancelada';
    creadoEn: string;
    adminEmail: string | null;
  };

  it('sin token → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/empresas' });
    expect(res.statusCode).toBe(401);
  });

  // SEGURIDAD (clave): un admin normal NO debe siquiera descubrir el endpoint.
  it('admin normal (no super-admin) → 404 (soloPlataforma no revela el endpoint)', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/empresas',
      headers: { authorization: `Bearer ${await tokenAdmin()}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('super-admin → 200 con las empresas creadas y el email de su admin', async () => {
    const slugA = `lista-a-${randomUUID().slice(0, 8)}`;
    const slugB = `lista-b-${randomUUID().slice(0, 8)}`;
    const emailA = `admin-a-${randomUUID()}@x.local`;
    const emailB = `admin-b-${randomUUID()}@x.local`;
    const a = await crearEmpresaVia(slugA, emailA);
    const b = await crearEmpresaVia(slugB, emailB);

    const res = await app.inject({
      method: 'GET',
      url: '/empresas',
      headers: { authorization: `Bearer ${tokenSuper()}` },
    });
    expect(res.statusCode).toBe(200);
    const filas = res.json() as Fila[];

    // Ambas empresas creadas aparecen (la BD de Testcontainers se comparte entre
    // ficheros, por eso se buscan por id en vez de asumir el total).
    const filaA = filas.find((f) => f.id === a.id);
    const filaB = filas.find((f) => f.id === b.id);
    expect(filaA).toBeDefined();
    expect(filaB).toBeDefined();

    // adminEmail correcto (join membresia predeterminada/administrador → usuario.email).
    expect(filaA?.adminEmail).toBe(emailA);
    expect(filaB?.adminEmail).toBe(emailB);

    // Campos de la fila (B3: el listado expone `estado`, no el legacy `activo`).
    expect(filaA?.slug).toBe(slugA);
    expect(filaA?.nombre).toBe(`Empresa ${slugA}`);
    expect(filaA?.estado).toBe('activa');
    expect(typeof filaA?.creadoEn).toBe('string'); // ISO
  });
});
