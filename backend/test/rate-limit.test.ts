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

  // trustProxy: 'uniquelocal' — detrás de Caddy, la clave del rate-limit (request.ip)
  // debe ser el cliente real, no la IP del contenedor de Caddy (que compartiría un
  // único bucket entre TODOS los tenants). Los 3 tests de arriba siguen usando
  // 127.0.0.1 SIN X-Forwarded-For: 'uniquelocal' no cambia su resultado (sin el
  // header no hay nada que resolver, manda la IP directa del socket) — confirman
  // que el fix no rompe el comportamiento existente.
  it('con trustProxy: dos "clientes" detrás del MISMO proxy (X-Forwarded-For distinto) tienen buckets INDEPENDIENTES', async () => {
    const credenciales = { email: 'inexistente@gestorpro.local', password: 'noexiste' };
    // Cliente A agota su límite de 10/min.
    let codigosA: number[] = [];
    for (let i = 0; i < 11; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/auth/login',
        remoteAddress: '172.18.0.4', // socket de Caddy (docker interno, confiable)
        headers: { 'x-forwarded-for': '203.0.113.11' }, // cliente real A
        payload: credenciales,
      });
      codigosA.push(r.statusCode);
    }
    expect(codigosA[10]).toBe(429);

    // Cliente B, mismo socket de Caddy, IP real DISTINTA: bucket propio, no hereda el 429 de A.
    const rB = await app.inject({
      method: 'POST',
      url: '/auth/login',
      remoteAddress: '172.18.0.4',
      headers: { 'x-forwarded-for': '203.0.113.12' }, // cliente real B
      payload: credenciales,
    });
    expect(rB.statusCode).toBe(401); // no 429: su propio bucket sigue con cupo
  });

  it('anti-spoof: un cliente PÚBLICO no puede forjar X-Forwarded-For para escapar de su propio límite', async () => {
    const credenciales = { email: 'inexistente@gestorpro.local', password: 'noexiste' };
    let ultimo = 0;
    for (let i = 0; i < 11; i++) {
      const r = await app.inject({
        method: 'POST',
        url: '/auth/login',
        remoteAddress: '203.0.113.20', // socket público, NO confiable
        headers: { 'x-forwarded-for': `1.2.3.${i}` }, // header distinto cada vez — intento de evasión
        payload: credenciales,
      });
      ultimo = r.statusCode;
    }
    // El header forjado se ignora (socket no confiable): todas las peticiones caen
    // en el bucket real de 203.0.113.20 y la número 11 se corta igual que sin proxy.
    expect(ultimo).toBe(429);
  });
});
