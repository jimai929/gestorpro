import { describe, it, expect } from 'vitest';
import { semilla, comoEmpresa, crearEmpresa } from '../helpers/db.js';
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

async function nuevaSede(empresaId: string) {
  contador += 1;
  // Fixture: sede es tabla directa (empresa_id NOT NULL) → semilla con empresaId explícito.
  return semilla().sede.create({ data: { nombre: `SedeCXP ${contador}`, empresaId } });
}

async function nuevoUsuario() {
  contador += 1;
  // Fixture: usuario está EXCLUIDO de RLS (sin empresa_id) → semilla sin empresaId.
  return semilla().usuario.create({
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
    const empresaId = await crearEmpresa();
    const prov = await comoEmpresa(empresaId, () =>
      crearProveedor({
        nombre: 'Distribuidora Demo',
        identificacionFiscal: 'RUC-8-000-111',
        telefono: '6000-1234',
        personaContacto: 'Juan Pérez',
      }),
    );
    expect(prov.nombre).toBe('Distribuidora Demo');
    expect(prov.identificacionFiscal).toBe('RUC-8-000-111');
    expect(prov.telefono).toBe('6000-1234');
    expect(prov.personaContacto).toBe('Juan Pérez');
    expect(prov.activo).toBe(true);
  });

  it('edita los datos de contacto de un proveedor', async () => {
    const empresaId = await crearEmpresa();
    const prov = await comoEmpresa(empresaId, () =>
      crearProveedor({ nombre: 'Proveedor Editable' }),
    );
    const editado = await comoEmpresa(empresaId, () =>
      editarProveedor(prov.id, {
        telefono: '200-5555',
        personaContacto: 'Ana Gómez',
        identificacionFiscal: 'RUC-2-222-333',
      }),
    );
    expect(editado.telefono).toBe('200-5555');
    expect(editado.personaContacto).toBe('Ana Gómez');
    expect(editado.identificacionFiscal).toBe('RUC-2-222-333');
    expect(editado.nombre).toBe('Proveedor Editable'); // sin tocar
  });

  it('la baja lógica desactiva sin borrar y lo saca de la lista de activos', async () => {
    const empresaId = await crearEmpresa();
    const prov = await comoEmpresa(empresaId, () =>
      crearProveedor({ nombre: `Baja ${contador}` }),
    );

    const baja = await comoEmpresa(empresaId, () =>
      editarProveedor(prov.id, { activo: false }),
    );
    expect(baja.activo).toBe(false);

    // Sigue existiendo (no se borró) → god-view semilla: prueba que la fila no se eliminó.
    const enBase = await semilla().proveedor.findUnique({ where: { id: prov.id } });
    expect(enBase).not.toBeNull();

    // No aparece entre los activos; sí en la lista completa.
    const activos = await comoEmpresa(empresaId, () => listarProveedores({ soloActivos: true }));
    expect(activos.some((p) => p.id === prov.id)).toBe(false);
    const todos = await comoEmpresa(empresaId, () => listarProveedores());
    expect(todos.some((p) => p.id === prov.id)).toBe(true);

    // Reactivación.
    const alta = await comoEmpresa(empresaId, () =>
      editarProveedor(prov.id, { activo: true }),
    );
    expect(alta.activo).toBe(true);
  });

  it('editar un proveedor inexistente lanza ErrorNoEncontrado', async () => {
    const empresaId = await crearEmpresa();
    await expect(
      comoEmpresa(empresaId, () =>
        editarProveedor('00000000-0000-0000-0000-000000000000', { nombre: 'X' }),
      ),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
  });
});

describe('deuda total por proveedor (en la lista de proveedores)', () => {
  it('A debe el crédito impago, B debe 0 (sin compras), C debe el saldo tras un abono', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const usuario = await nuevoUsuario();
    const provA = await comoEmpresa(empresaId, () => crearProveedor({ nombre: `DeudaA ${contador}` }));
    const provB = await comoEmpresa(empresaId, () => crearProveedor({ nombre: `DeudaB ${contador}` }));
    const provC = await comoEmpresa(empresaId, () => crearProveedor({ nombre: `DeudaC ${contador}` }));

    // A: crédito 1100, impago → debe 1100.
    await comoEmpresa(empresaId, () =>
      registrarCompra({
        proveedorId: provA.id, sedeId: sede.id, numeroFactura: 'DA-1', montoTotal: 1100,
        tipo: 'credito', fechaEmision: '2026-05-01', fechaVencimiento: '2026-06-01',
      }),
    );
    // C: crédito 1000, abona 400 → debe 600.
    const compraC = await comoEmpresa(empresaId, () =>
      registrarCompra({
        proveedorId: provC.id, sedeId: sede.id, numeroFactura: 'DC-1', montoTotal: 1000,
        tipo: 'credito', fechaEmision: '2026-05-01', fechaVencimiento: '2026-06-01',
      }),
    );
    await comoEmpresa(empresaId, () =>
      registrarPago({ compraId: compraC.id, monto: 400, usuarioId: usuario.id }),
    );
    // B: sin compras → debe 0.

    const lista = await comoEmpresa(empresaId, () => listarProveedores());
    const deuda = new Map(lista.map((p) => [p.id, p.deudaTotal]));
    expect(deuda.get(provA.id)).toBe(1100);
    expect(deuda.get(provB.id)).toBe(0);
    expect(deuda.get(provC.id)).toBe(600);
  });

  it('una compra de CONTADO no genera deuda', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const prov = await comoEmpresa(empresaId, () => crearProveedor({ nombre: `Contado ${contador}` }));
    await comoEmpresa(empresaId, () =>
      registrarCompra({
        proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'CT-1', montoTotal: 700,
        tipo: 'contado', fechaEmision: '2026-05-01',
      }),
    );
    const lista = await comoEmpresa(empresaId, () => listarProveedores());
    expect(lista.find((p) => p.id === prov.id)?.deudaTotal).toBe(0);
  });

  it('la deuda NO cruza empresas: cada tenant solo suma la suya', async () => {
    const empresaA = await crearEmpresa();
    const empresaB = await crearEmpresa();
    const sedeA = await nuevaSede(empresaA);
    const provA = await comoEmpresa(empresaA, () => crearProveedor({ nombre: `AisladoA ${contador}` }));
    await comoEmpresa(empresaA, () =>
      registrarCompra({
        proveedorId: provA.id, sedeId: sedeA.id, numeroFactura: 'AIS-1', montoTotal: 900,
        tipo: 'credito', fechaEmision: '2026-05-01', fechaVencimiento: '2026-06-01',
      }),
    );
    // Empresa B no ve al proveedor de A ni su deuda.
    const listaB = await comoEmpresa(empresaB, () => listarProveedores());
    expect(listaB.some((p) => p.id === provA.id)).toBe(false);
    // Empresa A sí ve su propia deuda.
    const listaA = await comoEmpresa(empresaA, () => listarProveedores());
    expect(listaA.find((p) => p.id === provA.id)?.deudaTotal).toBe(900);
  });
});

describe('compras contado vs crédito', () => {
  it('la compra de contado NO aparece en cuentas por pagar; la de crédito SÍ', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const prov = await comoEmpresa(empresaId, () => crearProveedor({ nombre: `Prov ${contador}` }));
    const base = { proveedorId: prov.id, sedeId: sede.id, montoTotal: 500, fechaEmision: '2026-05-10' };

    await comoEmpresa(empresaId, () =>
      registrarCompra({ ...base, numeroFactura: 'CONT-1', tipo: 'contado' }),
    );
    await comoEmpresa(empresaId, () =>
      registrarCompra({
        ...base, numeroFactura: 'CRED-1', tipo: 'credito', fechaVencimiento: '2026-06-10',
      }),
    );

    const cuentas = await comoEmpresa(empresaId, () => listarCuentasPorPagar({ sedeId: sede.id }));
    expect(cuentas).toHaveLength(1);
    expect(cuentas[0]?.numeroFactura).toBe('CRED-1');
    expect(cuentas[0]?.saldo).toBe(500);
  });

  it('una compra a crédito sin fecha de vencimiento se rechaza', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const prov = await comoEmpresa(empresaId, () => crearProveedor({ nombre: `Prov ${contador}` }));
    await expect(
      comoEmpresa(empresaId, () =>
        registrarCompra({
          proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'CRED-X',
          montoTotal: 100, tipo: 'credito', fechaEmision: '2026-05-10',
        }),
      ),
    ).rejects.toBeInstanceOf(ErrorValidacion);
  });

  it('rechaza una compra con montoTotal cero o negativo sin crear la fila', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const prov = await comoEmpresa(empresaId, () =>
      crearProveedor({ nombre: `Prov monto ${contador}` }),
    );
    const base = { proveedorId: prov.id, sedeId: sede.id, fechaEmision: '2026-05-20' };
    await expect(
      comoEmpresa(empresaId, () =>
        registrarCompra({ ...base, numeroFactura: 'MONTO-0', montoTotal: 0, tipo: 'contado' }),
      ),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    await expect(
      comoEmpresa(empresaId, () =>
        registrarCompra({ ...base, numeroFactura: 'MONTO-NEG', montoTotal: -50, tipo: 'credito', fechaVencimiento: '2026-06-20' }),
      ),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    // Ausencia (el guard corta antes del create) → god-view semilla: no existe la compra en ningún lado.
    expect(await semilla().compra.findMany({ where: { proveedorId: prov.id } })).toHaveLength(0);
  });

  it('rechaza un abono contra una compra de contado (pago invisible en la vista)', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const prov = await comoEmpresa(empresaId, () => crearProveedor({ nombre: `Prov ${contador}` }));
    const usuario = await nuevoUsuario();
    const compra = await comoEmpresa(empresaId, () =>
      registrarCompra({
        proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'CONT-PAGO',
        montoTotal: 200, tipo: 'contado', fechaEmision: '2026-05-13',
      }),
    );
    await expect(
      comoEmpresa(empresaId, () =>
        registrarPago({ compraId: compra.id, monto: 50, usuarioId: usuario.id }),
      ),
    ).rejects.toBeInstanceOf(ErrorValidacion);
  });

  it('el contado guarda tipo contado y sin vencimiento', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const prov = await comoEmpresa(empresaId, () => crearProveedor({ nombre: `Prov ${contador}` }));
    const compra = await comoEmpresa(empresaId, () =>
      registrarCompra({
        proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'CONT-2',
        montoTotal: 80, tipo: 'contado', fechaEmision: '2026-05-11',
      }),
    );
    expect(compra.tipo).toBe('contado');
    expect(compra.fechaVencimiento).toBeNull();
  });

  it('ambas cuentan en "compras registradas"; la ganancia es de CAJA (solo lo pagado)', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const prov = await comoEmpresa(empresaId, () => crearProveedor({ nombre: `Prov ${contador}` }));
    const fecha = '2026-05-12';
    await comoEmpresa(empresaId, () =>
      registrarCompra({
        proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'D-CONT',
        montoTotal: 300, tipo: 'contado', fechaEmision: fecha,
      }),
    );
    await comoEmpresa(empresaId, () =>
      registrarCompra({
        proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'D-CRED',
        montoTotal: 700, tipo: 'credito', fechaEmision: fecha, fechaVencimiento: '2026-06-12',
      }),
    );

    const resumen = await comoEmpresa(empresaId, () =>
      gananciaDelPeriodo({ desde: fecha, hasta: fecha, sedeId: sede.id }),
    );
    // Compras REGISTRADAS: ambas suman por devengado, sin importar el tipo (informativo).
    expect(resumen.compras).toBe(1000);
    // Egreso REAL: solo el contado (300) salió de caja; el crédito impago (700) es deuda.
    expect(resumen.pagosProveedor).toBe(300);
    expect(resumen.ganancia).toBe(-300); // caja: 0 ventas − 300 egreso − 0 gastos
  });
});

describe('alta de compra: factura duplicada (P2002 → ErrorConflicto)', () => {
  it('rechaza una factura repetida (mismo proveedor + número) y no crea una segunda', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const prov = await comoEmpresa(empresaId, () => crearProveedor({ nombre: `Prov dup ${contador}` }));
    const datos = {
      proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'DUP-001',
      montoTotal: 250, tipo: 'credito' as const, fechaEmision: '2026-05-14',
      fechaVencimiento: '2026-06-14',
    };
    await comoEmpresa(empresaId, () => registrarCompra(datos));

    const error = await capturarError(comoEmpresa(empresaId, () => registrarCompra(datos)));
    expect(error).toBeInstanceOf(ErrorConflicto);
    expect((error as Error).message).toMatch(/DUP-001/);

    // La segunda alta no creó otra compra → god-view semilla: exactamente una en todo el sistema.
    const compras = await semilla().compra.findMany({
      where: { proveedorId: prov.id, numeroFactura: 'DUP-001' },
    });
    expect(compras).toHaveLength(1);
  });
});

describe('pagos / abonos: saldo, sobrepago y compra inexistente', () => {
  it('registra un abono dentro del saldo y actualiza el saldo (camino feliz)', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const prov = await comoEmpresa(empresaId, () => crearProveedor({ nombre: `Prov pago ${contador}` }));
    const usuario = await nuevoUsuario();
    const compra = await comoEmpresa(empresaId, () =>
      registrarCompra({
        proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'PAGO-OK',
        montoTotal: 1000, tipo: 'credito', fechaEmision: '2026-05-15',
        fechaVencimiento: '2026-06-15',
      }),
    );

    const pago = await comoEmpresa(empresaId, () =>
      registrarPago({ compraId: compra.id, monto: 400, usuarioId: usuario.id }),
    );
    expect(Number(pago.monto)).toBe(400);
    expect(pago.tipo).toBe('normal');
    expect(pago.compraId).toBe(compra.id);

    const [cuenta] = await comoEmpresa(empresaId, () => listarCuentasPorPagar({ sedeId: sede.id }));
    expect(cuenta?.compraId).toBe(compra.id);
    expect(cuenta?.totalPagado).toBe(400);
    expect(cuenta?.saldo).toBe(600);
    expect(cuenta?.estado).toBe('parcial');
  });

  it('rechaza un sobrepago (excede el saldo): no crea el pago ni mueve el saldo', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const prov = await comoEmpresa(empresaId, () => crearProveedor({ nombre: `Prov sobrepago ${contador}` }));
    const usuario = await nuevoUsuario();
    const compra = await comoEmpresa(empresaId, () =>
      registrarCompra({
        proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'PAGO-EXC',
        montoTotal: 1000, tipo: 'credito', fechaEmision: '2026-05-16',
        fechaVencimiento: '2026-06-16',
      }),
    );

    // Un primer abono deja el saldo en 600.
    await comoEmpresa(empresaId, () =>
      registrarPago({ compraId: compra.id, monto: 400, usuarioId: usuario.id }),
    );

    // El segundo abono (700) excede el saldo pendiente (600): debe rechazarse.
    const error = await capturarError(
      comoEmpresa(empresaId, () =>
        registrarPago({ compraId: compra.id, monto: 700, usuarioId: usuario.id }),
      ),
    );
    expect(error).toBeInstanceOf(ErrorValidacion);
    expect((error as Error).message).toMatch(/excede el saldo/);

    // No se creó el segundo pago → god-view semilla: exactamente uno en todo el sistema.
    const pagos = await semilla().pagoProveedor.count({ where: { compraId: compra.id } });
    expect(pagos).toBe(1);

    // El saldo no se movió: sigue en 600.
    const [cuenta] = await comoEmpresa(empresaId, () => listarCuentasPorPagar({ sedeId: sede.id }));
    expect(cuenta?.totalPagado).toBe(400);
    expect(cuenta?.saldo).toBe(600);
  });

  it('acepta el pago exacto del saldo y deja la cuenta en estado pagado con saldo 0', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const prov = await comoEmpresa(empresaId, () => crearProveedor({ nombre: `Prov saldo exacto ${contador}` }));
    const usuario = await nuevoUsuario();
    const compra = await comoEmpresa(empresaId, () =>
      registrarCompra({
        proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'PAGO-EXACTO',
        montoTotal: 1000, tipo: 'credito', fechaEmision: '2026-05-17',
        fechaVencimiento: '2026-06-17',
      }),
    );
    await comoEmpresa(empresaId, () =>
      registrarPago({ compraId: compra.id, monto: 400, usuarioId: usuario.id }),
    );

    // monto === saldo (600): se ACEPTA (el guard usa > estricto).
    const pago = await comoEmpresa(empresaId, () =>
      registrarPago({ compraId: compra.id, monto: 600, usuarioId: usuario.id }),
    );
    expect(Number(pago.monto)).toBe(600);

    const [cuenta] = await comoEmpresa(empresaId, () => listarCuentasPorPagar({ sedeId: sede.id }));
    expect(cuenta?.totalPagado).toBe(1000);
    expect(cuenta?.saldo).toBe(0);
    expect(cuenta?.estado).toBe('pagado'); // 'pagado', no 'pagada' (vista, migración 20260529130000:30)

    // La cuenta saldada ya no admite ni un centavo más.
    await expect(
      comoEmpresa(empresaId, () =>
        registrarPago({ compraId: compra.id, monto: 1, usuarioId: usuario.id }),
      ),
    ).rejects.toBeInstanceOf(ErrorValidacion);
  });

  it('dos abonos concurrentes que juntos exceden el saldo: el FOR UPDATE deja pasar exactamente uno', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const prov = await comoEmpresa(empresaId, () => crearProveedor({ nombre: `Prov concurrente ${contador}` }));
    const usuario = await nuevoUsuario();
    const compra = await comoEmpresa(empresaId, () =>
      registrarCompra({
        proveedorId: prov.id, sedeId: sede.id, numeroFactura: 'PAGO-CONC',
        montoTotal: 1000, tipo: 'credito', fechaEmision: '2026-05-18',
        fechaVencimiento: '2026-06-18',
      }),
    );

    // Cada pago de 600 cabe solo (600 <= 1000) pero juntos exceden (1200 > 1000).
    const resultados = await Promise.allSettled([
      comoEmpresa(empresaId, () => registrarPago({ compraId: compra.id, monto: 600, usuarioId: usuario.id })),
      comoEmpresa(empresaId, () => registrarPago({ compraId: compra.id, monto: 600, usuarioId: usuario.id })),
    ]);
    const exitosos = resultados.filter((r) => r.status === 'fulfilled');
    const fallidos = resultados.filter((r) => r.status === 'rejected');
    expect(exitosos).toHaveLength(1);
    expect(fallidos).toHaveLength(1);
    expect((fallidos[0] as PromiseRejectedResult).reason).toBeInstanceOf(ErrorValidacion);
    expect(((fallidos[0] as PromiseRejectedResult).reason as Error).message).toMatch(/excede el saldo/);

    // Persistencia (exactamente un pago; el saldo nunca quedó negativo) → god-view semilla.
    const agg = await semilla().pagoProveedor.aggregate({ _sum: { monto: true }, where: { compraId: compra.id } });
    expect(Number(agg._sum.monto)).toBe(600);
    expect(await semilla().pagoProveedor.count({ where: { compraId: compra.id } })).toBe(1);
    const [cuenta] = await comoEmpresa(empresaId, () => listarCuentasPorPagar({ sedeId: sede.id }));
    expect(cuenta?.totalPagado).toBe(600);
    expect(cuenta?.saldo).toBe(400);
  });

  it('rechaza un pago a una compra inexistente: ErrorNoEncontrado, sin crear pago', async () => {
    const empresaId = await crearEmpresa();
    const usuario = await nuevoUsuario();
    const compraIdInexistente = '00000000-0000-0000-0000-000000000000';

    const error = await capturarError(
      comoEmpresa(empresaId, () =>
        registrarPago({ compraId: compraIdInexistente, monto: 100, usuarioId: usuario.id }),
      ),
    );
    expect(error).toBeInstanceOf(ErrorNoEncontrado);

    // Ausencia → god-view semilla: no se creó pago en ningún lado.
    const pagos = await semilla().pagoProveedor.count({ where: { compraId: compraIdInexistente } });
    expect(pagos).toBe(0);
  });
});

describe('alta de compra: proveedor o sede inexistente (P2003 → ErrorValidacion)', () => {
  it('rechaza una compra con proveedor o sede inexistente', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const prov = await comoEmpresa(empresaId, () => crearProveedor({ nombre: `Prov fk ${contador}` }));
    const idInexistente = '00000000-0000-0000-0000-000000000000';

    // Proveedor inexistente (sede real).
    const errProv = await capturarError(
      comoEmpresa(empresaId, () =>
        registrarCompra({
          proveedorId: idInexistente, sedeId: sede.id, numeroFactura: 'FK-PROV',
          montoTotal: 100, tipo: 'contado', fechaEmision: '2026-05-18',
        }),
      ),
    );
    expect(errProv).toBeInstanceOf(ErrorValidacion);
    expect((errProv as Error).message).toMatch(/no existen/);
    // El rollback dejó la tabla intacta → god-view semilla: no se creó la compra.
    expect(await semilla().compra.findMany({ where: { numeroFactura: 'FK-PROV' } })).toHaveLength(0);

    // Sede inexistente (proveedor real).
    const errSede = await capturarError(
      comoEmpresa(empresaId, () =>
        registrarCompra({
          proveedorId: prov.id, sedeId: idInexistente, numeroFactura: 'FK-SEDE',
          montoTotal: 100, tipo: 'contado', fechaEmision: '2026-05-18',
        }),
      ),
    );
    expect(errSede).toBeInstanceOf(ErrorValidacion);
    expect((errSede as Error).message).toMatch(/no existen/);
    expect(await semilla().compra.findMany({ where: { numeroFactura: 'FK-SEDE' } })).toHaveLength(0);
  });
});
