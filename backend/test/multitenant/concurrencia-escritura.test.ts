import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla, crearEmpresa } from '../helpers/db.js';

/**
 * ⑧.1 Aislamiento bajo CONCURRENCIA de ESCRITURA (Fase 8, lote 2). Complementa
 * `concurrencia-als.test.ts`, que solo probó lectura concurrente. El preHandler fija
 * el tenant en la ALS con `enterWith`; si dos escrituras concurrentes de A y B
 * compartieran el contexto async, una sede podría nacer en el tenant equivocado.
 * Se disparan muchas creaciones concurrentes ALTERNANDO tokens A/B con el MISMO
 * nombre (sede.nombre NO es único) y se exige que CADA fila caiga en SU tenant.
 */
describe('Fase 8 ⑧.1 — escrituras concurrentes A/B caen cada una en su tenant', () => {
  let app: FastifyInstance;
  let empresaA: string;
  let empresaB: string;
  let tokenA: string;
  let tokenB: string;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-concurrencia-escritura';
    empresaA = await crearEmpresa('A concurrencia-escritura');
    empresaB = await crearEmpresa('B concurrencia-escritura');
    app = construirApp();
    await app.ready();
    tokenA = app.jwt.sign({ sub: randomUUID(), rol: 'administrador', empresaId: empresaA, esSuperAdmin: false });
    tokenB = app.jwt.sign({ sub: randomUUID(), rol: 'administrador', empresaId: empresaB, esSuperAdmin: false });
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  it('N creaciones concurrentes por tenant, MISMO nombre ⇒ ninguna cruza de empresa', async () => {
    const N = 10; // 2N=20 POST concurrentes e intercalados A/B: si el contexto de la
    // ALS (`enterWith`) se cruzara entre requests concurrentes, una sede nacería en el
    // tenant ajeno. Es justo el cruce de contexto async que este test estresa.
    const nombre = `DUP-${randomUUID().slice(0, 8)}`;

    const peticiones = Array.from({ length: 2 * N }, (_, i) => {
      const esA = i % 2 === 0;
      return app
        .inject({
          method: 'POST',
          url: '/sedes',
          headers: { authorization: `Bearer ${esA ? tokenA : tokenB}` },
          payload: { nombre },
        })
        .then((res) => ({ esA, res }));
    });
    const resultados = await Promise.all(peticiones);

    // Todas crean (201) y devuelven la sede con su empresaId del token (no del body).
    for (const { esA, res } of resultados) {
      expect(res.statusCode).toBe(201);
      const sede = res.json() as { id: string; empresaId: string };
      expect(sede.empresaId).toBe(esA ? empresaA : empresaB);
    }

    // God-view (BYPASSRLS): exactamente N sedes con ese nombre en CADA empresa, y
    // ninguna en la empresa ajena.
    const enA = await semilla().sede.count({ where: { nombre, empresaId: empresaA } });
    const enB = await semilla().sede.count({ where: { nombre, empresaId: empresaB } });
    expect(enA).toBe(N);
    expect(enB).toBe(N);
    // Total global con ese nombre = 2N: no se creó ninguna fuera de A/B.
    expect(await semilla().sede.count({ where: { nombre } })).toBe(2 * N);
  });
});
