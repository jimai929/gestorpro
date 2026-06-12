import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/core/prisma.js';
import {
  crearProveedor,
  editarProveedor,
  listarProveedores,
  registrarCompra,
  registrarPago,
  listarCuentasPorPagar,
} from '../../src/finanzas/cuentas-por-pagar/cuentas-por-pagar.service.js';
import { gananciaDelPeriodo } from '../../src/finanzas/dashboard/dashboard.service.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorValidacion } from '../../src/core/errors.js';

let contador = 0;

async function nuevaSede() {
  contador += 1;
  return prisma.sede.create({ data: { nombre: `SedeCXP ${contador}` } });
}

async function nuevoUsuario() {
  contador += 1;
  return prisma.usuario.create({
    data: {
      nombre: 'Usuario CXP',
      email: `cxp${contador}@gestorpro.local`,
      rol: 'administrador',
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

describe('proveedores (alta, edición con contacto, baja lógica)', () => {
  it('da de alta un proveedor con teléfono y persona de contacto', async () => {
    const prov = await crearProveedor({
      nombre: 'Distribuidora Demo',
      identificacionFiscal: 'RUC-8-000-111',
      telefono: '6000-1234',
      personaContacto: 'Juan Pérez',
    });
    expect(prov.nombre).toBe('Distribuidora Demo');
    expect(prov.identificacionFiscal).toBe('RUC-8-000-111');
    expect(prov.telefono).toBe('6000-1234');
    expect(prov.personaContacto).toBe('Juan Pérez');
    expect(prov.activo).toBe(true);
  });

  it('edita los datos de contacto de un proveedor', async () => {
    const prov = await crearProveedor({ nombre: 'Proveedor Editable' });
    const editado = await editarProveedor(prov.id, {
      telefono: '200-5555',
      personaContacto: 'Ana Gómez',
      identificacionFiscal: 'RUC-2-222-333',
    });
    expect(editado.telefono).toBe('200-5555');
    expect(editado.personaContacto).toBe('Ana Gómez');
    expect(editado.identificacionFiscal).toBe('RUC-2-222-333');
    expect(editado.nombre).toBe('Proveedor Editable'); // sin tocar
  });

  it('la baja lógica desactiva sin borrar y lo saca de la lista de activos', async () => {
    const prov = await crearProveedor({ nombre: `Baja ${contador}` });

    const baja = await editarProveedor(prov.id, { activo: false });
    expect(baja.activo).toBe(false);

    // Sigue existiendo (no se borró).
    const enBase = await prisma.proveedor.findUnique({ where: { id: prov.id } });
    expect(enBase).not.toBeNull();

    // No aparece entre los activos; sí en la lista completa.
    const activos = await listarProveedores({ soloActivos: true });
    expect(activos.some((p) => p.id === prov.id)).toBe(false);
    const todos = await listarProveedores();
    expect(todos.some((p) => p.id === prov.id)).toBe(true);

    // Reactivación.
    const alta = await editarProveedor(prov.id, { activo: true });
    expect(alta.activo).toBe(true);
  });

  it('editar un proveedor inexistente lanza ErrorNoEncontrado', async () => {
    await expect(
      editarProveedor('00000000-0000-0000-0000-000000000000', { nombre: 'X' }),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
  });
});

describe('compras contado vs crédito', () => {
  it('la compra de contado NO aparece en cuentas por pagar; la de crédito SÍ', async () => {
    const sede = await nuevaSede();
    const prov = await crearProveedor({ nombre: `Prov ${contador}` });
    const base = { proveedorId: prov.id, sedeId: sede.id, montoTotal: 500, fechaEmision: '2026-05-10' };

    await registrarCompra({ ...base, numeroFactura: 'CONT-1', tipo: 'contado' });
    await registrarCompra({
      ...base, numeroFactura: 'CRED-1', tipo: 'credito', fechaVencimiento: '2026-06-10',
    });

    const cuentas = await listarCuentasPorPagar({ sedeId: sede.id });
    expect(cuentas).toHaveLength(1);
    expect(cuentas[0]?.numeroFactura).toBe('CRED-1');
    expect(cuentas[0]?.saldo).toBe(500);
  });

  it('una compra a crédito sin fecha de vencimiento se rechaza', async () => {
    const sede = await nuevaSede();
    const prov = await crearProveedor({ nombre: `Prov ${contador}` });
    await expect(
      registrarCompra({
        proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'CRED-X',
        montoTotal: 100, tipo: 'credito', fechaEmision: '2026-05-10',
      }),
    ).rejects.toBeInstanceOf(ErrorValidacion);
  });

  it('rechaza una compra con montoTotal cero o negativo sin crear la fila', async () => {
    const sede = await nuevaSede();
    const prov = await crearProveedor({ nombre: `Prov monto ${contador}` });
    const base = { proveedorId: prov.id, sedeId: sede.id, fechaEmision: '2026-05-20' };
    await expect(
      registrarCompra({ ...base, numeroFactura: 'MONTO-0', montoTotal: 0, tipo: 'contado' }),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    await expect(
      registrarCompra({ ...base, numeroFactura: 'MONTO-NEG', montoTotal: -50, tipo: 'credito', fechaVencimiento: '2026-06-20' }),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    // El guard corta antes del create: no existe ninguna compra de este proveedor.
    expect(await prisma.compra.findMany({ where: { proveedorId: prov.id } })).toHaveLength(0);
  });

  it('rechaza un abono contra una compra de contado (pago invisible en la vista)', async () => {
    const sede = await nuevaSede();
    const prov = await crearProveedor({ nombre: `Prov ${contador}` });
    const usuario = await prisma.usuario.create({
      data: { nombre: 'T', email: `pago${contador}@gestorpro.local`, rol: 'administrador', passwordHash: 'x' },
    });
    const compra = await registrarCompra({
      proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'CONT-PAGO',
      montoTotal: 200, tipo: 'contado', fechaEmision: '2026-05-13',
    });
    await expect(
      registrarPago({ compraId: compra.id, monto: 50, usuarioId: usuario.id }),
    ).rejects.toBeInstanceOf(ErrorValidacion);
  });

  it('el contado guarda tipo contado y sin vencimiento', async () => {
    const sede = await nuevaSede();
    const prov = await crearProveedor({ nombre: `Prov ${contador}` });
    const compra = await registrarCompra({
      proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'CONT-2',
      montoTotal: 80, tipo: 'contado', fechaEmision: '2026-05-11',
    });
    expect(compra.tipo).toBe('contado');
    expect(compra.fechaVencimiento).toBeNull();
  });

  it('tanto contado como crédito cuentan como costo (compras) en el dashboard', async () => {
    const sede = await nuevaSede();
    const prov = await crearProveedor({ nombre: `Prov ${contador}` });
    const fecha = '2026-05-12';
    await registrarCompra({
      proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'D-CONT',
      montoTotal: 300, tipo: 'contado', fechaEmision: fecha,
    });
    await registrarCompra({
      proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'D-CRED',
      montoTotal: 700, tipo: 'credito', fechaEmision: fecha, fechaVencimiento: '2026-06-12',
    });

    const resumen = await gananciaDelPeriodo({ desde: fecha, hasta: fecha, sedeId: sede.id });
    // Las dos compras suman como costo, sin importar el tipo.
    expect(resumen.compras).toBe(1000);
    expect(resumen.ganancia).toBe(-1000); // sin ventas ni gastos en esta sede
  });
});

describe('alta de compra: factura duplicada (P2002 → ErrorConflicto)', () => {
  it('rechaza una factura repetida (mismo proveedor + número) y no crea una segunda', async () => {
    const sede = await nuevaSede();
    const prov = await crearProveedor({ nombre: `Prov dup ${contador}` });
    const datos = {
      proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'DUP-001',
      montoTotal: 250, tipo: 'credito' as const, fechaEmision: '2026-05-14',
      fechaVencimiento: '2026-06-14',
    };
    await registrarCompra(datos);

    const error = await capturarError(registrarCompra(datos));
    expect(error).toBeInstanceOf(ErrorConflicto);
    expect((error as Error).message).toMatch(/DUP-001/);

    // La segunda alta no creó otra compra: sigue habiendo exactamente una.
    const compras = await prisma.compra.findMany({
      where: { proveedorId: prov.id, numeroFactura: 'DUP-001' },
    });
    expect(compras).toHaveLength(1);
  });
});

describe('pagos / abonos: saldo, sobrepago y compra inexistente', () => {
  it('registra un abono dentro del saldo y actualiza el saldo (camino feliz)', async () => {
    const sede = await nuevaSede();
    const prov = await crearProveedor({ nombre: `Prov pago ${contador}` });
    const usuario = await nuevoUsuario();
    const compra = await registrarCompra({
      proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'PAGO-OK',
      montoTotal: 1000, tipo: 'credito', fechaEmision: '2026-05-15',
      fechaVencimiento: '2026-06-15',
    });

    const pago = await registrarPago({ compraId: compra.id, monto: 400, usuarioId: usuario.id });
    expect(Number(pago.monto)).toBe(400);
    expect(pago.tipo).toBe('normal');
    expect(pago.compraId).toBe(compra.id);

    const [cuenta] = await listarCuentasPorPagar({ sedeId: sede.id });
    expect(cuenta?.compraId).toBe(compra.id);
    expect(cuenta?.totalPagado).toBe(400);
    expect(cuenta?.saldo).toBe(600);
    expect(cuenta?.estado).toBe('parcial');
  });

  it('rechaza un sobrepago (excede el saldo): no crea el pago ni mueve el saldo', async () => {
    const sede = await nuevaSede();
    const prov = await crearProveedor({ nombre: `Prov sobrepago ${contador}` });
    const usuario = await nuevoUsuario();
    const compra = await registrarCompra({
      proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'PAGO-EXC',
      montoTotal: 1000, tipo: 'credito', fechaEmision: '2026-05-16',
      fechaVencimiento: '2026-06-16',
    });

    // Un primer abono deja el saldo en 600.
    await registrarPago({ compraId: compra.id, monto: 400, usuarioId: usuario.id });

    // El segundo abono (700) excede el saldo pendiente (600): debe rechazarse.
    const error = await capturarError(
      registrarPago({ compraId: compra.id, monto: 700, usuarioId: usuario.id }),
    );
    expect(error).toBeInstanceOf(ErrorValidacion);
    expect((error as Error).message).toMatch(/excede el saldo/);

    // No se creó el segundo pago: sigue habiendo exactamente uno.
    const pagos = await prisma.pagoProveedor.count({ where: { compraId: compra.id } });
    expect(pagos).toBe(1);

    // El saldo no se movió: sigue en 600.
    const [cuenta] = await listarCuentasPorPagar({ sedeId: sede.id });
    expect(cuenta?.totalPagado).toBe(400);
    expect(cuenta?.saldo).toBe(600);
  });

  it('acepta el pago exacto del saldo y deja la cuenta en estado pagado con saldo 0', async () => {
    const sede = await nuevaSede();
    const prov = await crearProveedor({ nombre: `Prov saldo exacto ${contador}` });
    const usuario = await nuevoUsuario();
    const compra = await registrarCompra({
      proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'PAGO-EXACTO',
      montoTotal: 1000, tipo: 'credito', fechaEmision: '2026-05-17',
      fechaVencimiento: '2026-06-17',
    });
    await registrarPago({ compraId: compra.id, monto: 400, usuarioId: usuario.id });

    // monto === saldo (600): se ACEPTA (el guard usa > estricto).
    const pago = await registrarPago({ compraId: compra.id, monto: 600, usuarioId: usuario.id });
    expect(Number(pago.monto)).toBe(600);

    const [cuenta] = await listarCuentasPorPagar({ sedeId: sede.id });
    expect(cuenta?.totalPagado).toBe(1000);
    expect(cuenta?.saldo).toBe(0);
    expect(cuenta?.estado).toBe('pagado'); // 'pagado', no 'pagada' (vista, migración 20260529130000:30)

    // La cuenta saldada ya no admite ni un centavo más.
    await expect(
      registrarPago({ compraId: compra.id, monto: 1, usuarioId: usuario.id }),
    ).rejects.toBeInstanceOf(ErrorValidacion);
  });

  it('dos abonos concurrentes que juntos exceden el saldo: el FOR UPDATE deja pasar exactamente uno', async () => {
    const sede = await nuevaSede();
    const prov = await crearProveedor({ nombre: `Prov concurrente ${contador}` });
    const usuario = await nuevoUsuario();
    const compra = await registrarCompra({
      proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'PAGO-CONC',
      montoTotal: 1000, tipo: 'credito', fechaEmision: '2026-05-18',
      fechaVencimiento: '2026-06-18',
    });

    // Cada pago de 600 cabe solo (600 <= 1000) pero juntos exceden (1200 > 1000).
    const resultados = await Promise.allSettled([
      registrarPago({ compraId: compra.id, monto: 600, usuarioId: usuario.id }),
      registrarPago({ compraId: compra.id, monto: 600, usuarioId: usuario.id }),
    ]);
    const exitosos = resultados.filter((r) => r.status === 'fulfilled');
    const fallidos = resultados.filter((r) => r.status === 'rejected');
    expect(exitosos).toHaveLength(1);
    expect(fallidos).toHaveLength(1);
    expect((fallidos[0] as PromiseRejectedResult).reason).toBeInstanceOf(ErrorValidacion);
    expect(((fallidos[0] as PromiseRejectedResult).reason as Error).message).toMatch(/excede el saldo/);

    // Persistencia: exactamente un pago de 600; el saldo nunca quedó negativo.
    const agg = await prisma.pagoProveedor.aggregate({ _sum: { monto: true }, where: { compraId: compra.id } });
    expect(Number(agg._sum.monto)).toBe(600);
    expect(await prisma.pagoProveedor.count({ where: { compraId: compra.id } })).toBe(1);
    const [cuenta] = await listarCuentasPorPagar({ sedeId: sede.id });
    expect(cuenta?.totalPagado).toBe(600);
    expect(cuenta?.saldo).toBe(400);
  });

  it('rechaza un pago a una compra inexistente: ErrorNoEncontrado, sin crear pago', async () => {
    const usuario = await nuevoUsuario();
    const compraIdInexistente = '00000000-0000-0000-0000-000000000000';

    const error = await capturarError(
      registrarPago({ compraId: compraIdInexistente, monto: 100, usuarioId: usuario.id }),
    );
    expect(error).toBeInstanceOf(ErrorNoEncontrado);

    const pagos = await prisma.pagoProveedor.count({ where: { compraId: compraIdInexistente } });
    expect(pagos).toBe(0);
  });
});

describe('alta de compra: proveedor o sede inexistente (P2003 → ErrorValidacion)', () => {
  it('rechaza una compra con proveedor o sede inexistente', async () => {
    const sede = await nuevaSede();
    const prov = await crearProveedor({ nombre: `Prov fk ${contador}` });
    const idInexistente = '00000000-0000-0000-0000-000000000000';

    // Proveedor inexistente (sede real).
    const errProv = await capturarError(
      registrarCompra({
        proveedorId: idInexistente, sedeId: sede.id, numeroFactura: 'FK-PROV',
        montoTotal: 100, tipo: 'contado', fechaEmision: '2026-05-18',
      }),
    );
    expect(errProv).toBeInstanceOf(ErrorValidacion);
    expect((errProv as Error).message).toMatch(/no existen/);
    // El rollback dejó la tabla intacta: no se creó la compra.
    expect(await prisma.compra.findMany({ where: { numeroFactura: 'FK-PROV' } })).toHaveLength(0);

    // Sede inexistente (proveedor real).
    const errSede = await capturarError(
      registrarCompra({
        proveedorId: prov.id, sedeId: idInexistente, numeroFactura: 'FK-SEDE',
        montoTotal: 100, tipo: 'contado', fechaEmision: '2026-05-18',
      }),
    );
    expect(errSede).toBeInstanceOf(ErrorValidacion);
    expect((errSede as Error).message).toMatch(/no existen/);
    expect(await prisma.compra.findMany({ where: { numeroFactura: 'FK-SEDE' } })).toHaveLength(0);
  });
});
