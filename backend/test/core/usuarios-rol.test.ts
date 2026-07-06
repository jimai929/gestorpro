import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';

/**
 * M3b — PATCH /usuarios/:usuarioId/rol: un administrador del tenant cambia el ROL de
 * la MEMBRESÍA de un usuario en SU empresa (empleado ⇄ supervisor ⇄ administrador).
 * Toca SOLO la Membresia de ESTA empresa (rol per-tenant), nunca el Usuario.rol global
 * ni las membresías del usuario en otras empresas. Guards espejo del resto del módulo:
 * empresaId del token; 404 ÚNICO anti-enumeración (inexistente = otro tenant = plataforma);
 * auto-cambio prohibido (400); multi-empresa PERMITIDO (cambio per-membresía, sin escalada).
 * Corre contra Postgres real (Testcontainers) bajo gestorpro_app.
 */
describe('M3b — PATCH /usuarios/:id/rol (rol de la membresía)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-usuarios-rol';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  async function nuevaEmpresa() {
    return semilla().empresa.create({
      data: { nombre: `UR ${randomUUID().slice(0, 8)}`, slug: `ur-${randomUUID()}` },
    });
  }
  async function nuevoUsuario(opts: { esSuperAdmin?: boolean } = {}) {
    return semilla().usuario.create({
      data: {
        nombre: 'U',
        email: `ur-${randomUUID()}@x.local`,
        passwordHash: 'x',
        esSuperAdmin: opts.esSuperAdmin ?? false,
      },
    });
  }
  async function conMembresia(
    usuarioId: string,
    empresaId: string,
    rol: 'administrador' | 'supervisor' | 'empleado' = 'empleado',
    predeterminada = true,
  ) {
    return semilla().membresia.create({ data: { usuarioId, empresaId, rol, predeterminada } });
  }
  function tokenAdmin(adminId: string, empresaId: string) {
    return app.jwt.sign({ sub: adminId, rol: 'administrador', empresaId, esSuperAdmin: false });
  }
  function cambiarRol(token: string, usuarioId: string, rol: unknown) {
    return app.inject({
      method: 'PATCH',
      url: `/usuarios/${usuarioId}/rol`,
      headers: { authorization: `Bearer ${token}` },
      payload: { rol },
    });
  }
  async function rolEnBd(usuarioId: string, empresaId: string): Promise<string | undefined> {
    const m = await semilla().membresia.findUnique({
      where: { usuarioId_empresaId: { usuarioId, empresaId } },
    });
    return m?.rol;
  }

  it('empleado → supervisor: 200, la fila trae el rol nuevo y la Membresia en BD queda supervisor', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const objetivo = await nuevoUsuario();
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(objetivo.id, empresa.id, 'empleado');

    const res = await cambiarRol(tokenAdmin(admin.id, empresa.id), objetivo.id, 'supervisor');
    expect(res.statusCode).toBe(200);
    const fila = res.json() as { id: string; rol: string };
    expect(fila.id).toBe(objetivo.id);
    expect(fila.rol).toBe('supervisor');
    expect(await rolEnBd(objetivo.id, empresa.id)).toBe('supervisor');
  });

  it('supervisor → empleado: 200 y la Membresia vuelve a empleado', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const objetivo = await nuevoUsuario();
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(objetivo.id, empresa.id, 'supervisor');

    const res = await cambiarRol(tokenAdmin(admin.id, empresa.id), objetivo.id, 'empleado');
    expect(res.statusCode).toBe(200);
    expect(await rolEnBd(objetivo.id, empresa.id)).toBe('empleado');
  });

  it('empleado → administrador y supervisor → administrador: ambos 200 (promoción)', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const emp = await nuevoUsuario();
    const sup = await nuevoUsuario();
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(emp.id, empresa.id, 'empleado');
    await conMembresia(sup.id, empresa.id, 'supervisor');

    expect((await cambiarRol(tokenAdmin(admin.id, empresa.id), emp.id, 'administrador')).statusCode).toBe(200);
    expect((await cambiarRol(tokenAdmin(admin.id, empresa.id), sup.id, 'administrador')).statusCode).toBe(200);
    expect(await rolEnBd(emp.id, empresa.id)).toBe('administrador');
    expect(await rolEnBd(sup.id, empresa.id)).toBe('administrador');
  });

  it('degradar administrador → empleado: 200', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const otroAdmin = await nuevoUsuario();
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(otroAdmin.id, empresa.id, 'administrador');

    const res = await cambiarRol(tokenAdmin(admin.id, empresa.id), otroAdmin.id, 'empleado');
    expect(res.statusCode).toBe(200);
    expect(await rolEnBd(otroAdmin.id, empresa.id)).toBe('empleado');
  });

  it('no administrador (empleado/supervisor) → 403 y NO cambia el rol', async () => {
    const empresa = await nuevaEmpresa();
    const noAdmin = await nuevoUsuario();
    const objetivo = await nuevoUsuario();
    await conMembresia(noAdmin.id, empresa.id, 'supervisor');
    await conMembresia(objetivo.id, empresa.id, 'empleado');

    const tokenSup = app.jwt.sign({ sub: noAdmin.id, rol: 'supervisor', empresaId: empresa.id, esSuperAdmin: false });
    const res = await cambiarRol(tokenSup, objetivo.id, 'administrador');
    expect(res.statusCode).toBe(403);
    expect(await rolEnBd(objetivo.id, empresa.id)).toBe('empleado');
  });

  it('rol del body fuera de la lista blanca → 400 (schema): plataforma y string arbitrario', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const objetivo = await nuevoUsuario();
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(objetivo.id, empresa.id, 'empleado');
    const tk = tokenAdmin(admin.id, empresa.id);

    expect((await cambiarRol(tk, objetivo.id, 'plataforma')).statusCode).toBe(400);
    expect((await cambiarRol(tk, objetivo.id, 'root')).statusCode).toBe(400);
    // Body SIN rol → 400 (required). (Un campo extra NO da 400: el ajv del proyecto lo
    // DESCARTA con additionalProperties:false, mismo comportamiento que POST /usuarios).
    expect(
      (await app.inject({
        method: 'PATCH',
        url: `/usuarios/${objetivo.id}/rol`,
        headers: { authorization: `Bearer ${tk}` },
        payload: {},
      })).statusCode,
    ).toBe(400);
    expect(await rolEnBd(objetivo.id, empresa.id)).toBe('empleado');
  });

  it('el admin NO puede cambiar su PROPIO rol → 400 (ni con el uuid en mayúsculas)', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    await conMembresia(admin.id, empresa.id, 'administrador');
    const tk = tokenAdmin(admin.id, empresa.id);

    expect((await cambiarRol(tk, admin.id, 'empleado')).statusCode).toBe(400);
    // uuid en MAYÚSCULAS: el guard normaliza a minúsculas antes de comparar.
    expect((await cambiarRol(tk, admin.id.toUpperCase(), 'empleado')).statusCode).toBe(400);
    expect(await rolEnBd(admin.id, empresa.id)).toBe('administrador');
  });

  it('usuario de OTRO tenant → 404 (sin cambiar su membresía en su empresa)', async () => {
    const empresaA = await nuevaEmpresa();
    const empresaB = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const ajeno = await nuevoUsuario();
    await conMembresia(admin.id, empresaA.id, 'administrador');
    await conMembresia(ajeno.id, empresaB.id, 'empleado'); // membresía SOLO en B

    const res = await cambiarRol(tokenAdmin(admin.id, empresaA.id), ajeno.id, 'administrador');
    expect(res.statusCode).toBe(404);
    expect(await rolEnBd(ajeno.id, empresaB.id)).toBe('empleado'); // intacta
  });

  it('usuario inexistente → 404', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    await conMembresia(admin.id, empresa.id, 'administrador');
    const res = await cambiarRol(
      tokenAdmin(admin.id, empresa.id),
      '00000000-0000-0000-0000-000000000000',
      'supervisor',
    );
    expect(res.statusCode).toBe(404);
  });

  it('cuenta de PLATAFORMA (esSuperAdmin) → 404 aunque tuviera membresía (estado corrupto)', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const plataforma = await nuevoUsuario({ esSuperAdmin: true });
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(plataforma.id, empresa.id, 'empleado'); // invariante §4.2 violado a mano

    const res = await cambiarRol(tokenAdmin(admin.id, empresa.id), plataforma.id, 'administrador');
    expect(res.statusCode).toBe(404);
  });

  it('cuenta MULTI-EMPRESA: se cambia SOLO la membresía de ESTA empresa; la de la otra NO se toca', async () => {
    const empresaA = await nuevaEmpresa();
    const empresaB = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const multi = await nuevoUsuario();
    await conMembresia(admin.id, empresaA.id, 'administrador');
    await conMembresia(multi.id, empresaA.id, 'empleado', true);
    await conMembresia(multi.id, empresaB.id, 'supervisor', false); // otra empresa

    const res = await cambiarRol(tokenAdmin(admin.id, empresaA.id), multi.id, 'administrador');
    expect(res.statusCode).toBe(200); // NO 409: el cambio es per-membresía
    expect(await rolEnBd(multi.id, empresaA.id)).toBe('administrador'); // ESTA empresa
    expect(await rolEnBd(multi.id, empresaB.id)).toBe('supervisor'); // la OTRA, intacta
  });

  it('auditoría: un asiento cambiar_rol_membresia con actor=admin, entidadId=objetivo y empresa_id de ESTA empresa; Usuario.rol legacy NO cambia', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const objetivo = await nuevoUsuario(); // Usuario.rol legacy = default 'empleado'
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(objetivo.id, empresa.id, 'empleado');

    const res = await cambiarRol(tokenAdmin(admin.id, empresa.id), objetivo.id, 'supervisor');
    expect(res.statusCode).toBe(200);

    const asientos = await semilla().auditoria.findMany({
      where: { entidad: 'usuario', entidadId: objetivo.id, accion: 'cambiar_rol_membresia' },
    });
    expect(asientos).toHaveLength(1);
    expect(asientos[0]?.usuarioId).toBe(admin.id); // el ADMIN que ejecuta
    expect(asientos[0]?.empresaId).toBe(empresa.id); // tenant del GUC (override)
    expect(asientos[0]?.detalle).toMatchObject({ rolAnterior: 'empleado', rol: 'supervisor' });

    // El espejo legacy Usuario.rol NO se toca: sigue en su valor global (default 'empleado').
    const u = await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } });
    expect(u.rol).toBe('empleado');
  });

  it('idempotente: pedir el rol que YA tiene → 200 sin asiento duplicado', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    const objetivo = await nuevoUsuario();
    await conMembresia(admin.id, empresa.id, 'administrador');
    await conMembresia(objetivo.id, empresa.id, 'supervisor');

    const res = await cambiarRol(tokenAdmin(admin.id, empresa.id), objetivo.id, 'supervisor');
    expect(res.statusCode).toBe(200);
    expect(await rolEnBd(objetivo.id, empresa.id)).toBe('supervisor');
    const asientos = await semilla().auditoria.findMany({
      where: { entidad: 'usuario', entidadId: objetivo.id, accion: 'cambiar_rol_membresia' },
    });
    expect(asientos).toHaveLength(0); // no-op: sin asiento
  });
});
