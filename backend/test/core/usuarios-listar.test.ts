import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';

/**
 * Fase 4c — GET /usuarios: listado de usuarios del tenant para su administrador.
 * El filtro es la MEMBRESÍA en la empresa del TOKEN (nunca query/body); el rol de
 * cada fila es el de la membresía (per-tenant), no el `Usuario.rol` global. Las
 * cuentas de plataforma (esSuperAdmin) son invisibles aunque tuvieran membresía.
 * El super-admin obtiene el listado ENTRANDO a la empresa (dos niveles); en
 * plataforma queda fuera (403).
 */
describe('Fase 4c — GET /usuarios (listado del tenant)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-usuarios-listar';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  async function nuevaEmpresa() {
    return semilla().empresa.create({
      data: { nombre: `LU ${randomUUID().slice(0, 8)}`, slug: `lu-${randomUUID()}` },
    });
  }
  async function nuevoUsuario(
    opts: { nombre?: string; esSuperAdmin?: boolean; debeCambiar?: boolean } = {},
  ) {
    return semilla().usuario.create({
      data: {
        nombre: opts.nombre ?? 'U',
        email: `lu-${randomUUID()}@x.local`,
        passwordHash: 'x',
        esSuperAdmin: opts.esSuperAdmin ?? false,
        debeCambiarContrasena: opts.debeCambiar ?? false,
      },
    });
  }
  async function conMembresia(usuarioId: string, empresaId: string, rol = 'empleado') {
    return semilla().membresia.create({
      data: { usuarioId, empresaId, rol: rol as 'empleado', predeterminada: true },
    });
  }
  function listar(token: string) {
    return app.inject({
      method: 'GET',
      url: '/usuarios',
      headers: { authorization: `Bearer ${token}` },
    });
  }

  type Fila = {
    id: string;
    nombre: string;
    email: string;
    rol: string;
    activo: boolean;
    debeCambiarContrasena: boolean;
    creadoEn: string;
  };

  it('admin ve SOLO su empresa (conjuntos exactos), con el rol de la MEMBRESÍA y sin secretos', async () => {
    const empresa = await nuevaEmpresa();
    const otra = await nuevaEmpresa();
    const admin = await nuevoUsuario({ nombre: 'Berta Admin' });
    const empleado = await nuevoUsuario({ nombre: 'Ana Empleada', debeCambiar: true });
    const ajeno = await nuevoUsuario({ nombre: 'Carlos Ajeno' });
    // Multi-membresía: rol per-tenant — administrador en `otra`, empleado en `empresa`.
    const dual = await nuevoUsuario({ nombre: 'Diana Dual' });
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(empleado.id, empresa.id, 'empleado');
    await conMembresia(ajeno.id, otra.id, 'empleado');
    await conMembresia(dual.id, empresa.id, 'empleado');
    await semilla().membresia.create({
      data: { usuarioId: dual.id, empresaId: otra.id, rol: 'administrador' },
    });

    const tk = app.jwt.sign({ sub: admin.id, rol: 'administrador', empresaId: empresa.id, esSuperAdmin: false });
    const res = await listar(tk);
    expect(res.statusCode).toBe(200);
    const filas = res.json() as Fila[];

    // Conjunto EXACTO (no length): los 3 de la empresa, nunca el ajeno.
    expect(new Set(filas.map((f) => f.id))).toEqual(new Set([admin.id, empleado.id, dual.id]));

    // Orden por nombre y rol de la MEMBRESÍA en ESTA empresa (dual es admin en la otra).
    expect(filas.map((f) => f.nombre)).toEqual(['Ana Empleada', 'Berta Admin', 'Diana Dual']);
    const filaDual = filas.find((f) => f.id === dual.id);
    expect(filaDual?.rol).toBe('empleado');
    const filaAdmin = filas.find((f) => f.id === admin.id);
    expect(filaAdmin?.rol).toBe('administrador');

    // Campos de la fila: flag de temporal visible, fecha ISO y NINGÚN secreto.
    const filaEmpleado = filas.find((f) => f.id === empleado.id);
    expect(filaEmpleado?.email).toBe(empleado.email);
    expect(filaEmpleado?.debeCambiarContrasena).toBe(true);
    expect(filaEmpleado?.activo).toBe(true);
    expect(typeof filaEmpleado?.creadoEn).toBe('string');
    expect(res.body).not.toContain('passwordHash');
    expect(res.body).not.toContain('password_hash');

    // Control: el admin de la OTRA empresa sí ve a su gente (el filtro no es global).
    const adminOtra = await nuevoUsuario({ nombre: 'Admin Otra' });
    await conMembresia(adminOtra.id, otra.id, 'administrador');
    const tkOtra = app.jwt.sign({ sub: adminOtra.id, rol: 'administrador', empresaId: otra.id, esSuperAdmin: false });
    const resOtra = await listar(tkOtra);
    expect(resOtra.statusCode).toBe(200);
    const idsOtra = new Set((resOtra.json() as Fila[]).map((f) => f.id));
    expect(idsOtra).toEqual(new Set([ajeno.id, dual.id, adminOtra.id]));
  });

  it('cuenta de plataforma CON membresía (estado corrupto §4.2): NO aparece en el listado', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const superConMembresia = await nuevoUsuario({ esSuperAdmin: true });
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(superConMembresia.id, empresa.id, 'administrador');

    const tk = app.jwt.sign({ sub: admin.id, rol: 'administrador', empresaId: empresa.id, esSuperAdmin: false });
    const res = await listar(tk);
    expect(res.statusCode).toBe(200);
    const ids = (res.json() as Fila[]).map((f) => f.id);
    expect(ids).toContain(admin.id);
    expect(ids).not.toContain(superConMembresia.id); // invisible: anti-enumeración
  });

  it('sin token → 401; empleado y supervisor → 403 (solo administrador)', async () => {
    const empresa = await nuevaEmpresa();
    const sinToken = await app.inject({ method: 'GET', url: '/usuarios' });
    expect(sinToken.statusCode).toBe(401);

    for (const rol of ['empleado', 'supervisor'] as const) {
      const tk = app.jwt.sign({ sub: randomUUID(), rol, empresaId: empresa.id, esSuperAdmin: false });
      const res = await listar(tk);
      expect(res.statusCode).toBe(403);
    }
  });

  it('B4 — super-admin EN PLATAFORMA (empresaId null): 403; y ya NO puede ENTRAR para listar (cambiar-empresa → 403)', async () => {
    const empresa = await nuevaEmpresa();
    const empleado = await nuevoUsuario({ nombre: 'Solo Uno' });
    await conMembresia(empleado.id, empresa.id, 'empleado');
    const superAdmin = await nuevoUsuario({ esSuperAdmin: true });

    const tkPlataforma = app.jwt.sign({ sub: superAdmin.id, rol: 'empleado', empresaId: null, esSuperAdmin: true });
    // Desde plataforma: el guard de tenant lo rechaza.
    expect((await listar(tkPlataforma)).statusCode).toBe(403);

    // B4: no puede entrar a la empresa para listar sus usuarios (dos niveles eliminado).
    const entrar = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-empresa',
      headers: { authorization: `Bearer ${tkPlataforma}` },
      payload: { empresaId: empresa.id },
    });
    expect(entrar.statusCode).toBe(403);
  });
});
