import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { semilla, comoEmpresa, cerrarSemilla } from '../helpers/db.js';
import { sembrarDosEmpresas, type DosEmpresas } from './_fixture-dos-empresas.js';
import { ErrorValidacion } from '../../src/core/errors.js';

import { registrarCompra } from '../../src/finanzas/cuentas-por-pagar/cuentas-por-pagar.service.js';
import { registrarGasto } from '../../src/finanzas/gastos/gastos.service.js';
import { registrarVenta } from '../../src/finanzas/dashboard/ventas.service.js';
import { crearEmpleado } from '../../src/core/empleado/empleado.service.js';
import { crearKiosco } from '../../src/asistencia/kiosco/kiosco.service.js';
import { solicitarCobro } from '../../src/asistencia/cobro/cobro.service.js';

/**
 * ③ Inyección de FK vía body (Fase 8). Un actor en A crea un registro hijo
 * apuntando a un padre de B (sede/proveedor/categoría/empleado de B). El padre NO
 * es visible bajo el contexto de A: o el servicio lo valida (RLS-`findUnique` →
 * `ErrorValidacion`/404) o la `WITH CHECK` de RLS rechaza el INSERT. En todos los
 * casos: NO se crea la fila intrusa (god-view lo confirma).
 *
 * Nota: el `empresaId` NUNCA viaja en el body de estos servicios (las tablas
 * directas lo rellenan con el DEFAULT desde el GUC). El vector real es inyectar el
 * `id` del PADRE de otro tenant; eso es lo que se prueba aquí.
 */
describe('Fase 8 ③ — inyección de FK cross-tenant rechazada (servicio)', () => {
  let f: DosEmpresas;

  beforeAll(async () => {
    f = await sembrarDosEmpresas();
  });
  afterAll(async () => {
    await cerrarSemilla();
  });

  it('registrarCompra con proveedorId de B ⇒ ErrorValidacion y no crea compra', async () => {
    const numeroFactura = `INJ-${randomUUID()}`;
    await expect(
      comoEmpresa(f.A.empresaId, () =>
        registrarCompra({
          proveedorId: f.B.proveedorId, // padre de OTRO tenant
          sedeId: f.A.sedeId,
          numeroFactura,
          montoTotal: 100,
          tipo: 'contado',
          fechaEmision: '2026-03-01',
        }),
      ),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    expect(await semilla().compra.count({ where: { numeroFactura } })).toBe(0);
  });

  it('registrarCompra con sedeId de B ⇒ ErrorValidacion y no crea compra', async () => {
    const numeroFactura = `INJ-${randomUUID()}`;
    await expect(
      comoEmpresa(f.A.empresaId, () =>
        registrarCompra({
          proveedorId: f.A.proveedorId,
          sedeId: f.B.sedeId, // sede de OTRO tenant
          numeroFactura,
          montoTotal: 100,
          tipo: 'contado',
          fechaEmision: '2026-03-01',
        }),
      ),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    expect(await semilla().compra.count({ where: { numeroFactura } })).toBe(0);
  });

  it('registrarGasto con categoriaId de B ⇒ ErrorValidacion y no crea gasto', async () => {
    // La categoría de B no es visible bajo A; el servicio la valida → ErrorValidacion
    // (afirmamos el TIPO, no un toThrow genérico que pasaría por monto/fecha inválidos).
    const descripcion = `INJ-CAT-${randomUUID()}`;
    await expect(
      comoEmpresa(f.A.empresaId, () =>
        registrarGasto({
          categoriaId: f.B.categoriaId, // categoría de OTRO tenant
          sedeId: f.A.sedeId,
          monto: 10,
          fechaOperacion: '2026-03-02',
          descripcion,
          usuarioId: randomUUID(),
        }),
      ),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    expect(await semilla().gasto.count({ where: { descripcion } })).toBe(0);
  });

  it('registrarGasto con sedeId de B ⇒ rechaza (WITH CHECK) y no crea gasto', async () => {
    const descripcion = `INJ-SEDE-${randomUUID()}`;
    await expect(
      comoEmpresa(f.A.empresaId, () =>
        registrarGasto({
          categoriaId: f.A.categoriaId,
          sedeId: f.B.sedeId, // sede de OTRO tenant
          monto: 10,
          fechaOperacion: '2026-03-02',
          descripcion,
          usuarioId: randomUUID(),
        }),
      ),
    ).rejects.toThrow();
    expect(await semilla().gasto.count({ where: { descripcion } })).toBe(0);
  });

  it('registrarVenta con sedeId de B ⇒ rechaza y no crea cierre', async () => {
    const cajera = `INJ-${randomUUID()}`;
    await expect(
      comoEmpresa(f.A.empresaId, () =>
        registrarVenta({
          sedeId: f.B.sedeId, // sede de OTRO tenant
          fechaOperacion: '2026-03-03',
          turno: 'tarde',
          cajera,
          cerradoPor: 'jefe',
          detalles: [{ tipoArqueo: 'efectivo', monto: 100 }],
          usuarioId: randomUUID(),
        }),
      ),
    ).rejects.toThrow();
    expect(await semilla().ventaDiaria.count({ where: { cajera } })).toBe(0);
  });

  it('crearEmpleado con sedeId de B ⇒ rechaza (WITH CHECK) y no crea empleado', async () => {
    const numero = `INJ-${randomUUID()}`;
    await expect(
      comoEmpresa(f.A.empresaId, () =>
        crearEmpleado({ numero, nombre: 'Intruso', sedeId: f.B.sedeId, salarioFijo: 1000, pin: '5293' }),
      ),
    ).rejects.toThrow();
    expect(await semilla().empleado.count({ where: { numero } })).toBe(0);
  });

  it('crearKiosco con sedeId de B ⇒ ErrorValidacion y no crea kiosco', async () => {
    const nombre = `INJ-K-${randomUUID()}`;
    await expect(
      comoEmpresa(f.A.empresaId, () => crearKiosco({ nombre, sedeId: f.B.sedeId })),
    ).rejects.toBeInstanceOf(ErrorValidacion);
    expect(await semilla().kiosco.count({ where: { nombre } })).toBe(0);
  });

  it('solicitarCobro con empleadoId de B ⇒ rechaza y no crea solicitud en B', async () => {
    const antes = await semilla().solicitudCobro.count({ where: { empleadoId: f.B.empleadoId } });
    await expect(
      comoEmpresa(f.A.empresaId, () => solicitarCobro({ empleadoId: f.B.empleadoId, monto: 5 })),
    ).rejects.toThrow();
    const despues = await semilla().solicitudCobro.count({ where: { empleadoId: f.B.empleadoId } });
    expect(despues).toBe(antes);
  });
});
