import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';

/**
 * B3 — tres estados de Empresa: gates de negocio fail-closed + backfill de la migración.
 *
 * Aquí viven los cierres TRANSVERSALES (la suite del endpoint PATCH está en
 * empresa-estado.test.ts):
 *  - backfill REAL de la migración (el UPDATE del fichero .sql, no una copia);
 *  - login / cambiar-empresa / restablecer-admin / membresías contra empresas
 *    suspendidas Y canceladas (ambas bloquean el negocio por igual);
 *  - B4 sigue vigente (super-admin fuera de tenants) y B2 sigue operativo sobre activas.
 */
describe('B3 — estados de empresa: gates fail-closed + backfill', () => {
  let app: FastifyInstance;
  const CLAVE = 'ClaveViva1*';

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-b3-estado';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  async function nuevaEmpresa(estado: 'activa' | 'suspendida' | 'cancelada' = 'activa') {
    return semilla().empresa.create({
      data: {
        nombre: `B3 ${randomUUID().slice(0, 8)}`,
        slug: `b3-${randomUUID()}`,
        estado,
        activo: estado === 'activa', // espejo legacy coherente
      },
    });
  }
  async function usuarioCon(empresaId: string, rol: 'administrador' | 'empleado' = 'administrador') {
    const u = await semilla().usuario.create({
      data: {
        nombre: 'U',
        email: `b3-${randomUUID()}@x.local`,
        passwordHash: await hashearContrasena(CLAVE),
      },
    });
    await semilla().membresia.create({
      data: { usuarioId: u.id, empresaId, rol, predeterminada: true },
    });
    return u;
  }
  async function superAdmin() {
    return semilla().usuario.create({
      data: {
        nombre: 'Plataforma',
        email: `b3-super-${randomUUID()}@gestorpro.local`,
        passwordHash: 'x',
        esSuperAdmin: true,
      },
    });
  }
  function tokenSuper(id: string): string {
    return app.jwt.sign({ sub: id, rol: 'empleado', empresaId: null, esSuperAdmin: true });
  }

  // ── Backfill de la migración: el SQL REAL del fichero ────────────────────────

  it('backfill de la migración: activo=true → activa (default), activo=false → suspendida — ejecutando el UPDATE del .sql', async () => {
    // Se simula el estado PRE-backfill: filas legacy cuyo `estado` quedó en el DEFAULT
    // 'activa' que pone el ADD COLUMN, con su boolean `activo` original.
    const legacyActiva = await semilla().empresa.create({
      data: { nombre: 'legacy on', slug: `b3-bf-on-${randomUUID()}`, activo: true, estado: 'activa' },
    });
    const legacyBaja = await semilla().empresa.create({
      data: { nombre: 'legacy off', slug: `b3-bf-off-${randomUUID()}`, activo: false, estado: 'activa' },
    });
    // Y una ya cancelada POST-B3 con activo=false: el backfill re-ejecutado NO debe
    // degradarla a suspendida (garantía de idempotencia del WHERE estado='activa').
    const yaCancelada = await nuevaEmpresa('cancelada');

    // El UPDATE REAL del fichero de la migración (no una copia que pueda divergir).
    const rutaMigracion = join(
      dirname(fileURLToPath(import.meta.url)),
      '../../prisma/migrations/20260705120000_empresa_estado_tres_estados/migration.sql',
    );
    const sql = readFileSync(rutaMigracion, 'utf8');
    const updates = sql
      .split('\n')
      .filter((l) => l.trimStart().startsWith('UPDATE '));
    expect(updates).toHaveLength(1); // exactamente el backfill
    await semilla().$executeRawUnsafe(updates[0]!);

    expect((await semilla().empresa.findUniqueOrThrow({ where: { id: legacyActiva.id } })).estado).toBe('activa');
    expect((await semilla().empresa.findUniqueOrThrow({ where: { id: legacyBaja.id } })).estado).toBe('suspendida');
    expect((await semilla().empresa.findUniqueOrThrow({ where: { id: yaCancelada.id } })).estado).toBe('cancelada');
  });

  // ── Gates de negocio: suspendida y cancelada bloquean por igual ─────────────

  it('login: activa entra; suspendida 401; cancelada 401 (única empresa → sin contexto)', async () => {
    for (const [estado, esperado] of [
      ['activa', 200],
      ['suspendida', 401],
      ['cancelada', 401],
    ] as const) {
      const empresa = await nuevaEmpresa(estado);
      const u = await usuarioCon(empresa.id);
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: u.email, password: CLAVE },
      });
      expect(res.statusCode, `login con empresa ${estado}`).toBe(esperado);
    }
  });

  it('cambiar-empresa (usuario normal con membresía): destino activa 200; suspendida 403; cancelada 403', async () => {
    const casa = await nuevaEmpresa('activa');
    const activa = await nuevaEmpresa('activa');
    const suspendida = await nuevaEmpresa('suspendida');
    const cancelada = await nuevaEmpresa('cancelada');
    const u = await usuarioCon(casa.id);
    for (const destino of [activa, suspendida, cancelada]) {
      await semilla().membresia.create({
        data: { usuarioId: u.id, empresaId: destino.id, rol: 'empleado' },
      });
    }
    const tk = app.jwt.sign({ sub: u.id, rol: 'administrador', empresaId: casa.id, esSuperAdmin: false });
    const cambiar = (empresaId: string) =>
      app.inject({
        method: 'POST',
        url: '/auth/cambiar-empresa',
        headers: { authorization: `Bearer ${tk}` },
        payload: { empresaId },
      });

    expect((await cambiar(activa.id)).statusCode).toBe(200);
    // Con membresía pero empresa NO activa: mismo 403 genérico (anti-enumeración).
    expect((await cambiar(suspendida.id)).statusCode).toBe(403);
    expect((await cambiar(cancelada.id)).statusCode).toBe(403);
  });

  it('B2 restablecer-admin: activa 200; suspendida 409; cancelada 409 (sin tocar hash ni sesiones)', async () => {
    const su = await superAdmin();
    for (const [estado, esperado] of [
      ['activa', 200],
      ['suspendida', 409],
      ['cancelada', 409],
    ] as const) {
      const empresa = await nuevaEmpresa(estado);
      const admin = await usuarioCon(empresa.id, 'administrador');
      const hashAntes = (await semilla().usuario.findUniqueOrThrow({ where: { id: admin.id } })).passwordHash;

      const res = await app.inject({
        method: 'POST',
        url: `/empresas/${empresa.id}/restablecer-admin`,
        headers: { authorization: `Bearer ${tokenSuper(su.id)}` },
      });
      expect(res.statusCode, `restablecer-admin con empresa ${estado}`).toBe(esperado);
      if (esperado !== 200) {
        // El 409 no tuvo efectos: hash intacto y sin asiento de reset.
        expect((await semilla().usuario.findUniqueOrThrow({ where: { id: admin.id } })).passwordHash).toBe(hashAntes);
        expect(
          await semilla().auditoriaPlataforma.count({
            where: { empresaAfectadaId: empresa.id, accion: 'resetear_password_admin' },
          }),
        ).toBe(0);
      }
    }
  });

  it('membresías de plataforma: sobre suspendida 409 y sobre cancelada 409 (sin membresía creada)', async () => {
    const su = await superAdmin();
    const objetivoCasa = await nuevaEmpresa('activa');
    const objetivo = await usuarioCon(objetivoCasa.id, 'empleado');
    for (const estado of ['suspendida', 'cancelada'] as const) {
      const empresa = await nuevaEmpresa(estado);
      const res = await app.inject({
        method: 'POST',
        url: `/empresas/${empresa.id}/membresias`,
        headers: { authorization: `Bearer ${tokenSuper(su.id)}` },
        payload: { email: objetivo.email, rol: 'empleado' },
      });
      expect(res.statusCode, `membresía sobre ${estado}`).toBe(409);
      expect(
        await semilla().membresia.count({ where: { usuarioId: objetivo.id, empresaId: empresa.id } }),
      ).toBe(0);
    }
  });

  it('B4 sigue vigente: el super-admin NO entra ni a una empresa activa (403) y su login da empresaId=null', async () => {
    const su = await semilla().usuario.create({
      data: {
        nombre: 'Plataforma',
        email: `b3-b4-${randomUUID()}@gestorpro.local`,
        passwordHash: await hashearContrasena(CLAVE),
        esSuperAdmin: true,
      },
    });
    const empresa = await nuevaEmpresa('activa');
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: su.email, password: CLAVE },
    });
    expect(login.statusCode).toBe(200);
    const { accessToken, usuario } = login.json() as {
      accessToken: string;
      usuario: { empresaId: string | null };
    };
    expect(usuario.empresaId).toBeNull();
    const entrar = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-empresa',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { empresaId: empresa.id },
    });
    expect(entrar.statusCode).toBe(403);
  });

  it('I5 por request: suspender Y cancelar matan el access token vivo del tenant (401 inmediato)', async () => {
    for (const estado of ['suspendida', 'cancelada'] as const) {
      const empresa = await nuevaEmpresa('activa');
      const u = await usuarioCon(empresa.id);
      const tk = app.jwt.sign({ sub: u.id, rol: 'administrador', empresaId: empresa.id, esSuperAdmin: false });
      // Vivo mientras está activa.
      expect(
        (await app.inject({ method: 'GET', url: '/usuarios', headers: { authorization: `Bearer ${tk}` } })).statusCode,
      ).toBe(200);
      await semilla().empresa.update({
        where: { id: empresa.id },
        data: { estado, activo: false },
      });
      // El MISMO token muere en la request siguiente, sin esperar TTL.
      expect(
        (await app.inject({ method: 'GET', url: '/usuarios', headers: { authorization: `Bearer ${tk}` } })).statusCode,
        `token vivo con empresa ${estado}`,
      ).toBe(401);
    }
  });
});
