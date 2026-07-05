import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../src/core/prisma.js';
import { crearServicioAuth } from '../../src/core/auth/auth.service.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';
import { ErrorAutenticacion, ErrorAutorizacion } from '../../src/core/errors.js';
import { semilla, cerrarSemilla } from '../helpers/db.js';

afterAll(async () => {
  await cerrarSemilla();
});

/**
 * Resolución de la empresa activa en el login (multi-tenant, Fase 4a). El
 * `empresaId` y el rol del token salen SIEMPRE del servidor (membresías), nunca
 * del cliente. Firmador FALSO: devuelve el payload como JSON para inspeccionarlo
 * sin decodificar un JWT real.
 */
const servicio = crearServicioAuth((p) => JSON.stringify(p));
const CLAVE = 'Clave123*';

let n = 0;
async function nuevaEmpresa(slug = `e${++n}-${Date.now()}`) {
  return prisma.empresa.create({ data: { nombre: slug, slug } });
}
async function nuevoUsuario(esSuperAdmin = false) {
  return prisma.usuario.create({
    data: {
      nombre: 'U',
      email: `u${++n}-${Date.now()}@x.local`,
      rol: 'empleado',
      esSuperAdmin,
      passwordHash: await hashearContrasena(CLAVE),
    },
  });
}

describe('auth — empresa activa en el login (multi-tenant)', () => {
  it('usuario con membresía: el token lleva el empresaId y el rol de la membresía', async () => {
    const empresa = await nuevaEmpresa();
    const usuario = await nuevoUsuario();
    await prisma.membresia.create({
      data: {
        usuarioId: usuario.id,
        empresaId: empresa.id,
        rol: 'administrador',
        predeterminada: true,
      },
    });

    const res = await servicio.iniciarSesion(usuario.email, CLAVE);
    const payload = JSON.parse(res.accessToken);

    expect(payload.sub).toBe(usuario.id);
    expect(payload.empresaId).toBe(empresa.id);
    expect(payload.rol).toBe('administrador'); // rol de la membresía, no el global
    expect(payload.esSuperAdmin).toBe(false);
    expect(res.usuario.empresaId).toBe(empresa.id);
    expect(res.usuario.empresaNombre).toBe(empresa.nombre); // nombre de la empresa activa
    expect(payload.empresaNombre).toBeUndefined(); // el nombre NO va en el token
  });

  it('expone debeCambiarContrasena en el token y en el usuario público del login', async () => {
    const empresa = await nuevaEmpresa();
    const usuario = await prisma.usuario.create({
      data: {
        nombre: 'U',
        email: `dc${++n}-${Date.now()}@x.local`,
        rol: 'administrador',
        passwordHash: await hashearContrasena(CLAVE),
        debeCambiarContrasena: true, // contraseña temporal
      },
    });
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: empresa.id, rol: 'administrador', predeterminada: true },
    });

    const res = await servicio.iniciarSesion(usuario.email, CLAVE);
    expect(JSON.parse(res.accessToken).debeCambiarContrasena).toBe(true); // en el token
    expect(res.usuario.debeCambiarContrasena).toBe(true); // en el UsuarioPublico
  });

  it('usuario normal SIN membresía: NO puede iniciar sesión', async () => {
    const usuario = await nuevoUsuario();
    await expect(servicio.iniciarSesion(usuario.email, CLAVE)).rejects.toThrow(
      ErrorAutenticacion,
    );
  });

  it('super-admin SIN membresía: entra con empresaId=null y mínimo privilegio', async () => {
    const usuario = await nuevoUsuario(true);
    const res = await servicio.iniciarSesion(usuario.email, CLAVE);
    const payload = JSON.parse(res.accessToken);

    expect(payload.empresaId).toBeNull();
    expect(payload.esSuperAdmin).toBe(true);
    expect(payload.rol).toBe('empleado'); // su poder viene de esSuperAdmin, no del rol
    expect(res.usuario.empresaNombre).toBeNull(); // sin empresa activa → sin nombre
  });

  it('con varias membresías, el login elige la marcada predeterminada', async () => {
    const e1 = await nuevaEmpresa();
    const e2 = await nuevaEmpresa();
    const usuario = await nuevoUsuario();
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: e1.id, rol: 'empleado', predeterminada: false },
    });
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: e2.id, rol: 'supervisor', predeterminada: true },
    });

    const res = await servicio.iniciarSesion(usuario.email, CLAVE);
    const payload = JSON.parse(res.accessToken);

    expect(payload.empresaId).toBe(e2.id); // la predeterminada
    expect(payload.rol).toBe('supervisor');
  });

  it('no se puede iniciar sesión en una empresa dada de baja (activo=false)', async () => {
    const empresa = await prisma.empresa.create({
      data: { nombre: `baja-${Date.now()}`, slug: `baja-${Date.now()}`, activo: false },
    });
    const usuario = await nuevoUsuario();
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: empresa.id, rol: 'administrador', predeterminada: true },
    });

    await expect(servicio.iniciarSesion(usuario.email, CLAVE)).rejects.toThrow(
      ErrorAutenticacion,
    );
  });
});

/**
 * `refrescarAcceso` re-resuelve el contexto contra la BD en cada refresh (no usa
 * valores cacheados del login). Corre el `resolverContextoActivo` REAL contra
 * Postgres (Testcontainers); el único mock es el firmado JWT.
 */
describe('auth — refrescarAcceso re-resuelve el estado actual (multi-tenant)', () => {
  it('conserva la empresa activa de la sesión (preferida), no re-elige la predeterminada', async () => {
    const e1 = await nuevaEmpresa();
    const e2 = await nuevaEmpresa();
    const usuario = await nuevoUsuario();
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: e1.id, rol: 'administrador', predeterminada: true },
    });
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: e2.id, rol: 'empleado', predeterminada: false },
    });

    const login = await servicio.iniciarSesion(usuario.email, CLAVE);
    expect(JSON.parse(login.accessToken).empresaId).toBe(e1.id); // la predeterminada

    // Simula lo que hará cambiar-empresa (4c): la sesión apunta a e2.
    await prisma.sesionRefresco.updateMany({
      where: { usuarioId: usuario.id },
      data: { empresaIdActiva: e2.id },
    });

    const ref = await servicio.refrescarAcceso(login.refreshToken);
    const payload = JSON.parse(ref.accessToken);
    expect(payload.empresaId).toBe(e2.id); // conserva la preferida de la sesión
    expect(payload.rol).toBe('empleado'); // rol de e2, no de e1
  });

  it('rechaza (401) si el usuario perdió TODAS sus membresías (revocación)', async () => {
    const e1 = await nuevaEmpresa();
    const usuario = await nuevoUsuario();
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: e1.id, rol: 'administrador', predeterminada: true },
    });
    const login = await servicio.iniciarSesion(usuario.email, CLAVE);

    await prisma.membresia.deleteMany({ where: { usuarioId: usuario.id } });

    await expect(servicio.refrescarAcceso(login.refreshToken)).rejects.toThrow(
      ErrorAutenticacion,
    );
  });

  it('refleja el rol ACTUAL de la membresía, no el cacheado en el login', async () => {
    const e1 = await nuevaEmpresa();
    const usuario = await nuevoUsuario();
    const m = await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: e1.id, rol: 'administrador', predeterminada: true },
    });
    const login = await servicio.iniciarSesion(usuario.email, CLAVE);
    expect(JSON.parse(login.accessToken).rol).toBe('administrador');

    await prisma.membresia.update({ where: { id: m.id }, data: { rol: 'empleado' } });

    const ref = await servicio.refrescarAcceso(login.refreshToken);
    expect(JSON.parse(ref.accessToken).rol).toBe('empleado'); // rol nuevo, no el del login
  });
});

/**
 * `cambiarEmpresa` (Fase 4c, §3.5): cambio de la empresa activa de la sesión. El
 * destino viene del body como petición SUJETA A AUTORIZACIÓN (membresía o
 * super-admin, verificada en BD); la denegación usa un mensaje ÚNICO (inexistente =
 * inactiva = sin membresía) para no revelar la existencia de otros tenants.
 */
describe('auth — cambiarEmpresa (Fase 4c)', () => {
  it('con membresía en la destino: emite access de la destino y TODAS las sesiones apuntan ahí', async () => {
    const e1 = await nuevaEmpresa();
    const e2 = await nuevaEmpresa();
    const usuario = await nuevoUsuario();
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: e1.id, rol: 'administrador', predeterminada: true },
    });
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: e2.id, rol: 'supervisor', predeterminada: false },
    });

    // Dos sesiones (dos dispositivos): el cambio es preferencia de USUARIO, afecta ambas.
    const login1 = await servicio.iniciarSesion(usuario.email, CLAVE);
    await servicio.iniciarSesion(usuario.email, CLAVE);

    const res = await servicio.cambiarEmpresa(usuario.id, e2.id, e1.id);
    const payload = JSON.parse(res.accessToken);
    expect(payload.empresaId).toBe(e2.id);
    expect(payload.rol).toBe('supervisor'); // rol de la membresía DESTINO
    expect(res.usuario.empresaId).toBe(e2.id);
    expect(res.usuario.empresaNombre).toBe(e2.nombre);

    const sesiones = await prisma.sesionRefresco.findMany({ where: { usuarioId: usuario.id } });
    expect(sesiones).toHaveLength(2);
    expect(sesiones.every((s) => s.empresaIdActiva === e2.id)).toBe(true);

    // El refresh posterior CONSERVA la empresa cambiada (la sesión ya apunta a e2).
    const ref = await servicio.refrescarAcceso(login1.refreshToken);
    expect(JSON.parse(ref.accessToken).empresaId).toBe(e2.id);
  });

  it('sin membresía en la destino: ErrorAutorizacion y la sesión NO cambia', async () => {
    const e1 = await nuevaEmpresa();
    const ajena = await nuevaEmpresa();
    const usuario = await nuevoUsuario();
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: e1.id, rol: 'administrador', predeterminada: true },
    });
    await servicio.iniciarSesion(usuario.email, CLAVE);

    await expect(servicio.cambiarEmpresa(usuario.id, ajena.id, e1.id)).rejects.toThrow(
      ErrorAutorizacion,
    );
    const sesiones = await prisma.sesionRefresco.findMany({ where: { usuarioId: usuario.id } });
    expect(sesiones.every((s) => s.empresaIdActiva === e1.id)).toBe(true);
  });

  it('empresa inexistente o dada de baja: el MISMO error genérico (anti-enumeración)', async () => {
    const e1 = await nuevaEmpresa();
    const baja = await prisma.empresa.create({
      data: { nombre: `baja-${Date.now()}`, slug: `ce-baja-${Date.now()}`, activo: false },
    });
    const usuario = await nuevoUsuario();
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: e1.id, rol: 'administrador', predeterminada: true },
    });
    // CON membresía en la dada de baja: aun así no se entra.
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: baja.id, rol: 'administrador', predeterminada: false },
    });

    await expect(servicio.cambiarEmpresa(usuario.id, randomUUID(), e1.id)).rejects.toThrow(
      'No tienes acceso a esa empresa.',
    );
    await expect(servicio.cambiarEmpresa(usuario.id, baja.id, e1.id)).rejects.toThrow(
      'No tienes acceso a esa empresa.',
    );
  });

  it('usuario normal NO puede "volver a plataforma" (empresaId null)', async () => {
    const e1 = await nuevaEmpresa();
    const usuario = await nuevoUsuario();
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: e1.id, rol: 'administrador', predeterminada: true },
    });

    await expect(servicio.cambiarEmpresa(usuario.id, null, e1.id)).rejects.toThrow(
      ErrorAutorizacion,
    );
  });

  it('usuario inactivo: ErrorAutenticacion', async () => {
    const e1 = await nuevaEmpresa();
    const usuario = await nuevoUsuario();
    await prisma.usuario.update({ where: { id: usuario.id }, data: { activo: false } });

    await expect(servicio.cambiarEmpresa(usuario.id, e1.id, null)).rejects.toThrow(
      ErrorAutenticacion,
    );
  });

  it('B4 — super-admin: NO puede entrar a ningún tenant (cambiarEmpresa a una empresa → ErrorAutorizacion); login da empresaId=null', async () => {
    const e1 = await nuevaEmpresa();
    const superAdmin = await nuevoUsuario(true);
    const login = await servicio.iniciarSesion(superAdmin.email, CLAVE);
    expect(JSON.parse(login.accessToken).empresaId).toBeNull();

    // B4: se exige membresía SIEMPRE; el super-admin nunca la tiene → 403, no entra.
    await expect(servicio.cambiarEmpresa(superAdmin.id, e1.id, null)).rejects.toThrow(
      'No tienes acceso a esa empresa.',
    );
    // Su sesión sigue en plataforma.
    const ref = await servicio.refrescarAcceso(login.refreshToken);
    expect(JSON.parse(ref.accessToken).empresaId).toBeNull();
  });

  it('B4 — super-admin: aunque una sesión llevara empresaIdActiva (residuo), el refresh SIEMPRE da empresaId=null', async () => {
    const e1 = await nuevaEmpresa();
    const superAdmin = await nuevoUsuario(true);
    const login = await servicio.iniciarSesion(superAdmin.email, CLAVE);
    // Estado residual sembrado a mano: la sesión "recuerda" una empresa (pre-B4 o SQL).
    await prisma.sesionRefresco.updateMany({
      where: { usuarioId: superAdmin.id },
      data: { empresaIdActiva: e1.id },
    });
    // B4: resolverContextoActivo ya NO honra la preferida del super-admin → null.
    const ref = await servicio.refrescarAcceso(login.refreshToken);
    expect(JSON.parse(ref.accessToken).empresaId).toBeNull();
  });

  it('B4 — super-admin: cambiarEmpresa(null) es no-op estando ya en plataforma (sin asiento)', async () => {
    const superAdmin = await nuevoUsuario(true);
    await servicio.iniciarSesion(superAdmin.email, CLAVE);
    const res = await servicio.cambiarEmpresa(superAdmin.id, null, null);
    const payload = JSON.parse(res.accessToken);
    expect(payload.empresaId).toBeNull();
    expect(res.usuario.empresaNombre).toBeNull();
    // Sin empresa que dejar → no hay asiento de cambiar_empresa.
    const asientos = await semilla().auditoria.findMany({
      where: { accion: 'cambiar_empresa', usuarioId: superAdmin.id },
    });
    expect(asientos).toHaveLength(0);
  });

  it('deja asiento de auditoría cambiar_empresa bajo la empresa DESTINO con el usuario real', async () => {
    const e1 = await nuevaEmpresa();
    const e2 = await nuevaEmpresa();
    const usuario = await nuevoUsuario();
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: e1.id, rol: 'administrador', predeterminada: true },
    });
    await prisma.membresia.create({
      data: { usuarioId: usuario.id, empresaId: e2.id, rol: 'empleado', predeterminada: false },
    });

    await servicio.cambiarEmpresa(usuario.id, e2.id, e1.id);

    const asientos = await semilla().auditoria.findMany({
      where: { accion: 'cambiar_empresa', usuarioId: usuario.id },
    });
    expect(asientos).toHaveLength(1);
    expect(asientos[0]?.entidad).toBe('empresa');
    expect(asientos[0]?.entidadId).toBe(e2.id);
    expect(asientos[0]?.empresaId).toBe(e2.id); // bajo la DESTINO
    expect(asientos[0]?.detalle).toMatchObject({ desde: e1.id, hacia: e2.id });
  });
});
