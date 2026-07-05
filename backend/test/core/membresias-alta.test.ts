import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';

/**
 * Plataforma — POST /empresas/:empresaId/membresias (alta de membresía multi-empresa
 * sobre un usuario EXISTENTE, identificado por email). Solo super-admin
 * (`soloPlataforma` → 404 al resto, guards en onRequest: cortan ANTES que ajv).
 * `predeterminada` SIEMPRE false; cuenta de plataforma jamás recibe membresía
 * (invariante §4.2); cuenta o empresa desactivada → 409 (reactivar primero);
 * duplicada → 409 vía P2002. El TOCTOU con la baja de usuarios queda cerrado por
 * el lock FOR UPDATE compartido (test de carrera al final, probabilístico).
 */
describe('Plataforma — POST /empresas/:id/membresias (alta multi-empresa)', () => {
  let app: FastifyInstance;
  let superAdminId: string;
  const CLAVE = 'ClaveViva1*';

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-membresias-alta';
    const su = await semilla().usuario.create({
      data: {
        nombre: 'Plataforma',
        email: `super-ma-${randomUUID()}@gestorpro.local`,
        passwordHash: 'x',
        esSuperAdmin: true,
      },
    });
    superAdminId = su.id;
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  function tokenSuper(): string {
    return app.jwt.sign({ sub: superAdminId, rol: 'empleado', empresaId: null, esSuperAdmin: true });
  }
  async function nuevaEmpresa(activo = true) {
    return semilla().empresa.create({
      // B3: los reads van por `estado`; el boolean del helper se mapea (espejo coherente).
      data: {
        nombre: `MA ${randomUUID().slice(0, 8)}`,
        slug: `ma-${randomUUID()}`,
        activo,
        estado: activo ? 'activa' : 'suspendida',
      },
    });
  }
  async function nuevoUsuario(opts: { esSuperAdmin?: boolean; conClave?: boolean; activo?: boolean } = {}) {
    return semilla().usuario.create({
      data: {
        nombre: 'U',
        email: `ma-${randomUUID()}@x.local`,
        passwordHash: opts.conClave ? await hashearContrasena(CLAVE) : 'x',
        esSuperAdmin: opts.esSuperAdmin ?? false,
        activo: opts.activo ?? true,
      },
    });
  }
  async function conMembresia(usuarioId: string, empresaId: string, rol = 'empleado') {
    return semilla().membresia.create({
      data: { usuarioId, empresaId, rol: rol as 'empleado', predeterminada: true },
    });
  }
  function altaMembresia(token: string, empresaId: string, payload: Record<string, unknown>) {
    return app.inject({
      method: 'POST',
      url: `/empresas/${empresaId}/membresias`,
      headers: { authorization: `Bearer ${token}` },
      payload,
    });
  }

  it('201: membresía NO predeterminada con rol per-tenant, asiento crear_membresia, y el selector/cambiar-empresa la ven', async () => {
    const origen = await nuevaEmpresa();
    const destino = await nuevaEmpresa();
    const usuario = await nuevoUsuario({ conClave: true });
    await conMembresia(usuario.id, origen.id, 'empleado');

    const res = await altaMembresia(tokenSuper(), destino.id, {
      email: usuario.email,
      rol: 'administrador',
    });
    expect(res.statusCode).toBe(201);
    const creada = res.json() as { id: string; usuarioId: string; empresaId: string; rol: string };
    expect(creada.usuarioId).toBe(usuario.id);
    expect(creada.empresaId).toBe(destino.id);
    expect(creada.rol).toBe('administrador');

    // BD: la nueva NO es predeterminada; la original queda intacta.
    const membresias = await semilla().membresia.findMany({ where: { usuarioId: usuario.id } });
    expect(membresias).toHaveLength(2);
    const nueva = membresias.find((m) => m.empresaId === destino.id);
    const original = membresias.find((m) => m.empresaId === origen.id);
    expect(nueva?.predeterminada).toBe(false);
    expect(nueva?.rol).toBe('administrador');
    expect(original?.predeterminada).toBe(true);
    expect(original?.rol).toBe('empleado');

    // Auditoría de PLATAFORMA (NO la de tenant): asiento del super-admin REAL con
    // empresaAfectadaId = la empresa destino; el id de la membresía va en el detalle.
    const asientos = await semilla().auditoriaPlataforma.findMany({
      where: { empresaAfectadaId: destino.id, accion: 'crear_membresia' },
    });
    expect(asientos).toHaveLength(1);
    expect(asientos[0]?.actorUsuarioId).toBe(superAdminId);
    expect(asientos[0]?.empresaAfectadaId).toBe(destino.id);
    expect((asientos[0]?.detalle as { membresiaId: string }).membresiaId).toBe(creada.id);
    // La operación de plataforma NO contamina la bitácora de tenant.
    expect(await semilla().auditoria.count({ where: { entidadId: creada.id } })).toBe(0);

    // Extremo a extremo: el login lista AMBAS membresías (selector) — la
    // predeterminada primero — y cambiar-empresa a la nueva funciona con el
    // rol de ESA membresía.
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: usuario.email, password: CLAVE },
    });
    expect(login.statusCode).toBe(200);
    const { accessToken, usuario: publico } = login.json() as {
      accessToken: string;
      usuario: { empresaId: string; membresias: Array<{ empresaId: string; rol: string }> };
    };
    expect(publico.empresaId).toBe(origen.id); // la predeterminada no cambió
    expect(publico.membresias.map((m) => m.empresaId)).toEqual([origen.id, destino.id]);
    const cambio = await app.inject({
      method: 'POST',
      url: '/auth/cambiar-empresa',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: { empresaId: destino.id },
    });
    expect(cambio.statusCode).toBe(200);
    expect((cambio.json() as { usuario: { rol: string } }).usuario.rol).toBe('administrador');
  });

  it('anti-enumeración: admin de tenant y empleado reciben 404, TAMBIÉN con input malformado (guards onRequest antes que ajv)', async () => {
    const empresa = await nuevaEmpresa();
    const admin = await nuevoUsuario();
    await conMembresia(admin.id, empresa.id, 'administrador');
    const tkAdmin = app.jwt.sign({
      sub: admin.id,
      rol: 'administrador',
      empresaId: empresa.id,
      esSuperAdmin: false,
    });

    const bienFormado = await altaMembresia(tkAdmin, empresa.id, {
      email: 'x@y.dev',
      rol: 'empleado',
    });
    expect(bienFormado.statusCode).toBe(404);
    // El 400 de ajv NO debe adelantarse al guard: input malformado → MISMO 404.
    const malformado = await altaMembresia(tkAdmin, empresa.id, { email: 'no-es-email', rol: 'x' });
    expect(malformado.statusCode).toBe(404);
    expect(malformado.body).toBe(bienFormado.body);
    expect(await semilla().membresia.count({ where: { empresaId: empresa.id } })).toBe(1);
  });

  it('validación en la puerta (super): rol fuera de la lista blanca y uuid malformado → 400; email es LOOKUP (sin patrón) → un email no-canónico existente SÍ es alcanzable', async () => {
    const empresa = await nuevaEmpresa();
    const usuario = await nuevoUsuario();
    await conMembresia(usuario.id, empresa.id);
    // Cuenta con email NO-CANÓNICO (sin punto tras la @): el alta de plataforma la
    // permite (minLength:3), así que este endpoint debe poder alcanzarla — el schema
    // NO exige patrón (LOOKUP, no creación). La comparación real es exacta.
    const raro = await semilla().usuario.create({
      data: { nombre: 'U', email: `jefe-${randomUUID().slice(0, 8)}@interno`, passwordHash: 'x' },
    });
    const destinoRaro = await nuevaEmpresa();

    // rol fuera de la lista blanca y uuid malformado siguen cortados en la puerta.
    expect(
      (await altaMembresia(tokenSuper(), empresa.id, { email: usuario.email, rol: 'supervisor' })).statusCode,
    ).toBe(400);
    expect(
      (await altaMembresia(tokenSuper(), 'no-es-uuid', { email: usuario.email, rol: 'empleado' })).statusCode,
    ).toBe(400);
    // Email sin forma canónica pero INEXISTENTE: pasa el schema, cae en el 404 del lookup.
    expect(
      (await altaMembresia(tokenSuper(), empresa.id, { email: 'nadie@interno', rol: 'empleado' })).statusCode,
    ).toBe(404);
    // Email sin punto pero EXISTENTE: alcanzable (201) — la clave del relax de schema.
    const res = await altaMembresia(tokenSuper(), destinoRaro.id, { email: raro.email, rol: 'empleado' });
    expect(res.statusCode).toBe(201);

    expect(await semilla().membresia.count({ where: { usuarioId: usuario.id } })).toBe(1);
    expect(await semilla().membresia.count({ where: { usuarioId: raro.id } })).toBe(1);
  });

  it('empresa inexistente → 404; empresa desactivada → 409; email inexistente → 404 (sin membresía creada)', async () => {
    const inactiva = await nuevaEmpresa(false);
    const activa = await nuevaEmpresa();
    const usuario = await nuevoUsuario();
    await conMembresia(usuario.id, activa.id);

    expect(
      (await altaMembresia(tokenSuper(), randomUUID(), { email: usuario.email, rol: 'empleado' })).statusCode,
    ).toBe(404);
    expect(
      (await altaMembresia(tokenSuper(), inactiva.id, { email: usuario.email, rol: 'empleado' })).statusCode,
    ).toBe(409);
    expect(
      (await altaMembresia(tokenSuper(), activa.id, { email: `nadie-${randomUUID()}@x.local`, rol: 'empleado' })).statusCode,
    ).toBe(404);
    expect(await semilla().membresia.count({ where: { usuarioId: usuario.id } })).toBe(1);
  });

  it('cuenta de plataforma → 400 (invariante §4.2: esSuperAdmin JAMÁS con membresía); cuenta desactivada → 409', async () => {
    const empresa = await nuevaEmpresa();
    const otroSuper = await nuevoUsuario({ esSuperAdmin: true });
    const inactivo = await nuevoUsuario({ activo: false });
    await conMembresia(inactivo.id, empresa.id);
    const destino = await nuevaEmpresa();

    const resSuper = await altaMembresia(tokenSuper(), empresa.id, {
      email: otroSuper.email,
      rol: 'administrador',
    });
    expect(resSuper.statusCode).toBe(400);
    expect(await semilla().membresia.count({ where: { usuarioId: otroSuper.id } })).toBe(0);

    // Desactivada: añadirle membresías fabricaría el estado-trampa "multi inactiva".
    const resInactivo = await altaMembresia(tokenSuper(), destino.id, {
      email: inactivo.email,
      rol: 'empleado',
    });
    expect(resInactivo.statusCode).toBe(409);
    expect(await semilla().membresia.count({ where: { usuarioId: inactivo.id } })).toBe(1);
  });

  it('duplicada → 409 sin segundo asiento (también contra la membresía original)', async () => {
    const origen = await nuevaEmpresa();
    const destino = await nuevaEmpresa();
    const usuario = await nuevoUsuario();
    await conMembresia(usuario.id, origen.id);

    const primera = await altaMembresia(tokenSuper(), destino.id, {
      email: usuario.email,
      rol: 'empleado',
    });
    expect(primera.statusCode).toBe(201);
    const repetida = await altaMembresia(tokenSuper(), destino.id, {
      email: usuario.email,
      rol: 'administrador', // ni siquiera con otro rol: la membresía no se pisa
    });
    expect(repetida.statusCode).toBe(409);
    // Contra su empresa ORIGINAL también es duplicada.
    const contraOrigen = await altaMembresia(tokenSuper(), origen.id, {
      email: usuario.email,
      rol: 'empleado',
    });
    expect(contraOrigen.statusCode).toBe(409);

    const membresias = await semilla().membresia.findMany({ where: { usuarioId: usuario.id } });
    expect(membresias).toHaveLength(2);
    expect(membresias.find((m) => m.empresaId === destino.id)?.rol).toBe('empleado'); // intacta
    expect(
      await semilla().auditoriaPlataforma.count({
        where: { accion: 'crear_membresia', empresaAfectadaId: destino.id },
      }),
    ).toBe(1);
  });

  it('carrera TOCTOU: añadir membresía y baja del usuario concurrentes JAMÁS dejan "inactivo multi-empresa" (lock FOR UPDATE compartido)', async () => {
    // Detección probabilística (misma limitación caja-negra que el test de carrera
    // de sobrepago): cada ronda dispara AMBAS mutaciones a la vez y verifica el
    // invariante; el lock compartido garantiza que una de las dos pierde SIEMPRE.
    const RONDAS = 8;
    for (let i = 0; i < RONDAS; i += 1) {
      const casa = await nuevaEmpresa();
      const destino = await nuevaEmpresa();
      const admin = await nuevoUsuario();
      const objetivo = await nuevoUsuario();
      await conMembresia(admin.id, casa.id, 'administrador');
      await conMembresia(objetivo.id, casa.id, 'empleado');
      const tkAdmin = app.jwt.sign({
        sub: admin.id,
        rol: 'administrador',
        empresaId: casa.id,
        esSuperAdmin: false,
      });

      const [alta, baja] = await Promise.all([
        altaMembresia(tokenSuper(), destino.id, { email: objetivo.email, rol: 'empleado' }),
        app.inject({
          method: 'PATCH',
          url: `/usuarios/${objetivo.id}`,
          headers: { authorization: `Bearer ${tkAdmin}` },
          payload: { activo: false },
        }),
      ]);

      const enBd = await semilla().usuario.findUniqueOrThrow({ where: { id: objetivo.id } });
      const cuenta = await semilla().membresia.count({ where: { usuarioId: objetivo.id } });
      // Estados legales: (a) baja ganó → inactivo con UNA membresía (el alta vio
      // la cuenta desactivada y respondió 409); (b) alta ganó → DOS membresías y
      // sigue activo (la baja re-contó bajo el lock y respondió 409). PROHIBIDO:
      // inactivo Y multi-empresa (lock-out cross-tenant desde un solo tenant).
      expect(!(enBd.activo === false && cuenta > 1)).toBe(true);
      if (enBd.activo === false) {
        expect(cuenta).toBe(1);
        expect(alta.statusCode).toBe(409);
      }
      if (cuenta > 1) {
        expect(enBd.activo).toBe(true);
        expect(baja.statusCode).toBe(409);
      }
    }
  });
});
