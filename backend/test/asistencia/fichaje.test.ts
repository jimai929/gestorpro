import { describe, it, expect, afterAll } from 'vitest';
import { semilla, comoEmpresa, crearEmpresa, cerrarSemilla } from '../helpers/db.js';
import {
  crearServicioFichaje,
  colaRevision,
  revisarFichaje,
} from '../../src/asistencia/fichaje/fichaje.service.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';
import { ErrorAutenticacion, ErrorValidacion } from '../../src/core/errors.js';

const servicio = crearServicioFichaje();
let n = 0;

async function escenario(modoExcepcion: 'pin' | 'supervisor' | 'ambos') {
  n += 1;
  const s = `${n}-${Date.now()}`;
  const empresaId = await crearEmpresa();
  const sede = await semilla().sede.create({ data: { nombre: `Sede ${s}`, modoExcepcion, empresaId } });
  const kiosco = await semilla().kiosco.create({ data: { nombre: `K ${s}`, sedeId: sede.id } });
  const empleado = await semilla().empleado.create({
    data: {
      empresaId, numero: `E${s}`, nombre: 'Empleado', sedeId: sede.id,
      qrToken: `qr${s}`, pinHash: await hashearContrasena('1234'), salarioFijo: 1000,
    },
  });
  return { empresaId, sede, kiosco, empleado };
}

afterAll(async () => {
  await cerrarSemilla();
});

describe('fichaje', () => {
  it('facial exitoso registra un fichaje normal', async () => {
    const { empresaId, kiosco, empleado } = await escenario('pin');
    const r = await comoEmpresa(empresaId, () => servicio.fichar({ kioscoId: kiosco.id, tipo: 'entrada', numero: empleado.numero, fotoCaptura: 'sim:match' }));
    expect(r.estado).toBe('registrado');
    if (r.estado === 'registrado') {
      expect(r.fichaje.esExcepcion).toBe(false);
      expect(r.mecanismo).toBe('facial');
    }
  });

  it('facial fallido sin excepción pide excepción según el modo de la sede', async () => {
    const { empresaId, kiosco, empleado } = await escenario('pin');
    const r = await comoEmpresa(empresaId, () => servicio.fichar({ kioscoId: kiosco.id, tipo: 'entrada', numero: empleado.numero, fotoCaptura: 'sim:nomatch' }));
    expect(r.estado).toBe('requiere_excepcion');
    if (r.estado === 'requiere_excepcion') expect(r.modoExcepcion).toBe('pin');
  });

  it('facial fallido + PIN correcto registra excepción marcada para revisión', async () => {
    const { empresaId, kiosco, empleado } = await escenario('pin');
    const r = await comoEmpresa(empresaId, () => servicio.fichar({ kioscoId: kiosco.id, tipo: 'entrada', numero: empleado.numero, fotoCaptura: 'sim:nomatch', pin: '1234' }));
    expect(r.estado).toBe('registrado');
    if (r.estado === 'registrado') {
      expect(r.fichaje.esExcepcion).toBe(true);
      expect(r.fichaje.requiereRevision).toBe(true);
      expect(r.mecanismo).toBe('pin');
    }
  });

  it('facial fallido + PIN incorrecto es rechazado', async () => {
    const { empresaId, kiosco, empleado } = await escenario('pin');
    await expect(
      comoEmpresa(empresaId, () => servicio.fichar({ kioscoId: kiosco.id, tipo: 'entrada', numero: empleado.numero, fotoCaptura: 'sim:nomatch', pin: '0000' })),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('sede en modo supervisor exige el camino de supervisor (rechaza PIN)', async () => {
    const { empresaId, kiosco, empleado } = await escenario('supervisor');
    await expect(
      comoEmpresa(empresaId, () => servicio.fichar({ kioscoId: kiosco.id, tipo: 'entrada', numero: empleado.numero, fotoCaptura: 'sim:nomatch', pin: '1234' })),
    ).rejects.toBeInstanceOf(ErrorValidacion);
  });

  // M2: la autorización de excepción decide por la MEMBRESÍA en la empresa del
  // kiosco (rol per-tenant), nunca por el Usuario.rol global.
  async function crearSupervisor(clave = 'Super123*', rolGlobal: 'supervisor' | 'administrador' | 'empleado' = 'supervisor') {
    const correo = `sup${n}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@gestorpro.local`;
    const usuario = await semilla().usuario.create({
      data: { nombre: 'Supervisor', email: correo, rol: rolGlobal, passwordHash: await hashearContrasena(clave) },
    });
    return { usuario, correo };
  }

  function ficharConSupervisor(
    empresaId: string,
    kioscoId: string,
    numero: string,
    correo: string,
    password: string,
  ) {
    return comoEmpresa(empresaId, () => servicio.fichar({
      kioscoId, tipo: 'entrada', numero, fotoCaptura: 'sim:nomatch',
      supervisorEmail: correo, supervisorPassword: password,
    }));
  }

  it('supervisor CON membresía rol=supervisor en la empresa del kiosco autoriza la excepción', async () => {
    const { empresaId, kiosco, empleado } = await escenario('supervisor');
    const { usuario, correo } = await crearSupervisor();
    await semilla().membresia.create({ data: { usuarioId: usuario.id, empresaId, rol: 'supervisor' } });
    const r = await ficharConSupervisor(empresaId, kiosco.id, empleado.numero, correo, 'Super123*');
    expect(r.estado).toBe('registrado');
    if (r.estado === 'registrado') expect(r.mecanismo).toBe('supervisor');
  });

  it('membresía rol=administrador en la empresa del kiosco también autoriza', async () => {
    const { empresaId, kiosco, empleado } = await escenario('supervisor');
    const { usuario, correo } = await crearSupervisor('Admin123*', 'administrador');
    await semilla().membresia.create({ data: { usuarioId: usuario.id, empresaId, rol: 'administrador' } });
    const r = await ficharConSupervisor(empresaId, kiosco.id, empleado.numero, correo, 'Admin123*');
    expect(r.estado).toBe('registrado');
    if (r.estado === 'registrado') expect(r.mecanismo).toBe('supervisor');
  });

  it('CROSS-TENANT: un supervisor de OTRA empresa (membresía solo allá) NO autoriza en este kiosco', async () => {
    const { empresaId, kiosco, empleado } = await escenario('supervisor');
    const empresaB = await crearEmpresa();
    const { usuario, correo } = await crearSupervisor();
    // Membresía válida… pero en la empresa B, no en la del kiosco.
    await semilla().membresia.create({ data: { usuarioId: usuario.id, empresaId: empresaB, rol: 'supervisor' } });
    await expect(
      ficharConSupervisor(empresaId, kiosco.id, empleado.numero, correo, 'Super123*'),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('usuario SIN ninguna membresía NO autoriza aunque su Usuario.rol global sea supervisor (el rol legado ya no manda)', async () => {
    const { empresaId, kiosco, empleado } = await escenario('supervisor');
    const { correo } = await crearSupervisor(); // Usuario.rol='supervisor', cero membresías
    await expect(
      ficharConSupervisor(empresaId, kiosco.id, empleado.numero, correo, 'Super123*'),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('membresía en la empresa del kiosco pero rol=empleado NO autoriza', async () => {
    const { empresaId, kiosco, empleado } = await escenario('supervisor');
    // Usuario.rol global dice 'supervisor', la membresía dice 'empleado': manda la membresía.
    const { usuario, correo } = await crearSupervisor();
    await semilla().membresia.create({ data: { usuarioId: usuario.id, empresaId, rol: 'empleado' } });
    await expect(
      ficharConSupervisor(empresaId, kiosco.id, empleado.numero, correo, 'Super123*'),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('cuenta DESACTIVADA con membresía supervisor válida NO autoriza (activo=false manda)', async () => {
    const { empresaId, kiosco, empleado } = await escenario('supervisor');
    const { usuario, correo } = await crearSupervisor();
    await semilla().membresia.create({ data: { usuarioId: usuario.id, empresaId, rol: 'supervisor' } });
    await semilla().usuario.update({ where: { id: usuario.id }, data: { activo: false } });
    await expect(
      ficharConSupervisor(empresaId, kiosco.id, empleado.numero, correo, 'Super123*'),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('contraseña TEMPORAL sin rotar (debeCambiarContrasena=true) NO autoriza, aunque todo lo demás sea válido', async () => {
    const { empresaId, kiosco, empleado } = await escenario('supervisor');
    const { usuario, correo } = await crearSupervisor();
    await semilla().membresia.create({ data: { usuarioId: usuario.id, empresaId, rol: 'supervisor' } });
    await semilla().usuario.update({ where: { id: usuario.id }, data: { debeCambiarContrasena: true } });
    // activo=true, membresía supervisor, contraseña CORRECTA: cae solo por la temporal.
    await expect(
      ficharConSupervisor(empresaId, kiosco.id, empleado.numero, correo, 'Super123*'),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('supervisor legítimo con contraseña INCORRECTA NO autoriza', async () => {
    const { empresaId, kiosco, empleado } = await escenario('supervisor');
    const { usuario, correo } = await crearSupervisor();
    await semilla().membresia.create({ data: { usuarioId: usuario.id, empresaId, rol: 'supervisor' } });
    await expect(
      ficharConSupervisor(empresaId, kiosco.id, empleado.numero, correo, 'Incorrecta1*'),
    ).rejects.toBeInstanceOf(ErrorAutenticacion);
  });

  it('la cola de revisión lista la excepción y la decisión del jefe la saca', async () => {
    const { empresaId, sede, kiosco, empleado } = await escenario('pin');
    const r = await comoEmpresa(empresaId, () => servicio.fichar({ kioscoId: kiosco.id, tipo: 'entrada', numero: empleado.numero, fotoCaptura: 'sim:nomatch', pin: '1234' }));
    if (r.estado !== 'registrado') throw new Error('esperaba un fichaje registrado');

    const antes = await comoEmpresa(empresaId, () => colaRevision({ sedeId: sede.id }));
    expect(antes.some((f) => f.id === r.fichaje.id)).toBe(true);

    const jefe = await semilla().usuario.create({
      data: { nombre: 'Jefe', email: `jefe${n}-${Date.now()}@gestorpro.local`, rol: 'administrador', passwordHash: 'x' },
    });
    await comoEmpresa(empresaId, () => revisarFichaje({ fichajeId: r.fichaje.id, jefeId: jefe.id, valido: true }));

    const despues = await comoEmpresa(empresaId, () => colaRevision({ sedeId: sede.id }));
    expect(despues.some((f) => f.id === r.fichaje.id)).toBe(false);
  });
});

describe('fichaje — revisión total (verificador simulado, riesgo aceptado)', () => {
  const servicioRT = crearServicioFichaje(undefined, { revisionTotal: true });

  it('marca para revisión incluso un facial exitoso y lo lista en la cola', async () => {
    const { empresaId, sede, kiosco, empleado } = await escenario('pin');
    const r = await comoEmpresa(empresaId, () => servicioRT.fichar({
      kioscoId: kiosco.id, tipo: 'entrada', numero: empleado.numero, fotoCaptura: 'sim:match',
    }));
    expect(r.estado).toBe('registrado');
    if (r.estado !== 'registrado') throw new Error('esperaba un fichaje registrado');
    expect(r.mecanismo).toBe('facial');
    expect(r.fichaje.esExcepcion).toBe(false);
    expect(r.fichaje.requiereRevision).toBe(true);

    const cola = await comoEmpresa(empresaId, () => colaRevision({ sedeId: sede.id }));
    expect(cola.some((f) => f.id === r.fichaje.id)).toBe(true);

    // El jefe puede revisar un fichaje NO-excepción marcado para revisión.
    const jefe = await semilla().usuario.create({
      data: { nombre: 'Jefe', email: `jefe-rt${n}-${Date.now()}@gestorpro.local`, rol: 'administrador', passwordHash: 'x' },
    });
    await comoEmpresa(empresaId, () => revisarFichaje({ fichajeId: r.fichaje.id, jefeId: jefe.id, valido: true }));
    const despues = await comoEmpresa(empresaId, () => colaRevision({ sedeId: sede.id }));
    expect(despues.some((f) => f.id === r.fichaje.id)).toBe(false);
  });

  it('por defecto (sin revisión total) un facial exitoso NO requiere revisión', async () => {
    const { empresaId, kiosco, empleado } = await escenario('pin');
    const r = await comoEmpresa(empresaId, () => servicio.fichar({
      kioscoId: kiosco.id, tipo: 'entrada', numero: empleado.numero, fotoCaptura: 'sim:match',
    }));
    if (r.estado !== 'registrado') throw new Error('esperaba un fichaje registrado');
    expect(r.fichaje.requiereRevision).toBe(false);
  });
});
