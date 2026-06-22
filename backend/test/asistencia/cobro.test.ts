import { describe, it, expect, afterAll } from 'vitest';
import { txEmpresa } from '../../src/core/tenant/contexto.js';
import { semilla, comoEmpresa, crearEmpresa, cerrarSemilla } from '../helpers/db.js';
import { obtenerSaldo } from '../../src/asistencia/cobro/saldo.service.js';
import {
  solicitarCobro,
  aprobarCobro,
  pagarCobro,
  rechazarCobro,
  definirConfiguracionCobro,
} from '../../src/asistencia/cobro/cobro.service.js';
import { ErrorNoEncontrado, ErrorValidacion } from '../../src/core/errors.js';

let n = 0;

/**
 * Crea una empresa propia con su configuración de cobro (80% cobrable, umbral 100)
 * y su categoría de pago-empleado activa, todo vía semilla (arrange/fixtures).
 * `configuracion_cobro` y `categoria_gasto` son tablas DIRECTAS (NOT NULL empresa_id):
 * antes el archivo compartía una sola fila de config global; bajo RLS cada test
 * necesita la suya, así que sembramos config+categoría por empresa.
 */
async function crearEmpresaConCobro(): Promise<string> {
  const empresaId = await crearEmpresa();
  await semilla().configuracionCobro.create({
    data: { empresaId, porcentajeCobrable: 80, umbralAprobacion: 100 },
  });
  n += 1;
  await semilla().categoriaGasto.create({
    data: { empresaId, nombre: `Pago a empleado ${n}-${Date.now()}`, esPagoEmpleado: true },
  });
  return empresaId;
}

async function crearEmpleadoConSaldo(empresaId: string, saldo: number) {
  n += 1;
  const s = `${n}-${Date.now()}`;
  // Tablas DIRECTAS (sede) llevan empresa_id explícito; las "hereda" (empleado,
  // saldo) lo derivan por su FK a la sede/empleado de esta empresa.
  const sede = await semilla().sede.create({ data: { nombre: `Sede ${s}`, empresaId } });
  const empleado = await semilla().empleado.create({
    data: { numero: `E${s}`, nombre: 'E', sedeId: sede.id, qrToken: `qr${s}`, pinHash: 'x', salarioFijo: 1200 },
  });
  if (saldo > 0) {
    // Siembra del saldo (arrange): upsert directo vía semilla, sin pasar por el
    // servicio (que exige contexto de tenant). El saldo deriva su empresa por la FK.
    await semilla().saldoHorasExtra.upsert({
      where: { empleadoId: empleado.id },
      create: { empleadoId: empleado.id, saldo },
      update: { saldo },
    });
  }
  return empleado;
}

async function nuevoUsuarioJefe() {
  n += 1;
  // usuario está EXCLUIDO de RLS (no lleva empresa_id) → se siembra vía semilla.
  return semilla().usuario.create({
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

afterAll(async () => {
  await cerrarSemilla();
});

describe('cobro anticipado (solicitud y aprobación)', () => {
  it('cobro bajo el umbral nace aprobada (directo) y debita el saldo', async () => {
    const empresaId = await crearEmpresaConCobro();
    const emp = await crearEmpleadoConSaldo(empresaId, 200);
    const cobro = await comoEmpresa(empresaId, () => solicitarCobro({ empleadoId: emp.id, monto: 50 }));
    expect(cobro.estado).toBe('aprobada');
    // positivo: el saldo del tenant se lee con su propio servicio bajo comoEmpresa.
    expect(await comoEmpresa(empresaId, () => obtenerSaldo(emp.id))).toBe(150);
  });

  it('cobro sobre el umbral nace pendiente y NO debita aún', async () => {
    const empresaId = await crearEmpresaConCobro();
    const emp = await crearEmpleadoConSaldo(empresaId, 200); // 80% → 160 adelantable
    const cobro = await comoEmpresa(empresaId, () => solicitarCobro({ empleadoId: emp.id, monto: 120 })); // >100 umbral, ≤160
    expect(cobro.estado).toBe('pendiente');
    expect(await comoEmpresa(empresaId, () => obtenerSaldo(emp.id))).toBe(200); // intacto hasta la aprobación
  });

  it('el % cobrable limita el monto adelantable', async () => {
    const empresaId = await crearEmpresaConCobro();
    const emp = await crearEmpleadoConSaldo(empresaId, 100); // 80% → solo 80 adelantable
    await expect(
      comoEmpresa(empresaId, () => solicitarCobro({ empleadoId: emp.id, monto: 90 })),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    expect(await comoEmpresa(empresaId, () => obtenerSaldo(emp.id))).toBe(100); // no se tocó el saldo
  });

  it('el jefe aprueba un cobro pendiente y debita el saldo', async () => {
    const empresaId = await crearEmpresaConCobro();
    const emp = await crearEmpleadoConSaldo(empresaId, 200);
    const jefe = await nuevoUsuarioJefe();
    const cobro = await comoEmpresa(empresaId, () => solicitarCobro({ empleadoId: emp.id, monto: 120 }));
    expect(cobro.estado).toBe('pendiente');

    const aprobado = await comoEmpresa(empresaId, () => aprobarCobro(cobro.id, jefe.id));
    expect(aprobado.estado).toBe('aprobada');
    expect(await comoEmpresa(empresaId, () => obtenerSaldo(emp.id))).toBe(80); // 200 − 120
  });

  it('marcar pagado genera el gasto (con referenciaOrigen) una sola vez', async () => {
    const empresaId = await crearEmpresaConCobro();
    const emp = await crearEmpleadoConSaldo(empresaId, 200);
    const admin = await semilla().usuario.create({
      data: { nombre: 'Admin', email: `adm-c${n}-${Date.now()}@gestorpro.local`, rol: 'administrador', passwordHash: 'x' },
    });
    const cobro = await comoEmpresa(empresaId, () => solicitarCobro({ empleadoId: emp.id, monto: 50 })); // directo → aprobada

    const pagado = await comoEmpresa(empresaId, () => pagarCobro(cobro.id, admin.id));
    expect(pagado.estado).toBe('pagada');

    // positivo (presencia del gasto): no hay método de servicio que lea Gasto por
    // referenciaOrigen → se lee bajo comoEmpresa (el tenant ve su propio gasto bajo RLS).
    const gastos = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) => tx.gasto.findMany({ where: { referenciaOrigen: cobro.id } })),
    );
    expect(gastos).toHaveLength(1);
    expect(gastos[0]?.tipoPago).toBe('cobro de horas extra');
    expect(Number(gastos[0]?.monto)).toBe(50);

    // Pagar de nuevo se rechaza y NO genera un segundo gasto (evita doble pago).
    await expect(comoEmpresa(empresaId, () => pagarCobro(cobro.id, admin.id))).rejects.toBeInstanceOf(ErrorValidacion);
    const gastos2 = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) => tx.gasto.findMany({ where: { referenciaOrigen: cobro.id } })),
    );
    expect(gastos2).toHaveLength(1);
  });
});

describe('cobro: transiciones inválidas y rechazo (B10, B11)', () => {
  const ID_INEXISTENTE = '00000000-0000-0000-0000-000000000000';

  it('aprobar, rechazar o pagar una solicitud inexistente lanza ErrorNoEncontrado', async () => {
    const empresaId = await crearEmpresaConCobro();
    const jefe = await nuevoUsuarioJefe();
    await expect(comoEmpresa(empresaId, () => aprobarCobro(ID_INEXISTENTE, jefe.id))).rejects.toBeInstanceOf(ErrorNoEncontrado);
    await expect(comoEmpresa(empresaId, () => rechazarCobro(ID_INEXISTENTE, jefe.id))).rejects.toBeInstanceOf(ErrorNoEncontrado);
    await expect(comoEmpresa(empresaId, () => pagarCobro(ID_INEXISTENTE, jefe.id))).rejects.toBeInstanceOf(ErrorNoEncontrado);
    // ausencia ("no quedó Gasto huérfano"): semilla god-view (no existe en NINGÚN lado).
    expect(await semilla().gasto.count({ where: { referenciaOrigen: ID_INEXISTENTE } })).toBe(0);
  });

  it('el jefe rechaza un cobro pendiente: queda rechazada y NO debita el saldo', async () => {
    const empresaId = await crearEmpresaConCobro();
    const emp = await crearEmpleadoConSaldo(empresaId, 200);
    const jefe = await nuevoUsuarioJefe();
    const cobro = await comoEmpresa(empresaId, () => solicitarCobro({ empleadoId: emp.id, monto: 120 })); // pendiente
    expect(cobro.estado).toBe('pendiente');

    const rechazado = await comoEmpresa(empresaId, () => rechazarCobro(cobro.id, jefe.id, 'sin presupuesto'));
    expect(rechazado.estado).toBe('rechazada');
    expect(rechazado.motivoRechazo).toBe('sin presupuesto');
    expect(await comoEmpresa(empresaId, () => obtenerSaldo(emp.id))).toBe(200); // el rechazo no debita
  });

  it('no se puede aprobar ni rechazar una solicitud que ya no está pendiente', async () => {
    const empresaId = await crearEmpresaConCobro();
    const emp = await crearEmpleadoConSaldo(empresaId, 200);
    const jefe = await nuevoUsuarioJefe();
    const cobro = await comoEmpresa(empresaId, () => solicitarCobro({ empleadoId: emp.id, monto: 120 })); // pendiente
    await comoEmpresa(empresaId, () => aprobarCobro(cobro.id, jefe.id)); // → aprobada (debita 120)

    await expect(comoEmpresa(empresaId, () => aprobarCobro(cobro.id, jefe.id))).rejects.toBeInstanceOf(ErrorValidacion);
    await expect(comoEmpresa(empresaId, () => rechazarCobro(cobro.id, jefe.id))).rejects.toBeInstanceOf(ErrorValidacion);
    expect(await comoEmpresa(empresaId, () => obtenerSaldo(emp.id))).toBe(80); // sin segundo débito: 200 − 120
  });

  it('no se puede pagar un cobro que no está aprobado (p. ej. pendiente)', async () => {
    const empresaId = await crearEmpresaConCobro();
    const emp = await crearEmpleadoConSaldo(empresaId, 200);
    const admin = await nuevoUsuarioJefe();
    const cobro = await comoEmpresa(empresaId, () => solicitarCobro({ empleadoId: emp.id, monto: 120 })); // pendiente
    await expect(comoEmpresa(empresaId, () => pagarCobro(cobro.id, admin.id))).rejects.toBeInstanceOf(ErrorValidacion);
  });

  it('una segunda solicitud que excede el disponible por lo ya comprometido se rechaza (over-commit)', async () => {
    const empresaId = await crearEmpresaConCobro();
    const emp = await crearEmpleadoConSaldo(empresaId, 200); // 80% → 160 adelantable
    const primera = await comoEmpresa(empresaId, () => solicitarCobro({ empleadoId: emp.id, monto: 120 })); // pendiente, compromete 120
    expect(primera.estado).toBe('pendiente');

    // Disponible ahora: 160 − 120 = 40. Pedir 50 excede.
    const error = await capturarError(comoEmpresa(empresaId, () => solicitarCobro({ empleadoId: emp.id, monto: 50 })));
    expect(error).toBeInstanceOf(ErrorValidacion);
    expect((error as Error).message).toMatch(/excede tu monto adelantable/);

    // ausencia ("no se creó la segunda solicitud"): semilla god-view sobre el empleado
    // de esta empresa → sigue habiendo una sola en NINGÚN lado.
    const solicitudes = await semilla().solicitudCobro.count({ where: { empleadoId: emp.id } });
    expect(solicitudes).toBe(1);
    expect(await comoEmpresa(empresaId, () => obtenerSaldo(emp.id))).toBe(200); // saldo intacto (la pendiente no debita)
  });
});

describe('cobro: guardas de configuración y categoría (B12, B13)', () => {
  it('pagarCobro sin categoría de pago-empleado activa lanza ErrorValidacion y no escribe nada', async () => {
    const empresaId = await crearEmpresaConCobro();
    const emp = await crearEmpleadoConSaldo(empresaId, 200);
    const admin = await nuevoUsuarioJefe();
    const cobro = await comoEmpresa(empresaId, () => solicitarCobro({ empleadoId: emp.id, monto: 50 })); // ≤ umbral 100 → nace 'aprobada'
    expect(cobro.estado).toBe('aprobada');

    // Desactivar las categorías pago-empleado activas DE ESTA EMPRESA (el guard usa
    // findFirst bajo RLS; al crear empresa propia ya no hay contaminación cruzada,
    // pero igual acotamos por empresaId). Vía semilla (arrange/teardown del fixture).
    const activas = await semilla().categoriaGasto.findMany({
      where: { empresaId, esPagoEmpleado: true, activo: true },
      select: { id: true },
    });
    const ids = activas.map((c) => c.id);
    await semilla().categoriaGasto.updateMany({ where: { id: { in: ids } }, data: { activo: false } });
    try {
      // Anclar el mensaje fija QUÉ ErrorValidacion es (el del guard de categoría): un
      // ErrorValidacion previo añadido en un refactor futuro no pasaría desapercibido.
      const error = await capturarError(comoEmpresa(empresaId, () => pagarCobro(cobro.id, admin.id)));
      expect(error).toBeInstanceOf(ErrorValidacion);
      expect((error as Error).message).toMatch(/categoría/);
      // El guard corta ANTES de toda escritura: la solicitud sigue 'aprobada' (no quedó 'pagada')…
      // ausencia/no-mutación → semilla god-view.
      const sol = await semilla().solicitudCobro.findUnique({ where: { id: cobro.id } });
      expect(sol?.estado).toBe('aprobada');
      // …y NO se creó ningún Gasto ligado a la solicitud.
      expect(await semilla().gasto.count({ where: { referenciaOrigen: cobro.id } })).toBe(0);
    } finally {
      // Restaurar exactamente las que estaban activas, DENTRO del propio it: si un expect falla
      // a mitad, el finally restaura igual y no contamina los tests/archivos siguientes.
      await semilla().categoriaGasto.updateMany({ where: { id: { in: ids } }, data: { activo: true } });
    }
  });

  it('definirConfiguracionCobro rechaza % fuera de 0-100 y umbral negativo sin tocar la fila', async () => {
    const empresaId = await crearEmpresaConCobro();
    // La config la siembra crearEmpresaConCobro (80/100). Leemos el estado previo
    // bajo comoEmpresa con el propio servicio… pero como aquí la lectura positiva es
    // de la propia fila del tenant, la tomamos vía semilla acotada por empresaId.
    const antes = await semilla().configuracionCobro.findFirst({ where: { empresaId } });
    expect(antes).not.toBeNull();

    await expect(comoEmpresa(empresaId, () => definirConfiguracionCobro({ porcentajeCobrable: -1 }))).rejects.toBeInstanceOf(ErrorValidacion);
    await expect(comoEmpresa(empresaId, () => definirConfiguracionCobro({ porcentajeCobrable: 101 }))).rejects.toBeInstanceOf(ErrorValidacion);
    await expect(comoEmpresa(empresaId, () => definirConfiguracionCobro({ umbralAprobacion: -1 }))).rejects.toBeInstanceOf(ErrorValidacion);

    // La validación corre antes de tocar la BD: la fila única no cambió (no-mutación → semilla god-view).
    const despues = await semilla().configuracionCobro.findFirst({ where: { empresaId } });
    expect(despues?.id).toBe(antes?.id);
    expect(despues?.porcentajeCobrable).toBe(antes?.porcentajeCobrable);
    expect(Number(despues?.umbralAprobacion)).toBe(Number(antes?.umbralAprobacion));
  });

  it('definirConfiguracionCobro acepta los bordes válidos (0 y 100 de porcentaje, umbral 0)', async () => {
    const empresaId = await crearEmpresaConCobro();
    // Ancla los operadores estrictos del guard por el lado de la aceptación: un
    // endurecimiento (`<` → `<=` / `>` → `>=`) rechazaría 0/100 y pondría esto en rojo.
    // positivo: se asienta sobre el VALOR DE RETORNO del servicio (no lee DB).
    const enCero = await comoEmpresa(empresaId, () => definirConfiguracionCobro({ porcentajeCobrable: 0, umbralAprobacion: 0 }));
    expect(enCero.porcentajeCobrable).toBe(0);
    expect(Number(enCero.umbralAprobacion)).toBe(0);

    const enCien = await comoEmpresa(empresaId, () => definirConfiguracionCobro({ porcentajeCobrable: 100 }));
    expect(enCien.porcentajeCobrable).toBe(100);
    // Nota: ya no hace falta restaurar la config a 80/100 — cada test usa su propia
    // empresa, así que mutar esta config no afecta a otros tests.
  });
});

describe('cobro: las acciones devuelven la relación empleado (regresión front)', () => {
  // El front reemplaza la fila de la lista con la respuesta de aprobar/pagar/
  // rechazar y luego renderiza `cobro.empleado.nombre`. Si la respuesta no trae
  // `empleado` (como GET /cobros), la pantalla rompe. Anclamos que las tres
  // acciones incluyen empleado { numero, nombre }.
  it('aprobarCobro devuelve empleado { numero, nombre }', async () => {
    const empresaId = await crearEmpresaConCobro();
    const emp = await crearEmpleadoConSaldo(empresaId, 200);
    const jefe = await nuevoUsuarioJefe();
    const cobro = await comoEmpresa(empresaId, () => solicitarCobro({ empleadoId: emp.id, monto: 120 })); // pendiente
    const aprobado = await comoEmpresa(empresaId, () => aprobarCobro(cobro.id, jefe.id));
    expect(aprobado.empleado).toBeDefined();
    expect(aprobado.empleado?.numero).toBe(emp.numero);
    expect(aprobado.empleado?.nombre).toBe(emp.nombre);
  });

  it('rechazarCobro devuelve empleado { numero, nombre }', async () => {
    const empresaId = await crearEmpresaConCobro();
    const emp = await crearEmpleadoConSaldo(empresaId, 200);
    const jefe = await nuevoUsuarioJefe();
    const cobro = await comoEmpresa(empresaId, () => solicitarCobro({ empleadoId: emp.id, monto: 120 })); // pendiente
    const rechazado = await comoEmpresa(empresaId, () => rechazarCobro(cobro.id, jefe.id, 'sin presupuesto'));
    expect(rechazado.empleado).toBeDefined();
    expect(rechazado.empleado?.numero).toBe(emp.numero);
    expect(rechazado.empleado?.nombre).toBe(emp.nombre);
  });

  it('pagarCobro devuelve empleado { numero, nombre }', async () => {
    const empresaId = await crearEmpresaConCobro();
    const emp = await crearEmpleadoConSaldo(empresaId, 200);
    const admin = await nuevoUsuarioJefe();
    const cobro = await comoEmpresa(empresaId, () => solicitarCobro({ empleadoId: emp.id, monto: 50 })); // ≤ umbral → aprobada
    const pagado = await comoEmpresa(empresaId, () => pagarCobro(cobro.id, admin.id));
    expect(pagado.empleado).toBeDefined();
    expect(pagado.empleado?.numero).toBe(emp.numero);
    expect(pagado.empleado?.nombre).toBe(emp.nombre);
  });
});
