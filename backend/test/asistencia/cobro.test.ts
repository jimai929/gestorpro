import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../src/core/prisma.js';
import { acreditarSaldo, obtenerSaldo } from '../../src/asistencia/cobro/saldo.service.js';
import {
  solicitarCobro,
  aprobarCobro,
  pagarCobro,
  rechazarCobro,
} from '../../src/asistencia/cobro/cobro.service.js';
import { ErrorNoEncontrado, ErrorValidacion } from '../../src/core/errors.js';

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

async function nuevoUsuarioJefe() {
  n += 1;
  return prisma.usuario.create({
    data: {
      nombre: 'Jefe',
      email: `jefe-b10-${n}-${Date.now()}@gestorpro.local`,
      rol: 'supervisor',
      passwordHash: 'x',
    },
  });
}

/** Ejecuta la promesa y devuelve el error que lanza (o null si no lanzó). */
async function capturarError(promesa: Promise<unknown>): Promise<unknown> {
  try {
    await promesa;
    return null;
  } catch (error) {
    return error;
  }
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

describe('cobro: transiciones inválidas y rechazo (B10, B11)', () => {
  beforeAll(async () => {
    // Config determinista: 80% cobrable, umbral B/. 100 (igual a los defaults).
    const existe = await prisma.configuracionCobro.findFirst();
    if (existe) {
      await prisma.configuracionCobro.update({
        where: { id: existe.id },
        data: { porcentajeCobrable: 80, umbralAprobacion: 100 },
      });
    } else {
      await prisma.configuracionCobro.create({
        data: { porcentajeCobrable: 80, umbralAprobacion: 100 },
      });
    }
  });

  const ID_INEXISTENTE = '00000000-0000-0000-0000-000000000000';

  it('aprobar, rechazar o pagar una solicitud inexistente lanza ErrorNoEncontrado', async () => {
    const jefe = await nuevoUsuarioJefe();
    await expect(aprobarCobro(ID_INEXISTENTE, jefe.id)).rejects.toBeInstanceOf(ErrorNoEncontrado);
    await expect(rechazarCobro(ID_INEXISTENTE, jefe.id)).rejects.toBeInstanceOf(ErrorNoEncontrado);
    await expect(pagarCobro(ID_INEXISTENTE, jefe.id)).rejects.toBeInstanceOf(ErrorNoEncontrado);
  });

  it('el jefe rechaza un cobro pendiente: queda rechazada y NO debita el saldo', async () => {
    const emp = await crearEmpleadoConSaldo(200);
    const jefe = await nuevoUsuarioJefe();
    const cobro = await solicitarCobro({ empleadoId: emp.id, monto: 120 }); // pendiente
    expect(cobro.estado).toBe('pendiente');

    const rechazado = await rechazarCobro(cobro.id, jefe.id, 'sin presupuesto');
    expect(rechazado.estado).toBe('rechazada');
    expect(rechazado.motivoRechazo).toBe('sin presupuesto');
    expect(await obtenerSaldo(emp.id)).toBe(200); // el rechazo no debita
  });

  it('no se puede aprobar ni rechazar una solicitud que ya no está pendiente', async () => {
    const emp = await crearEmpleadoConSaldo(200);
    const jefe = await nuevoUsuarioJefe();
    const cobro = await solicitarCobro({ empleadoId: emp.id, monto: 120 }); // pendiente
    await aprobarCobro(cobro.id, jefe.id); // → aprobada (debita 120)

    await expect(aprobarCobro(cobro.id, jefe.id)).rejects.toBeInstanceOf(ErrorValidacion);
    await expect(rechazarCobro(cobro.id, jefe.id)).rejects.toBeInstanceOf(ErrorValidacion);
    expect(await obtenerSaldo(emp.id)).toBe(80); // sin segundo débito: 200 − 120
  });

  it('no se puede pagar un cobro que no está aprobado (p. ej. pendiente)', async () => {
    const emp = await crearEmpleadoConSaldo(200);
    const admin = await nuevoUsuarioJefe();
    const cobro = await solicitarCobro({ empleadoId: emp.id, monto: 120 }); // pendiente
    await expect(pagarCobro(cobro.id, admin.id)).rejects.toBeInstanceOf(ErrorValidacion);
  });

  it('una segunda solicitud que excede el disponible por lo ya comprometido se rechaza (over-commit)', async () => {
    const emp = await crearEmpleadoConSaldo(200); // 80% → 160 adelantable
    const primera = await solicitarCobro({ empleadoId: emp.id, monto: 120 }); // pendiente, compromete 120
    expect(primera.estado).toBe('pendiente');

    // Disponible ahora: 160 − 120 = 40. Pedir 50 excede.
    const error = await capturarError(solicitarCobro({ empleadoId: emp.id, monto: 50 }));
    expect(error).toBeInstanceOf(ErrorValidacion);
    expect((error as Error).message).toMatch(/excede tu monto adelantable/);

    // No se creó la segunda solicitud: sigue habiendo una sola.
    const solicitudes = await prisma.solicitudCobro.count({ where: { empleadoId: emp.id } });
    expect(solicitudes).toBe(1);
    expect(await obtenerSaldo(emp.id)).toBe(200); // saldo intacto (la pendiente no debita)
  });
});
