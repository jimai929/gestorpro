import { describe, it, expect } from 'vitest';
import { construirApp } from '../../src/app.js';
import { semilla, comoEmpresa, crearEmpresa } from '../helpers/db.js';
import {
  crearKiosco,
  regenerarTokenKiosco,
  resolverContextoKiosco,
} from '../../src/asistencia/kiosco/kiosco.service.js';
import { ErrorAutenticacion, ErrorNoEncontrado, ErrorValidacion } from '../../src/core/errors.js';

let n = 0;
async function nuevaSede(empresaId: string) {
  n += 1;
  return semilla().sede.create({ data: { nombre: `SedeKiosco ${n}-${Date.now()}`, empresaId } });
}

describe('kiosco — alta', () => {
  it('crea un kiosco activo y devuelve un token de dispositivo (sin exponer el hash)', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const kiosco = await comoEmpresa(empresaId, () =>
      crearKiosco({ nombre: 'Kiosco Test', sedeId: sede.id }),
    );

    expect(kiosco.nombre).toBe('Kiosco Test');
    expect(kiosco.sedeId).toBe(sede.id);
    expect(kiosco.activo).toBe(true); // default del schema
    expect(typeof kiosco.token).toBe('string');
    expect(kiosco.token.length).toBeGreaterThan(20);
    // El token en claro NO se persiste ni se devuelve como hash.
    expect((kiosco as Record<string, unknown>).tokenHash).toBeUndefined();

    // god-view: verificar el hash persistido (campo interno, no expuesto por el servicio).
    const enBase = await semilla().kiosco.findUnique({ where: { id: kiosco.id } });
    expect(enBase).not.toBeNull();
    expect(enBase?.tokenHash).toBeTruthy();
    expect(enBase?.tokenHash).not.toBe(kiosco.token); // se guarda el hash, no el token
  });

  it('rechaza el alta si la sede no existe (ErrorValidacion) y no crea la fila', async () => {
    const empresaId = await crearEmpresa();
    const sedeInexistente = '00000000-0000-0000-0000-000000000000';
    await expect(
      comoEmpresa(empresaId, () =>
        crearKiosco({ nombre: 'Kiosco Huérfano', sedeId: sedeInexistente }),
      ),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    // El guard corta antes del create: ningún kiosco quedó ligado a esa sede.
    // Ausencia → semilla god-view (nada se creó en ningún lado).
    expect(await semilla().kiosco.findMany({ where: { sedeId: sedeInexistente } })).toHaveLength(0);
  });
});

describe('kiosco — token de dispositivo', () => {
  it('verifica el token correcto y rechaza uno inválido o ausente', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const { id, token } = await comoEmpresa(empresaId, () => crearKiosco({ nombre: 'K', sedeId: sede.id }));

    // resolverContextoKiosco verifica el token vía bootstrap de dispositivo (bypass
    // acotado de UNA lectura) y DEVUELVE la empresa del kiosco; el fichaje corre
    // luego bajo RLS normal con ese empresaId. Token incorrecto/ausente → 401.
    await expect(resolverContextoKiosco(id, token)).resolves.toEqual({ empresaId });
    await expect(resolverContextoKiosco(id, 'token-incorrecto')).rejects.toBeInstanceOf(ErrorAutenticacion);
    await expect(resolverContextoKiosco(id, undefined)).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('regenerar invalida el token anterior y acepta el nuevo', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const { id, token: viejo } = await comoEmpresa(empresaId, () => crearKiosco({ nombre: 'K', sedeId: sede.id }));

    const { token: nuevo } = await comoEmpresa(empresaId, () => regenerarTokenKiosco(id));
    expect(nuevo).not.toBe(viejo);
    await expect(resolverContextoKiosco(id, viejo)).rejects.toBeInstanceOf(ErrorAutenticacion);
    await expect(resolverContextoKiosco(id, nuevo)).resolves.toEqual({ empresaId });
  });

  it('rechaza el token de un kiosco inactivo', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const { id, token } = await comoEmpresa(empresaId, () => crearKiosco({ nombre: 'K', sedeId: sede.id }));
    await semilla().kiosco.update({ where: { id }, data: { activo: false } });
    await expect(resolverContextoKiosco(id, token)).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('rechaza el token de un kiosco cuya EMPRESA está dada de baja (I5: el device token no tiene TTL)', async () => {
    // Sin este guard, un tenant dado de baja seguiría ACEPTANDO fichajes para
    // siempre: el token de dispositivo no expira y no pasa por `autenticar`.
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const { id, token } = await comoEmpresa(empresaId, () => crearKiosco({ nombre: 'K', sedeId: sede.id }));

    // B3: la revocación va por `estado` (espejo `activo` coherente).
    await semilla().empresa.update({
      where: { id: empresaId },
      data: { estado: 'suspendida', activo: false },
    });
    await expect(resolverContextoKiosco(id, token)).rejects.toBeInstanceOf(ErrorAutenticacion);

    // Reactivada, el MISMO token de dispositivo vuelve a operar (nada que reconfigurar).
    await semilla().empresa.update({
      where: { id: empresaId },
      data: { estado: 'activa', activo: true },
    });
    await expect(resolverContextoKiosco(id, token)).resolves.toEqual({ empresaId });
  });

  it('regenerar un kiosco inexistente lanza ErrorNoEncontrado', async () => {
    const empresaId = await crearEmpresa();
    await expect(
      comoEmpresa(empresaId, () => regenerarTokenKiosco('00000000-0000-0000-0000-000000000000')),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
  });
});

describe('kiosco — listado público GET /kioscos (L5: no filtrar modoExcepcion)', () => {
  it('la respuesta pública NO incluye sede.modoExcepcion (divulgación de info)', async () => {
    // El endpoint es público (sin sesión); su payload no debe revelar el modo de
    // excepción de cada sede. construirApp registra el authPlugin, que exige un
    // secreto JWT aunque esta ruta no lo use: se fija uno de prueba.
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-kioscos';
    const empresaId = await crearEmpresa();
    n += 1;
    // Fixtures vía semilla (god-view); tablas directas necesitan empresaId explícito.
    const sede = await semilla().sede.create({
      data: { nombre: `SedePub ${n}-${Date.now()}`, modoExcepcion: 'ambos', empresaId },
    });
    const kiosco = await semilla().kiosco.create({ data: { nombre: `KPub ${n}`, sedeId: sede.id } });

    // Ruta pública: el bootstrap de dispositivo (txBootstrapDispositivo) resuelve el
    // listado sin contexto de tenant; no se usa comoEmpresa (no hay token de usuario).
    const app = construirApp();
    try {
      const res = await app.inject({ method: 'GET', url: '/kioscos' });
      expect(res.statusCode).toBe(200);
      const lista = res.json() as Array<{
        id: string;
        nombre: string;
        sede: Record<string, unknown>;
      }>;
      const propio = lista.find((k) => k.id === kiosco.id);
      expect(propio, 'el kiosco activo debe aparecer en el listado').toBeDefined();
      // Sí expone el nombre de la sede (lo necesita el selector del kiosco)…
      expect(propio!.sede.nombre).toBe(sede.nombre);
      // …pero NUNCA el modo de excepción.
      expect(propio!.sede).not.toHaveProperty('modoExcepcion');
    } finally {
      await app.close();
    }
  });
});
