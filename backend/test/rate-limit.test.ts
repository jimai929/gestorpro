import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../src/app.js';

/**
 * Rate limiting de las superficies sensibles (test HTTP vía inject). El límite
 * se cuenta por IP y por ruta; inject usa siempre 127.0.0.1, así que las
 * peticiones se acumulan en el mismo bucket.
 */
describe('rate limiting — superficies sensibles', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET ?? 'test-secret-rate-limit';
    app = construirApp();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/login devuelve 429 al superar el límite (max 10/min)', async () => {
    const credenciales = { email: 'inexistente@gestorpro.local', password: 'noexiste' };
    let codigos: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await app.inject({ method: 'POST', url: '/auth/login', payload: credenciales });
      codigos.push(r.statusCode);
    }
    // Los primeros 10 pasan el rate limit (y dan 401 por credenciales); el 11.º se corta.
    expect(codigos.slice(0, 10).every((c) => c === 401)).toBe(true);
    expect(codigos[10]).toBe(429);
  });

  it('POST /fichajes devuelve 429 al superar el límite (max 30/min)', async () => {
    const body = { kioscoId: 'inexistente', tipo: 'entrada', numero: 'E000', fotoCaptura: 'sim:match' };
    let ultimo = 0;
    for (let i = 0; i < 31; i++) {
      const r = await app.inject({ method: 'POST', url: '/fichajes', payload: body });
      ultimo = r.statusCode;
    }
    expect(ultimo).toBe(429); // el 31.º intento se corta
  });

  it('una ruta sin rateLimit declarado (/health) no se limita: global:false no afecta al resto', async () => {
    const codigos: number[] = [];
    for (let i = 0; i < 20; i++) {
      const r = await app.inject({ method: 'GET', url: '/health' });
      codigos.push(r.statusCode);
    }
    expect(codigos.every((c) => c === 200)).toBe(true);
  });
});
