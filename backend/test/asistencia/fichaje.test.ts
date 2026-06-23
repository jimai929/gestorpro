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

  it('sede en modo supervisor acepta la autorización de un supervisor', async () => {
    const { empresaId, kiosco, empleado } = await escenario('supervisor');
    const correo = `sup${n}-${Date.now()}@gestorpro.local`;
    await semilla().usuario.create({
      data: { nombre: 'Supervisor', email: correo, rol: 'supervisor', passwordHash: await hashearContrasena('Super123*') },
    });
    const r = await comoEmpresa(empresaId, () => servicio.fichar({
      kioscoId: kiosco.id, tipo: 'entrada', numero: empleado.numero, fotoCaptura: 'sim:nomatch',
      supervisorEmail: correo, supervisorPassword: 'Super123*',
    }));
    expect(r.estado).toBe('registrado');
    if (r.estado === 'registrado') expect(r.mecanismo).toBe('supervisor');
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
