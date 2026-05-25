import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/core/prisma.js';
import {
  acreditarSaldo,
  debitarSaldo,
  obtenerSaldo,
} from '../../src/asistencia/cobro/saldo.service.js';
import { recalcularJornadaPorSalida } from '../../src/asistencia/jornada/jornada.service.js';
import { ErrorValidacion } from '../../src/core/errors.js';

let n = 0;
async function crearEmpleado(salario = 1200, pausaPorDefectoMin = 0) {
  n += 1;
  const s = `${n}-${Date.now()}`;
  const sede = await prisma.sede.create({ data: { nombre: `Sede ${s}` } });
  const turno = await prisma.turno.create({
    data: { nombre: `T ${s}`, sedeId: sede.id, horaInicio: '06:00', horaFin: '18:00', pausaPorDefectoMin },
  });
  const kiosco = await prisma.kiosco.create({ data: { nombre: `K ${s}`, sedeId: sede.id } });
  const empleado = await prisma.empleado.create({
    data: { numero: `E${s}`, nombre: 'E', sedeId: sede.id, turnoId: turno.id, qrToken: `qr${s}`, pinHash: 'x', salarioFijo: salario },
  });
  return { empleado, kiosco };
}

describe('servicio de saldo de horas extra', () => {
  it('acredita y lee el saldo', async () => {
    const { empleado } = await crearEmpleado();
    await prisma.$transaction((tx) => acreditarSaldo(tx, empleado.id, 100));
    await prisma.$transaction((tx) => acreditarSaldo(tx, empleado.id, 50));
    expect(await obtenerSaldo(empleado.id)).toBe(150);
  });

  it('debita del saldo', async () => {
    const { empleado } = await crearEmpleado();
    await prisma.$transaction((tx) => acreditarSaldo(tx, empleado.id, 150));
    await prisma.$transaction((tx) => debitarSaldo(tx, empleado.id, 60));
    expect(await obtenerSaldo(empleado.id)).toBe(90);
  });

  it('rechaza un débito que dejaría el saldo negativo (sobregiro)', async () => {
    const { empleado } = await crearEmpleado();
    await prisma.$transaction((tx) => acreditarSaldo(tx, empleado.id, 90));
    await expect(
      prisma.$transaction((tx) => debitarSaldo(tx, empleado.id, 200)),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    expect(await obtenerSaldo(empleado.id)).toBe(90); // intacto
  });

  it('cerrar una jornada con extra acredita el saldo en la misma operación', async () => {
    const { empleado, kiosco } = await crearEmpleado();
    const dia = (h: number) => new Date(2026, 3, 15, h, 0); // hora local
    await prisma.fichaje.create({ data: { empleadoId: empleado.id, kioscoId: kiosco.id, tipo: 'entrada', momento: dia(6) } });
    await prisma.fichaje.create({ data: { empleadoId: empleado.id, kioscoId: kiosco.id, tipo: 'salida', momento: dia(18) } });

    const jornada = await recalcularJornadaPorSalida(empleado.id, dia(18));

    // 12h diurnas, sin pausa → 8h ord + 4h extra; tope 3h → 3h × (1200/240) × 1.25 = 18.75
    expect(Number(jornada?.montoExtra)).toBe(18.75);
    expect(await obtenerSaldo(empleado.id)).toBe(18.75);
  });
});
