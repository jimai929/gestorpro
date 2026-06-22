import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla, crearEmpresa } from '../helpers/db.js';

/**
 * Aislamiento del contexto de tenant bajo CONCURRENCIA (Fase 5 Seg 2, IMPORTANTE #2).
 *
 * El preHandler `autenticar` fija el contexto de tenant en la AsyncLocalStorage con
 * `enterWith` (no `run`). `enterWith` es potente pero frágil: si dos requests
 * concurrentes compartieran el contexto async, el `empresaId` de una podría filtrarse
 * a la otra → fuga cross-tenant. Este test lo descarta end-to-end: dispara muchas
 * peticiones concurrentes ALTERNANDO tokens de empresa A y B contra GET /sedes
 * (lectura tenant-scoped bajo RLS) y exige que CADA respuesta vea SOLO los datos de
 * SU token, nunca los del otro. Es la prueba real del riesgo de `enterWith`.
 */
describe('RLS — aislamiento de contexto ALS bajo concurrencia (enterWith)', () => {
  let app: FastifyInstance;
  let sedeA: string;
  let sedeB: string;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-concurrencia';

    const empresaA = await crearEmpresa('Empresa A concurrencia');
    const empresaB = await crearEmpresa('Empresa B concurrencia');
    sedeA = (await semilla().sede.create({ data: { nombre: 'SOLO-A', empresaId: empresaA } })).id;
    sedeB = (await semilla().sede.create({ data: { nombre: 'SOLO-B', empresaId: empresaB } })).id;

    app = construirApp();
    await app.ready();
    // Tokens firmados directos (GET /sedes solo exige autenticar, sin ir a BD por el
    // usuario): el empresaId del token es el contexto de tenant.
    tokenA = app.jwt.sign({ sub: randomUUID(), rol: 'administrador', empresaId: empresaA, esSuperAdmin: false });
    tokenB = app.jwt.sign({ sub: randomUUID(), rol: 'administrador', empresaId: empresaB, esSuperAdmin: false });
  });

  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  it('40 requests concurrentes alternando A/B: cada una ve SOLO su empresa', async () => {
    const N = 40;
    const peticiones = Array.from({ length: N }, (_, i) => {
      const esA = i % 2 === 0;
      return app
        .inject({
          method: 'GET',
          url: '/sedes',
          headers: { authorization: `Bearer ${esA ? tokenA : tokenB}` },
        })
        .then((res) => ({ esA, res }));
    });

    const resultados = await Promise.all(peticiones);

    for (const { esA, res } of resultados) {
      expect(res.statusCode).toBe(200);
      const sedes = res.json() as Array<{ id: string }>;
      const ids = sedes.map((s) => s.id);
      if (esA) {
        // Token A: ve SOLO la sede de A, NUNCA la de B (sin fuga por enterWith).
        expect(ids).toContain(sedeA);
        expect(ids).not.toContain(sedeB);
      } else {
        expect(ids).toContain(sedeB);
        expect(ids).not.toContain(sedeA);
      }
    }
  });
});
