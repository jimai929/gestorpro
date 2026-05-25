import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../src/core/prisma.js';
import { acreditarSaldo, obtenerSaldo } from '../../src/asistencia/cobro/saldo.service.js';
import { solicitarCobro, aprobarCobro, pagarCobro } from '../../src/asistencia/cobro/cobro.service.js';
import { ErrorValidacion } from '../../src/core/errors.js';

let n = 0;
async function crearEmpleadoConSaldo(saldo: number) {
  n += 1;
  const s = `${n}-${Date.now()}`;
  const sede = await prisma.sede.create({ data: { nombre: `Sede ${s}` } });
  const empleado = await prisma.empleado.create({
    data: { numero: `E${s}`, nombre: 'E', sedeId: sede.id, qrToken: `qr${s}`, pinHash: 'x', salarioFijo: 1200 },
  });
  if (saldo > 0) {
    await prisma.$transaction((tx) => acreditarSaldo(tx, empleado.id, saldo));
  }
  return empleado;
}

describe('cobro anticipado (solicitud y aprobación)', () => {
  beforeAll(async () => {
    // Configuración única: 80% cobrable, umbral de aprobación B/. 100.
    const existe = await prisma.configuracionCobro.findFirst();
    if (!existe) {
      await prisma.configuracionCobro.create({ data: { porcentajeCobrable: 80, umbralAprobacion: 100 } });
    }
    // Categoría de pago a empleado: la necesita el gasto que genera el cobro pagado.
    const cat = await prisma.categoriaGasto.findFirst({ where: { esPagoEmpleado: true } });
    if (!cat) {
      await prisma.categoriaGasto.create({ data: { nombre: 'Pago a empleado', esPagoEmpleado: true } });
    }
  });

  it('cobro bajo el umbral nace aprobada (directo) y debita el saldo', async () => {
    const emp = await crearEmpleadoConSaldo(200);
    const cobro = await solicitarCobro({ empleadoId: emp.id, monto: 50 });
    expect(cobro.estado).toBe('aprobada');
    expect(await obtenerSaldo(emp.id)).toBe(150);
  });

  it('cobro sobre el umbral nace pendiente y NO debita aún', async () => {
    const emp = await crearEmpleadoConSaldo(200); // 80% → 160 adelantable
    const cobro = await solicitarCobro({ empleadoId: emp.id, monto: 120 }); // >100 umbral, ≤160
    expect(cobro.estado).toBe('pendiente');
    expect(await obtenerSaldo(emp.id)).toBe(200); // intacto hasta la aprobación
  });

  it('el % cobrable limita el monto adelantable', async () => {
    const emp = await crearEmpleadoConSaldo(100); // 80% → solo 80 adelantable
    await expect(
      solicitarCobro({ empleadoId: emp.id, monto: 90 }),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    expect(await obtenerSaldo(emp.id)).toBe(100); // no se tocó el saldo
  });

  it('el jefe aprueba un cobro pendiente y debita el saldo', async () => {
    const emp = await crearEmpleadoConSaldo(200);
    const jefe = await prisma.usuario.create({
      data: { nombre: 'Jefe', email: `jefe-c${n}-${Date.now()}@gestorpro.local`, rol: 'supervisor', passwordHash: 'x' },
    });
    const cobro = await solicitarCobro({ empleadoId: emp.id, monto: 120 });
    expect(cobro.estado).toBe('pendiente');

    const aprobado = await aprobarCobro(cobro.id, jefe.id);
    expect(aprobado.estado).toBe('aprobada');
    expect(await obtenerSaldo(emp.id)).toBe(80); // 200 − 120
  });

  it('marcar pagado genera el gasto (con referenciaOrigen) una sola vez', async () => {
    const emp = await crearEmpleadoConSaldo(200);
    const admin = await prisma.usuario.create({
      data: { nombre: 'Admin', email: `adm-c${n}-${Date.now()}@gestorpro.local`, rol: 'administrador', passwordHash: 'x' },
    });
    const cobro = await solicitarCobro({ empleadoId: emp.id, monto: 50 }); // directo → aprobada

    const pagado = await pagarCobro(cobro.id, admin.id);
    expect(pagado.estado).toBe('pagada');

    const gastos = await prisma.gasto.findMany({ where: { referenciaOrigen: cobro.id } });
    expect(gastos).toHaveLength(1);
    expect(gastos[0]?.tipoPago).toBe('cobro de horas extra');
    expect(Number(gastos[0]?.monto)).toBe(50);

    // Pagar de nuevo se rechaza y NO genera un segundo gasto (evita doble pago).
    await expect(pagarCobro(cobro.id, admin.id)).rejects.toBeInstanceOf(ErrorValidacion);
    const gastos2 = await prisma.gasto.findMany({ where: { referenciaOrigen: cobro.id } });
    expect(gastos2).toHaveLength(1);
  });
});
