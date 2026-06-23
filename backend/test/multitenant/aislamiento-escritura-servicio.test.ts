import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { semilla, comoEmpresa, cerrarSemilla } from '../helpers/db.js';
import { sembrarDosEmpresas, type DosEmpresas } from './_fixture-dos-empresas.js';
import { ErrorNoEncontrado } from '../../src/core/errors.js';

import { editarSede } from '../../src/core/sede/sede.service.js';
import { editarEmpleado } from '../../src/core/empleado/empleado.service.js';
import {
  editarProveedor,
  registrarPago,
} from '../../src/finanzas/cuentas-por-pagar/cuentas-por-pagar.service.js';
import { regenerarTokenKiosco } from '../../src/asistencia/kiosco/kiosco.service.js';
import { corregirJornada } from '../../src/asistencia/jornada/jornada.service.js';
import { aprobarCobro } from '../../src/asistencia/cobro/cobro.service.js';

/**
 * ② Escritura cross-tenant rechazada (nivel SERVICIO) + ④ fail-closed de escritura.
 *
 * Un actor en A intenta MUTAR datos de B (por id de B). Bajo RLS, el `where {id}`
 * de B no es visible → P2025 → `ErrorNoEncontrado` (mapea a 404, anti-enumeración:
 * NO 403). Además se exige NO-MUTACIÓN: snapshot god-view (semilla, BYPASSRLS)
 * antes → acción como A (lanza) → re-leer sin filtro → idéntico.
 */
describe('Fase 8 ② — escritura cross-tenant rechazada (servicio)', () => {
  let f: DosEmpresas;

  beforeAll(async () => {
    f = await sembrarDosEmpresas();
  });
  afterAll(async () => {
    await cerrarSemilla();
  });

  it('editar sede de B desde A ⇒ 404 (ErrorNoEncontrado) y NO muta', async () => {
    const antes = await semilla().sede.findUnique({ where: { id: f.B.sedeId } });
    await expect(
      comoEmpresa(f.A.empresaId, () => editarSede(f.B.sedeId, { nombre: 'HACKEADA' })),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
    const despues = await semilla().sede.findUnique({ where: { id: f.B.sedeId } });
    expect(despues).toEqual(antes);
  });

  it('dar de baja empleado de B desde A ⇒ 404 y NO muta', async () => {
    const antes = await semilla().empleado.findUnique({ where: { id: f.B.empleadoId } });
    await expect(
      comoEmpresa(f.A.empresaId, () => editarEmpleado(f.B.empleadoId, { activo: false })),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
    const despues = await semilla().empleado.findUnique({ where: { id: f.B.empleadoId } });
    expect(despues).toEqual(antes);
  });

  it('editar proveedor de B desde A ⇒ 404 y NO muta', async () => {
    const antes = await semilla().proveedor.findUnique({ where: { id: f.B.proveedorId } });
    await expect(
      comoEmpresa(f.A.empresaId, () => editarProveedor(f.B.proveedorId, { nombre: 'HACKEADO' })),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
    const despues = await semilla().proveedor.findUnique({ where: { id: f.B.proveedorId } });
    expect(despues).toEqual(antes);
  });

  it('regenerar token del kiosco de B desde A ⇒ 404 y NO rota el token', async () => {
    const antes = await semilla().kiosco.findUnique({ where: { id: f.B.kioscoId } });
    await expect(
      comoEmpresa(f.A.empresaId, () => regenerarTokenKiosco(f.B.kioscoId)),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
    const despues = await semilla().kiosco.findUnique({ where: { id: f.B.kioscoId } });
    expect(despues?.tokenHash).toBe(antes?.tokenHash); // el token de B sigue intacto
  });

  // ── Dinero: pagar/corregir/aprobar de B desde A ⇒ 404 + no-mutación ────────
  it('registrar pago sobre la compra de B desde A ⇒ 404 y NO crea pago en B', async () => {
    const antes = await semilla().pagoProveedor.count({ where: { compraId: f.B.compraId } });
    await expect(
      comoEmpresa(f.A.empresaId, () =>
        registrarPago({ compraId: f.B.compraId, monto: 50, usuarioId: randomUUID() }),
      ),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
    const despues = await semilla().pagoProveedor.count({ where: { compraId: f.B.compraId } });
    expect(despues).toBe(antes);
  });

  it('corregir la jornada de B desde A ⇒ 404 y NO crea corrección', async () => {
    const antes = await semilla().correccion.count({ where: { jornadaId: f.B.jornadaId } });
    await expect(
      comoEmpresa(f.A.empresaId, () =>
        corregirJornada({ jornadaId: f.B.jornadaId, jefeId: randomUUID(), motivo: 'intrusión', minutosTrabajados: 1 }),
      ),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
    const despues = await semilla().correccion.count({ where: { jornadaId: f.B.jornadaId } });
    expect(despues).toBe(antes);
  });

  it('aprobar la solicitud de cobro de B desde A ⇒ 404 y NO cambia su estado', async () => {
    const antes = await semilla().solicitudCobro.findUnique({ where: { id: f.B.solicitudId } });
    await expect(
      comoEmpresa(f.A.empresaId, () => aprobarCobro(f.B.solicitudId, randomUUID())),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
    const despues = await semilla().solicitudCobro.findUnique({ where: { id: f.B.solicitudId } });
    expect(despues?.estado).toBe(antes?.estado); // sigue 'pendiente'
    expect(despues).toEqual(antes);
  });
});

describe('Fase 8 ④ — fail-closed: escritura sin contexto NO escribe en ningún tenant', () => {
  afterAll(async () => {
    await cerrarSemilla();
  });

  it('crear sede sin empresaId ⇒ rechaza (empresa_id default NULL viola NOT NULL) y no crea fila', async () => {
    const { crearSede } = await import('../../src/core/sede/sede.service.js');
    const nombre = `SIN-CONTEXTO-${randomUUID()}`;
    await expect(comoEmpresa(null, () => crearSede({ nombre }))).rejects.toThrow();
    // No quedó ninguna sede con ese nombre en NINGÚN tenant (god-view).
    expect(await semilla().sede.count({ where: { nombre } })).toBe(0);
  });
});
