import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/core/prisma.js';
import {
  crearEmpleado,
  editarEmpleado,
  listarEmpleados,
  obtenerQrToken,
  regenerarQrToken,
  resetearPin,
} from '../../src/core/empleado/empleado.service.js';
import { verificarContrasena } from '../../src/core/auth/contrasena.js';
import { ErrorConflicto, ErrorValidacion } from '../../src/core/errors.js';

let contador = 0;
const uniq = () => (contador += 1);

async function nuevaSede() {
  return prisma.sede.create({ data: { nombre: `SedeEmp ${uniq()}` } });
}

/** Datos de alta con número único y PIN no trivial por defecto. */
function datos(sedeId: string, extra: Record<string, unknown> = {}) {
  const i = uniq();
  return { numero: `E-${i}`, nombre: `Empleado ${i}`, sedeId, salarioFijo: 1000, pin: '5293', ...extra };
}

/** Crea (o reutiliza) un rol operativo por su clave. */
async function rolOp(clave: string, nombre: string) {
  return prisma.rolOperativo.upsert({ where: { clave }, update: {}, create: { clave, nombre } });
}

describe('gestión de empleados', () => {
  it('alta: el PIN queda hasheado, el QR se genera y el empleado nace activo', async () => {
    const sede = await nuevaSede();
    const emp = await crearEmpleado(datos(sede.id));

    expect(emp.activo).toBe(true);
    expect(emp.qrToken).toBeTruthy();
    // El DTO no expone secretos.
    expect((emp as Record<string, unknown>).pinHash).toBeUndefined();

    const fila = await prisma.empleado.findUnique({ where: { id: emp.id } });
    expect(fila?.pinHash).not.toBe('5293'); // hasheado, no texto plano
    expect(await verificarContrasena(fila!.pinHash, '5293')).toBe(true);
    expect(fila?.qrToken).toBe(emp.qrToken);
  });

  it('rechaza un número de empleado duplicado', async () => {
    const sede = await nuevaSede();
    await crearEmpleado({ numero: 'DUP-1', nombre: 'X', sedeId: sede.id, salarioFijo: 1000, pin: '5293' });
    await expect(
      crearEmpleado({ numero: 'DUP-1', nombre: 'Y', sedeId: sede.id, salarioFijo: 1000, pin: '7391' }),
    ).rejects.toBeInstanceOf(ErrorConflicto);
  });

  it('edita nombre, salario y sede', async () => {
    const sede1 = await nuevaSede();
    const sede2 = await nuevaSede();
    const emp = await crearEmpleado(datos(sede1.id));
    const editado = await editarEmpleado(emp.id, { nombre: 'Nuevo Nombre', salarioFijo: 1500, sedeId: sede2.id });
    expect(editado.nombre).toBe('Nuevo Nombre');
    expect(editado.salarioFijo).toBe(1500);
    expect(editado.sedeId).toBe(sede2.id);
  });

  it('baja lógica: sale de activos, sigue con incluirInactivos, no se borra', async () => {
    const sede = await nuevaSede();
    const emp = await crearEmpleado(datos(sede.id));

    await editarEmpleado(emp.id, { activo: false });

    const activos = await listarEmpleados({ sedeId: sede.id });
    expect(activos.some((e) => e.id === emp.id)).toBe(false);

    const todos = await listarEmpleados({ sedeId: sede.id, incluirInactivos: true });
    expect(todos.some((e) => e.id === emp.id)).toBe(true);

    expect(await prisma.empleado.findUnique({ where: { id: emp.id } })).not.toBeNull();
  });

  it('regenerar QR: token nuevo distinto y el anterior deja de resolver', async () => {
    const sede = await nuevaSede();
    const emp = await crearEmpleado(datos(sede.id));
    const viejo = emp.qrToken;

    const { qrToken: nuevo } = await regenerarQrToken(emp.id);
    expect(nuevo).not.toBe(viejo);
    expect(await prisma.empleado.findUnique({ where: { qrToken: viejo } })).toBeNull();
    expect(await prisma.empleado.findUnique({ where: { qrToken: nuevo } })).not.toBeNull();
    expect((await obtenerQrToken(emp.id)).qrToken).toBe(nuevo);
  });

  it('reset PIN: el nuevo verifica y el viejo deja de valer', async () => {
    const sede = await nuevaSede();
    const emp = await crearEmpleado(datos(sede.id, { pin: '5293' }));

    await resetearPin(emp.id, '7391');

    const fila = await prisma.empleado.findUnique({ where: { id: emp.id } });
    expect(await verificarContrasena(fila!.pinHash, '7391')).toBe(true);
    expect(await verificarContrasena(fila!.pinHash, '5293')).toBe(false);
  });

  it('rechaza PINs triviales: secuencias y repeticiones', async () => {
    const sede = await nuevaSede();
    for (const pin of ['1234', '4321', '5678', '0000', '1111', '123']) {
      await expect(
        crearEmpleado({ numero: `T-${uniq()}`, nombre: 'X', sedeId: sede.id, salarioFijo: 1000, pin }),
      ).rejects.toBeInstanceOf(ErrorValidacion);
    }
  });

  it('regresión: el contrato EmpleadoResumido (id/numero/nombre/sedeId) sigue intacto y sin secretos', async () => {
    const sede = await nuevaSede();
    const emp = await crearEmpleado(datos(sede.id));
    const fila = (await listarEmpleados({ sedeId: sede.id })).find((e) => e.id === emp.id);
    expect(fila).toMatchObject({
      id: emp.id,
      numero: expect.any(String),
      nombre: expect.any(String),
      sedeId: sede.id,
    });
    const f = fila as Record<string, unknown>;
    expect(f.pinHash).toBeUndefined();
    expect(f.qrToken).toBeUndefined();
  });

  it('filtra por sede: GET /empleados?sedeId solo trae los de esa sede', async () => {
    const sedeA = await nuevaSede();
    const sedeB = await nuevaSede();
    await crearEmpleado(datos(sedeA.id));
    await crearEmpleado(datos(sedeB.id));

    const deA = await listarEmpleados({ sedeId: sedeA.id });
    expect(deA.length).toBeGreaterThan(0);
    expect(deA.every((e) => e.sedeId === sedeA.id)).toBe(true);
    expect(deA.some((e) => e.sedeId === sedeB.id)).toBe(false);
  });

  it('asigna VARIOS roles operativos a un empleado y el DTO los devuelve', async () => {
    const sede = await nuevaSede();
    const cajera = await rolOp('cajera', 'Cajera');
    const verificador = await rolOp('verificador', 'Verificador');
    const emp = await crearEmpleado(datos(sede.id, { rolesOperativos: [cajera.id, verificador.id] }));
    expect(emp.roles.map((r) => r.clave).sort()).toEqual(['cajera', 'verificador']);
  });

  it('lista empleados por rol operativo: ?rol=cajera y ?rol=verificador', async () => {
    const sede = await nuevaSede();
    const cajera = await rolOp('cajera', 'Cajera');
    const verificador = await rolOp('verificador', 'Verificador');
    const soloCajera = await crearEmpleado(datos(sede.id, { rolesOperativos: [cajera.id] }));
    const soloVerif = await crearEmpleado(datos(sede.id, { rolesOperativos: [verificador.id] }));
    const ambos = await crearEmpleado(datos(sede.id, { rolesOperativos: [cajera.id, verificador.id] }));

    const idsCajera = (await listarEmpleados({ rol: 'cajera' })).map((e) => e.id);
    expect(idsCajera).toEqual(expect.arrayContaining([soloCajera.id, ambos.id]));
    expect(idsCajera).not.toContain(soloVerif.id);

    const idsVerif = (await listarEmpleados({ rol: 'verificador' })).map((e) => e.id);
    expect(idsVerif).toEqual(expect.arrayContaining([soloVerif.id, ambos.id]));
    expect(idsVerif).not.toContain(soloCajera.id);
  });

  it('editar REEMPLAZA el conjunto de roles (lista vacía = sin roles)', async () => {
    const sede = await nuevaSede();
    const cajera = await rolOp('cajera', 'Cajera');
    const verificador = await rolOp('verificador', 'Verificador');
    const emp = await crearEmpleado(datos(sede.id, { rolesOperativos: [cajera.id] }));

    const aVerif = await editarEmpleado(emp.id, { rolesOperativos: [verificador.id] });
    expect(aVerif.roles.map((r) => r.clave)).toEqual(['verificador']);

    const sinRoles = await editarEmpleado(emp.id, { rolesOperativos: [] });
    expect(sinRoles.roles).toEqual([]);
  });
});
