import { describe, it, expect, afterAll } from 'vitest';
import {
  acreditarSaldo,
  debitarSaldo,
  obtenerSaldo,
} from '../../src/asistencia/cobro/saldo.service.js';
import { recalcularJornadaPorSalida } from '../../src/asistencia/jornada/jornada.service.js';
import { ErrorValidacion } from '../../src/core/errors.js';
import { txEmpresa } from '../../src/core/tenant/contexto.js';
import { semilla, comoEmpresa, crearEmpresa, cerrarSemilla } from '../helpers/db.js';

afterAll(cerrarSemilla);

let n = 0;
async function crearEmpleado(empresaId: string, salario = 1200, pausaPorDefectoMin = 0) {
  n += 1;
  const s = `${n}-${Date.now()}`;
  const sede = await semilla().sede.create({ data: { nombre: `Sede ${s}`, empresaId } });
  const turno = await semilla().turno.create({
    data: { nombre: `T ${s}`, sedeId: sede.id, horaInicio: '06:00', horaFin: '18:00', pausaPorDefectoMin, empresaId },
  });
  const kiosco = await semilla().kiosco.create({ data: { nombre: `K ${s}`, sedeId: sede.id } });
  const empleado = await semilla().empleado.create({
    data: { empresaId, numero: `E${s}`, nombre: 'E', sedeId: sede.id, turnoId: turno.id, qrToken: `qr${s}`, pinHash: 'x', salarioFijo: salario },
  });
  return { empleado, kiosco };
}

describe('servicio de saldo de horas extra', () => {
  it('acredita y lee el saldo', async () => {
    const empresaId = await crearEmpresa();
    const { empleado } = await crearEmpleado(empresaId);
    await comoEmpresa(empresaId, () => txEmpresa((tx) => acreditarSaldo(tx, empleado.id, 100)));
    await comoEmpresa(empresaId, () => txEmpresa((tx) => acreditarSaldo(tx, empleado.id, 50)));
    expect(await comoEmpresa(empresaId, () => obtenerSaldo(empleado.id))).toBe(150);
  });

  it('debita del saldo', async () => {
    const empresaId = await crearEmpresa();
    const { empleado } = await crearEmpleado(empresaId);
    await comoEmpresa(empresaId, () => txEmpresa((tx) => acreditarSaldo(tx, empleado.id, 150)));
    await comoEmpresa(empresaId, () => txEmpresa((tx) => debitarSaldo(tx, empleado.id, 60)));
    expect(await comoEmpresa(empresaId, () => obtenerSaldo(empleado.id))).toBe(90);
  });

  it('rechaza un débito que dejaría el saldo negativo (sobregiro)', async () => {
    const empresaId = await crearEmpresa();
    const { empleado } = await crearEmpleado(empresaId);
    await comoEmpresa(empresaId, () => txEmpresa((tx) => acreditarSaldo(tx, empleado.id, 90)));
    await expect(
      comoEmpresa(empresaId, () => txEmpresa((tx) => debitarSaldo(tx, empleado.id, 200))),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    expect(await comoEmpresa(empresaId, () => obtenerSaldo(empleado.id))).toBe(90); // intacto
  });

  it('cerrar una jornada con extra acredita el saldo en la misma operación', async () => {
    const empresaId = await crearEmpresa();
    const { empleado, kiosco } = await crearEmpleado(empresaId);
    const dia = (h: number) => new Date(2026, 3, 15, h, 0); // hora local
    await semilla().fichaje.create({ data: { empleadoId: empleado.id, kioscoId: kiosco.id, tipo: 'entrada', momento: dia(6) } });
    await semilla().fichaje.create({ data: { empleadoId: empleado.id, kioscoId: kiosco.id, tipo: 'salida', momento: dia(18) } });

    const jornada = await comoEmpresa(empresaId, () => recalcularJornadaPorSalida(empleado.id, dia(18)));

    // 12h diurnas, sin pausa → 8h ord + 4h extra; tope 3h → 3h × (1200/240) × 1.25 = 18.75
    expect(Number(jornada?.montoExtra)).toBe(18.75);
    expect(await comoEmpresa(empresaId, () => obtenerSaldo(empleado.id))).toBe(18.75);
  });
});
