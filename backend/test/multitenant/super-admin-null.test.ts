import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, comoEmpresa, cerrarSemilla } from '../helpers/db.js';
import { sembrarDosEmpresas, type DosEmpresas } from './_fixture-dos-empresas.js';
import { listarSedes } from '../../src/core/sede/sede.service.js';
import { listarEmpleados } from '../../src/core/empleado/empleado.service.js';

/**
 * ⑤ super-admin con empresaId=null (Fase 8). El bypass de plataforma (Fase 4c)
 * está INERTE: ningún endpoint fija `app.bypass_tenant='on'`. Por tanto un
 * super-admin SIN empresa activa NO debe ver datos de NINGÚN tenant: fail-closed
 * (0 filas), nunca "todos". Es la red line de §6 (super-admin-null): el rol mínimo
 * `empleado` del super-admin NO puede caer en una rama "match-all".
 */
describe('Fase 8 ⑤ — super-admin con empresaId=null es fail-closed', () => {
  beforeAll(async () => {
    // Sembrar A y B para que SÍ haya datos: lo relevante es que el super-admin sin
    // bypass vea 0 a pesar de existir filas (no es "0 porque está vacío").
    await sembrarDosEmpresas();
  });
  afterAll(async () => {
    await cerrarSemilla();
  });

  it('5.1 servicio: super-admin sin bypass NO ve sedes ni empleados de ningún tenant', async () => {
    // esSuperAdmin=true pero SIN bypassPlataforma → txEmpresa no fija GUC → 0 filas.
    const sedes = await comoEmpresa(null, () => listarSedes({ incluirInactivas: true }), {
      esSuperAdmin: true,
    });
    expect(sedes).toHaveLength(0); // hay sedes de A y B, pero NO se ven (no match-all)

    const empleados = await comoEmpresa(null, () => listarEmpleados({ incluirInactivos: true }), {
      esSuperAdmin: true,
    });
    expect(empleados).toHaveLength(0);
  });

  it('5.3 invariante §4.2: un usuario esSuperAdmin tiene 0 filas en membresia', async () => {
    const u = await semilla().usuario.create({
      data: {
        nombre: 'Plataforma',
        email: `super-${randomUUID()}@gestorpro.local`,
        passwordHash: 'x',
        esSuperAdmin: true,
      },
    });
    expect(await semilla().membresia.count({ where: { usuarioId: u.id } })).toBe(0);
  });
});

describe('Fase 8 ⑤.4 — HTTP: token super-admin (empresaId=null) NO fuga datos de tenant', () => {
  let app: FastifyInstance;
  let f: DosEmpresas;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-super-admin-null';
    f = await sembrarDosEmpresas();
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  it('GET /sedes con token super-admin (rol mínimo, empresaId=null) ⇒ 200 y lista VACÍA', async () => {
    // Token realista de super-admin sin empresa activa: rol mínimo `empleado`,
    // empresaId=null, esSuperAdmin=true. El preHandler NO activa bypassPlataforma
    // (eso es solo de endpoints soloPlataforma, Fase 4c). Debe fallar cerrado.
    // Cuenta REAL: desde I5 el claim esSuperAdmin se verifica contra BD por request
    // (inexistente = revocado → 401, y aquí se prueba el fail-closed de RLS).
    const su = await semilla().usuario.create({
      data: {
        nombre: 'Plataforma',
        email: `san-${randomUUID()}@gestorpro.local`,
        passwordHash: 'x',
        esSuperAdmin: true,
      },
    });
    const token = app.jwt.sign({
      sub: su.id,
      rol: 'empleado',
      empresaId: null,
      esSuperAdmin: true,
    });
    const res = await app.inject({
      method: 'GET',
      url: '/sedes?incluirInactivas=true',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    const sedes = res.json() as Array<{ id: string }>;
    const ids = sedes.map((s) => s.id);
    // Existen sedes de A y B; el super-admin sin bypass NO ve ninguna.
    expect(ids).not.toContain(f.A.sedeId);
    expect(ids).not.toContain(f.B.sedeId);
    expect(sedes).toHaveLength(0);
  });
});
