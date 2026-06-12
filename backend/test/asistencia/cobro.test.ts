import { describe, it, expect, beforeAll } from 'vitest';
import { prisma } from '../../src/core/prisma.js';
import { acreditarSaldo, obtenerSaldo } from '../../src/asistencia/cobro/saldo.service.js';
import {
  solicitarCobro,
  aprobarCobro,
  pagarCobro,
  rechazarCobro,
  definirConfiguracionCobro,
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
    // El reject no dejó un Gasto huérfano: la transacción aborta antes de crearGastoEnTransaccion (H14).
    expect(await prisma.gasto.count({ where: { referenciaOrigen: ID_INEXISTENTE } })).toBe(0);
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

describe('cobro: guardas de configuración y categoría (B12, B13)', () => {
  it('pagarCobro sin categoría de pago-empleado activa lanza ErrorValidacion y revierte todo', async () => {
    const emp = await crearEmpleadoConSaldo(200);
    const admin = await nuevoUsuarioJefe();
    const cobro = await solicitarCobro({ empleadoId: emp.id, monto: 50 }); // ≤ umbral 100 → nace 'aprobada'
    expect(cobro.estado).toBe('aprobada');

    // Capturar y desactivar TODAS las categorías pago-empleado activas (el guard usa findFirst
    // sobre los flags; gastos.test.ts deja otras en la BD compartida).
    const activas = await prisma.categoriaGasto.findMany({
      where: { esPagoEmpleado: true, activo: true },
      select: { id: true },
    });
    const ids = activas.map((c) => c.id);
    await prisma.categoriaGasto.updateMany({ where: { id: { in: ids } }, data: { activo: false } });
    try {
      await expect(pagarCobro(cobro.id, admin.id)).rejects.toBeInstanceOf(ErrorValidacion);
      // Rollback completo: la solicitud sigue 'aprobada' (no quedó 'pagada')…
      const sol = await prisma.solicitudCobro.findUnique({ where: { id: cobro.id } });
      expect(sol?.estado).toBe('aprobada');
      // …y NO se creó ningún Gasto ligado a la solicitud.
      expect(await prisma.gasto.count({ where: { referenciaOrigen: cobro.id } })).toBe(0);
    } finally {
      // Restaurar exactamente las que estaban activas, DENTRO del propio it: si un expect falla
      // a mitad, el finally restaura igual y no contamina los tests/archivos siguientes.
      await prisma.categoriaGasto.updateMany({ where: { id: { in: ids } }, data: { activo: true } });
    }
  });

  it('definirConfiguracionCobro rechaza % fuera de 0-100 y umbral negativo sin tocar la fila', async () => {
    // Depende de los beforeAll de los describes anteriores del archivo (dejan la config en 80/100);
    // con un filtro -t que los salte, la fila podría no existir.
    const antes = await prisma.configuracionCobro.findFirst();
    expect(antes).not.toBeNull();

    await expect(definirConfiguracionCobro({ porcentajeCobrable: -1 })).rejects.toBeInstanceOf(ErrorValidacion);
    await expect(definirConfiguracionCobro({ porcentajeCobrable: 101 })).rejects.toBeInstanceOf(ErrorValidacion);
    await expect(definirConfiguracionCobro({ umbralAprobacion: -1 })).rejects.toBeInstanceOf(ErrorValidacion);

    // La validación corre antes de tocar la BD: la fila única no cambió.
    const despues = await prisma.configuracionCobro.findFirst();
    expect(despues?.id).toBe(antes?.id);
    expect(despues?.porcentajeCobrable).toBe(antes?.porcentajeCobrable);
    expect(Number(despues?.umbralAprobacion)).toBe(Number(antes?.umbralAprobacion));
  });
});
