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
import { ErrorNoEncontrado, ErrorValidacion } from '../../src/core/errors.js';

let contador = 0;

async function nuevaSede() {
  contador += 1;
  return prisma.sede.create({ data: { nombre: `SedeCXP ${contador}` } });
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
