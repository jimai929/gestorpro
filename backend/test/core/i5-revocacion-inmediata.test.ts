import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';

/**
 * I5 — revocación INMEDIATA en `autenticar` (decisión #5 de ARQUITECTURA_MULTITENANT):
 * un access token VIVO deja de valer en la misma request cuando (a) su empresa activa
 * fue dada de baja, o (b) su claim esSuperAdmin ya no es cierto en BD (revocado o
 * cuenta desactivada). Antes, el residuo del token (≤15 min) seguía operando.
 * Alcance HONESTO: el `activo` de un usuario NORMAL no se chequea por request (su
 * baja ya expulsa las sesiones; el residuo ≤15 min es el tradeoff documentado).
 */
describe('I5 — revocación inmediata del access token vivo', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-i5';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  async function nuevaEmpresa(activo = true) {
    return semilla().empresa.create({
      data: { nombre: `I5 ${randomUUID().slice(0, 8)}`, slug: `i5-${randomUUID()}`, activo },
    });
  }
  async function nuevoUsuario(opts: { esSuperAdmin?: boolean; activo?: boolean } = {}) {
    return semilla().usuario.create({
      data: {
        nombre: 'U',
        email: `i5-${randomUUID()}@x.local`,
        passwordHash: 'x',
        esSuperAdmin: opts.esSuperAdmin ?? false,
        activo: opts.activo ?? true,
      },
    });
  }

  it('empresa dada de baja: el MISMO access token pasa de 200 a 401 en la request siguiente', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    await semilla().membresia.create({
      data: { usuarioId: admin.id, empresaId: empresa.id, rol: 'administrador', predeterminada: true },
    });
    const tk = app.jwt.sign({ sub: admin.id, rol: 'administrador', empresaId: empresa.id, esSuperAdmin: false });

    // Con la empresa activa, el token opera con normalidad (lectura Y escritura).
    const antes = await app.inject({
      method: 'GET',
      url: '/usuarios',
      headers: { authorization: `Bearer ${tk}` },
    });
    expect(antes.statusCode).toBe(200);

    // Baja del tenant (directa en BD: lo que I5 debe detectar es el ESTADO, venga de
    // donde venga — el endpoint de plataforma ya tiene su propia suite).
    await semilla().empresa.update({ where: { id: empresa.id }, data: { activo: false } });

    // El MISMO token, sin esperar TTL ni refresh: 401 en lectura y en escritura.
    const lectura = await app.inject({
      method: 'GET',
      url: '/usuarios',
      headers: { authorization: `Bearer ${tk}` },
    });
    expect(lectura.statusCode).toBe(401);
    const escritura = await app.inject({
      method: 'POST',
      url: '/usuarios',
      headers: { authorization: `Bearer ${tk}` },
      payload: { nombre: 'X', email: `i5-${randomUUID()}@x.local`, password: 'Clave123*', rol: 'empleado' },
    });
    expect(escritura.statusCode).toBe(401);

    // Reactivada, el mismo token vuelve a operar (la revocación es del CONTEXTO, no
    // del token: no hay lista negra que purgar).
    await semilla().empresa.update({ where: { id: empresa.id }, data: { activo: true } });
    const despues = await app.inject({
      method: 'GET',
      url: '/usuarios',
      headers: { authorization: `Bearer ${tk}` },
    });
    expect(despues.statusCode).toBe(200);
  });

  it('super-admin revocado en BD: su token vivo (empresaId=null) pasa a 401 en la siguiente request', async () => {
    const superAdmin = await nuevoUsuario({ esSuperAdmin: true });
    // Tras B4 el super-admin SIEMPRE tiene empresaId=null; un token con empresaId≠null ya
    // lo rechaza B4 con 403 (ver cambiar-empresa.test). Aquí se pinea el corte I5 del token
    // de plataforma cuando se le revoca el flag esSuperAdmin en BD.
    const tkPlataforma = app.jwt.sign({ sub: superAdmin.id, rol: 'empleado', empresaId: null, esSuperAdmin: true });

    expect(
      (await app.inject({ method: 'GET', url: '/empresas', headers: { authorization: `Bearer ${tkPlataforma}` } })).statusCode,
    ).toBe(200);

    // Revocación (mantenimiento: no hay endpoint; se hace en BD).
    await semilla().usuario.update({ where: { id: superAdmin.id }, data: { esSuperAdmin: false } });

    // El token vivo muere en la siguiente request: nada de ≤15 min de poder residual.
    expect(
      (await app.inject({ method: 'GET', url: '/empresas', headers: { authorization: `Bearer ${tkPlataforma}` } })).statusCode,
    ).toBe(401);
  });

  it('super-admin con la CUENTA desactivada: mismo 401 inmediato', async () => {
    const superAdmin = await nuevoUsuario({ esSuperAdmin: true });
    const tk = app.jwt.sign({ sub: superAdmin.id, rol: 'empleado', empresaId: null, esSuperAdmin: true });
    expect(
      (await app.inject({ method: 'GET', url: '/empresas', headers: { authorization: `Bearer ${tk}` } })).statusCode,
    ).toBe(200);
    await semilla().usuario.update({ where: { id: superAdmin.id }, data: { activo: false } });
    expect(
      (await app.inject({ method: 'GET', url: '/empresas', headers: { authorization: `Bearer ${tk}` } })).statusCode,
    ).toBe(401);
  });

  it('alcance honesto: el token residual de un usuario NORMAL desactivado NO se corta por request (I5 no lo cubre)', async () => {
    // La baja de usuario ya expulsa sus sesiones (refresh muerto) y el residuo ≤15 min
    // es el tradeoff DOCUMENTADO (DECISIONES). Este test PINEA el alcance para que un
    // cambio accidental (chequear usuario.activo en cada request para todos) no pase
    // desapercibido: eso costaría una consulta extra por request de TODA la app y debe
    // decidirse a propósito, no colarse.
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    await semilla().membresia.create({
      data: { usuarioId: admin.id, empresaId: empresa.id, rol: 'administrador', predeterminada: true },
    });
    const tk = app.jwt.sign({ sub: admin.id, rol: 'administrador', empresaId: empresa.id, esSuperAdmin: false });

    await semilla().usuario.update({ where: { id: admin.id }, data: { activo: false } });
    const res = await app.inject({
      method: 'GET',
      url: '/usuarios',
      headers: { authorization: `Bearer ${tk}` },
    });
    expect(res.statusCode).toBe(200); // residuo ≤15 min aceptado; el refresh/login ya lo rechazan
  });
});
