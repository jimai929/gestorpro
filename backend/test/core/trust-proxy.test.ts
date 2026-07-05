import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';

/**
 * trustProxy: 'uniquelocal' (backend/src/app.ts). Detrás de Caddy (docker
 * interno, único proceso que alcanza el puerto 3000 — ver docs/DESPLIEGUE.md),
 * `request.ip` debe resolver la IP REAL del cliente desde `X-Forwarded-For`
 * SOLO cuando quien conecta es un socket de rango privado; un socket público
 * NUNCA debe poder forjar el header para hacerse pasar por otra IP.
 *
 * Ruta de solo-test: expone `request.ip` para inspeccionarlo directamente, sin
 * depender de negocio ni de BD (no se registra en la app de producción).
 */
describe('trustProxy — resolución de request.ip detrás de proxy', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-trust-proxy';
    app = construirApp();
    app.get('/__test-ip', async (request) => ({ ip: request.ip, ips: request.ips }));
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it('socket en rango privado (uniquelocal) + X-Forwarded-For: resuelve la IP real del cliente', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/__test-ip',
      // 172.18.x.x cae en 172.16.0.0/12 (docker interno, donde vive Caddy).
      remoteAddress: '172.18.0.4',
      headers: { 'x-forwarded-for': '203.0.113.7' },
    });
    expect(r.json().ip).toBe('203.0.113.7');
  });

  it('"uniquelocal" NO incluye loopback (127.0.0.1): a diferencia del rango docker, aquí el header se ignora', async () => {
    // Alcance real de 'uniquelocal' en proxy-addr: solo 10.0.0.0/8, 172.16.0.0/12,
    // 192.168.0.0/16 (RFC 1918) — deliberadamente NO 127.0.0.0/8 ni link-local. Caddy
    // en producción nunca conecta por loopback (siempre por su IP de la red docker),
    // así que esto no afecta el caso real; se fija aquí para no asumir de más.
    const r = await app.inject({
      method: 'GET',
      url: '/__test-ip',
      remoteAddress: '127.0.0.1',
      headers: { 'x-forwarded-for': '198.51.100.9' },
    });
    expect(r.json().ip).toBe('127.0.0.1');
  });

  it('anti-spoof: socket PÚBLICO (no confiable) + X-Forwarded-For forjado → se ignora el header, manda la IP real del socket', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/__test-ip',
      remoteAddress: '203.0.113.5', // IP pública: fuera de cualquier rango privado
      headers: { 'x-forwarded-for': '9.9.9.9' }, // intento de suplantación
    });
    // Sin trustProxy (o con 'true' a secas) esto habría devuelto '9.9.9.9' forjada.
    expect(r.json().ip).toBe('203.0.113.5');
  });

  it('sin X-Forwarded-For: el comportamiento no se rompe (usa la IP directa del socket, confiable o no)', async () => {
    const privado = await app.inject({ method: 'GET', url: '/__test-ip', remoteAddress: '10.20.0.1' });
    expect(privado.json().ip).toBe('10.20.0.1');

    const publico = await app.inject({ method: 'GET', url: '/__test-ip', remoteAddress: '203.0.113.5' });
    expect(publico.json().ip).toBe('203.0.113.5');
  });
});
