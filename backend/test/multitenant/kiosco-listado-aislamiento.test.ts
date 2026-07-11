import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { cerrarSemilla } from '../helpers/db.js';
import { sembrarDosEmpresas, type DosEmpresas } from './_fixture-dos-empresas.js';

/**
 * Aislamiento multi-tenant del LISTADO de kioscos de gestión.
 *
 * Regresión: la pantalla de administración reusaba el catálogo PÚBLICO de
 * dispositivo `GET /kioscos` (que corre con bypass de RLS para el bootstrap del
 * kiosco), de modo que un admin veía los kioscos de TODAS las empresas. El listado
 * de gestión ahora vive en `GET /kioscos/gestion`: autenticado y bajo `txEmpresa`,
 * así que la RLS de `kiosco` (vía sede.empresa_id) lo acota al tenant.
 */
describe('kioscos — aislamiento multi-tenant del listado de gestión', () => {
  let app: FastifyInstance;
  let f: DosEmpresas;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-kiosco-aislamiento';
    app = construirApp();
    await app.ready();
    f = await sembrarDosEmpresas();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  type RolSistema = 'administrador' | 'supervisor' | 'empleado';
  const token = (empresaId: string, rol: RolSistema = 'administrador') =>
    app.jwt.sign({ sub: randomUUID(), rol, empresaId, esSuperAdmin: false });

  const gestion = (empresaId: string) =>
    app.inject({
      method: 'GET',
      url: '/kioscos/gestion',
      headers: { authorization: `Bearer ${token(empresaId)}` },
    });

  const ids = (res: { json: () => unknown }) =>
    (res.json() as Array<{ id: string }>).map((k) => k.id);

  it('gestión de A devuelve SOLO el kiosco de A (no el de B)', async () => {
    const res = await gestion(f.A.empresaId);
    expect(res.statusCode).toBe(200);
    expect(ids(res)).toContain(f.A.kioscoId);
    expect(ids(res)).not.toContain(f.B.kioscoId);
  });

  it('gestión de B devuelve SOLO el kiosco de B (aislamiento bidireccional)', async () => {
    const res = await gestion(f.B.empresaId);
    expect(res.statusCode).toBe(200);
    expect(ids(res)).toContain(f.B.kioscoId);
    expect(ids(res)).not.toContain(f.A.kioscoId);
  });

  it('gestión SIN token → 401 (no es un endpoint público)', async () => {
    const res = await app.inject({ method: 'GET', url: '/kioscos/gestion' });
    expect(res.statusCode).toBe(401);
  });

  it('el listado de gestión NUNCA expone el tokenHash ni el modoExcepcion (defensa en profundidad)', async () => {
    const res = await gestion(f.A.empresaId);
    // En el JSON serializado COMPLETO (incluye el `sede` anidado), no solo el nivel raíz.
    expect(res.payload).not.toContain('tokenHash');
    expect(res.payload).not.toContain('token_hash');
    expect(res.payload).not.toContain('modoExcepcion');
    for (const k of res.json() as Array<Record<string, unknown>>) {
      expect('tokenHash' in k).toBe(false);
      expect('token_hash' in k).toBe(false);
    }
  });

  // ── Escritura cross-tenant (guards + RLS), a nivel HTTP ──────────────────────
  it('POST /kioscos con una sede de OTRA empresa → 400 y no crea kiosco', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/kioscos',
      headers: { authorization: `Bearer ${token(f.A.empresaId)}` },
      payload: { nombre: 'Intruso', sedeId: f.B.sedeId },
    });
    expect(res.statusCode).toBe(400);
    // No apareció en el listado de A.
    expect((await gestion(f.A.empresaId)).payload).not.toContain('Intruso');
  });

  it('POST /kioscos/:id/token sobre un kiosco de OTRA empresa → 404 (no revela existencia)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/kioscos/${f.B.kioscoId}/token`,
      headers: { authorization: `Bearer ${token(f.A.empresaId)}` },
    });
    expect(res.statusCode).toBe(404);
  });

  it('POST /kioscos IGNORA un empresaId inyectado: el kiosco queda en el tenant del token, no en el inyectado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/kioscos',
      headers: { authorization: `Bearer ${token(f.A.empresaId)}` },
      // El ajv del app aplica `removeAdditional`: descarta `empresaId` (no lo rechaza).
      payload: { nombre: 'InjTest', sedeId: f.A.sedeId, empresaId: f.B.empresaId },
    });
    expect(res.statusCode).toBe(201);
    // Quedó en A (por su sede, bajo RLS del token), NO en B: el empresaId inyectado se ignoró.
    expect((await gestion(f.A.empresaId)).payload).toContain('InjTest');
    expect((await gestion(f.B.empresaId)).payload).not.toContain('InjTest');
  });

  // Caracteriza (NO endosa) la exposición conocida del catálogo público de
  // dispositivo: `GET /kioscos` sigue siendo cross-tenant por el bootstrap del
  // kiosco (elige antes de autenticarse). Solo expone nombre/sede, nunca secretos.
  it('el catálogo PÚBLICO /kioscos sigue siendo cross-tenant por diseño de dispositivo', async () => {
    const res = await app.inject({ method: 'GET', url: '/kioscos' });
    expect(res.statusCode).toBe(200);
    const cat = ids(res);
    expect(cat).toContain(f.A.kioscoId);
    expect(cat).toContain(f.B.kioscoId);
    for (const k of res.json() as Array<Record<string, unknown>>) {
      expect('tokenHash' in k).toBe(false); // pero nunca secretos
    }
  });
});
