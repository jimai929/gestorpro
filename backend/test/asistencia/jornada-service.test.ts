import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/core/prisma.js';
import {
  recalcularJornadaPorSalida,
  barrerHuerfanos,
} from '../../src/asistencia/jornada/jornada.service.js';
import { crearServicioFichaje } from '../../src/asistencia/fichaje/fichaje.service.js';

let n = 0;
async function crearEmpleadoConTurno() {
  n += 1;
  const s = `${n}-${Date.now()}`;
  const sede = await prisma.sede.create({ data: { nombre: `Sede ${s}` } });
  const turno = await prisma.turno.create({
    data: { nombre: `Turno ${s}`, sedeId: sede.id, horaInicio: '08:00', horaFin: '17:00', pausaPorDefectoMin: 60 },
  });
  const kiosco = await prisma.kiosco.create({ data: { nombre: `K ${s}`, sedeId: sede.id } });
  const empleado = await prisma.empleado.create({
    data: { numero: `E${s}`, nombre: 'E', sedeId: sede.id, turnoId: turno.id, qrToken: `qr${s}`, pinHash: 'x', salarioFijo: 1200 },
  });
  return { sede, turno, kiosco, empleado };
}

describe('motor de jornada (persistencia)', () => {
  it('recalcula y guarda la jornada al cerrar la salida', async () => {
    const { empleado, kiosco } = await crearEmpleadoConTurno();
    // Hora local: el motor clasifica diurna/nocturna por la hora local del servidor.
    const dia = (h: number, m = 0) => new Date(2026, 3, 15, h, m);
    for (const [tipo, hora] of [
      ['entrada', 8],
      ['salida_comida', 12],
      ['entrada_comida', 13],
      ['salida', 17],
    ] as const) {
      await prisma.fichaje.create({
        data: { empleadoId: empleado.id, kioscoId: kiosco.id, tipo, momento: dia(hora) },
      });
    }

    const jornada = await recalcularJornadaPorSalida(empleado.id, dia(17));
    expect(jornada).not.toBeNull();
    expect(jornada?.minutosTrabajados).toBe(480); // 9h − 1h pausa
    expect(jornada?.clasificacion).toBe('diurna');
    expect(jornada?.anomalia).toBe(false);
  });

  it('el job marca como anomalía una entrada sin salida pasada la ventana de 16h', async () => {
    const { empleado, kiosco } = await crearEmpleadoConTurno();
    const hace17h = new Date(Date.now() - 17 * 60 * 60 * 1000);
    await prisma.fichaje.create({
      data: { empleadoId: empleado.id, kioscoId: kiosco.id, tipo: 'entrada', momento: hace17h },
    });

    const marcadas = await barrerHuerfanos(new Date());
    expect(marcadas).toBeGreaterThanOrEqual(1);

    const jornada = await prisma.jornada.findFirst({
      where: { empleadoId: empleado.id, anomalia: true },
    });
    expect(jornada).not.toBeNull();
    expect(jornada?.detalleAnomalia).toMatch(/sin salida/i);
  });

  it('fichar la salida dispara el cálculo de la jornada automáticamente', async () => {
    const { empleado, kiosco } = await crearEmpleadoConTurno();
    const servicio = crearServicioFichaje();
    await servicio.fichar({ kioscoId: kiosco.id, tipo: 'entrada', numero: empleado.numero, fotoCaptura: 'sim:match' });
    await servicio.fichar({ kioscoId: kiosco.id, tipo: 'salida', numero: empleado.numero, fotoCaptura: 'sim:match' });

    const jornada = await prisma.jornada.findFirst({ where: { empleadoId: empleado.id } });
    expect(jornada).not.toBeNull();
  });
});
