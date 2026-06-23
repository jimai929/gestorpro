import { describe, it, expect } from 'vitest';
import { txEmpresa } from '../../src/core/tenant/contexto.js';
import { semilla, comoEmpresa, crearEmpresa } from '../helpers/db.js';
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

async function nuevaSede(empresaId: string) {
  return semilla().sede.create({ data: { nombre: `SedeEmp ${uniq()}`, empresaId } });
}

/** Datos de alta con número único y PIN no trivial por defecto. */
function datos(sedeId: string, extra: Record<string, unknown> = {}) {
  const i = uniq();
  return { numero: `E-${i}`, nombre: `Empleado ${i}`, sedeId, salarioFijo: 1000, pin: '5293', ...extra };
}

/** Crea (o reutiliza) un rol operativo por su clave, dentro de la empresa dada. */
async function rolOp(empresaId: string, clave: string, nombre: string) {
  // clave es unica POR EMPRESA (compuesta): cada empresa de test tiene su propio rol.
  return semilla().rolOperativo.upsert({
    where: { empresaId_clave: { empresaId, clave } },
    update: {},
    create: { clave, nombre, empresaId },
  });
}

describe('gestión de empleados', () => {
  it('alta: el PIN queda hasheado, el QR se genera y el empleado nace activo', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const emp = await comoEmpresa(empresaId, () => crearEmpleado(datos(sede.id)));

    expect(emp.activo).toBe(true);
    expect(emp.qrToken).toBeTruthy();
    // El DTO no expone secretos.
    expect((emp as Record<string, unknown>).pinHash).toBeUndefined();

    // Lectura de columnas-secreto (pinHash/qrToken) sin método de servicio que las
    // exponga → god-view de la empresa sembrada para inspeccionar el hash en DB.
    const fila = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) => tx.empleado.findUnique({ where: { id: emp.id } })),
    );
    expect(fila?.pinHash).not.toBe('5293'); // hasheado, no texto plano
    expect(await verificarContrasena(fila!.pinHash, '5293')).toBe(true);
    expect(fila?.qrToken).toBe(emp.qrToken);
  });

  it('rechaza un número de empleado duplicado', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    await comoEmpresa(empresaId, () =>
      crearEmpleado({ numero: 'DUP-1', nombre: 'X', sedeId: sede.id, salarioFijo: 1000, pin: '5293' }),
    );
    await expect(
      comoEmpresa(empresaId, () =>
        crearEmpleado({ numero: 'DUP-1', nombre: 'Y', sedeId: sede.id, salarioFijo: 1000, pin: '7391' }),
      ),
    ).rejects.toBeInstanceOf(ErrorConflicto);
  });

  it('edita nombre, salario y sede', async () => {
    const empresaId = await crearEmpresa();
    const sede1 = await nuevaSede(empresaId);
    const sede2 = await nuevaSede(empresaId);
    const emp = await comoEmpresa(empresaId, () => crearEmpleado(datos(sede1.id)));
    const editado = await comoEmpresa(empresaId, () =>
      editarEmpleado(emp.id, { nombre: 'Nuevo Nombre', salarioFijo: 1500, sedeId: sede2.id }),
    );
    expect(editado.nombre).toBe('Nuevo Nombre');
    expect(editado.salarioFijo).toBe(1500);
    expect(editado.sedeId).toBe(sede2.id);
  });

  it('baja lógica: sale de activos, sigue con incluirInactivos, no se borra', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const emp = await comoEmpresa(empresaId, () => crearEmpleado(datos(sede.id)));

    await comoEmpresa(empresaId, () => editarEmpleado(emp.id, { activo: false }));

    const activos = await comoEmpresa(empresaId, () => listarEmpleados({ sedeId: sede.id }));
    expect(activos.some((e) => e.id === emp.id)).toBe(false);

    const todos = await comoEmpresa(empresaId, () => listarEmpleados({ sedeId: sede.id, incluirInactivos: true }));
    expect(todos.some((e) => e.id === emp.id)).toBe(true);

    // "no se borra" = la fila sigue existiendo en DB → god-view de la empresa.
    expect(await semilla().empleado.findUnique({ where: { id: emp.id } })).not.toBeNull();
  });

  it('regenerar QR: token nuevo distinto y el anterior deja de resolver', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const emp = await comoEmpresa(empresaId, () => crearEmpleado(datos(sede.id)));
    const viejo = emp.qrToken;

    const { qrToken: nuevo } = await comoEmpresa(empresaId, () => regenerarQrToken(emp.id));
    expect(nuevo).not.toBe(viejo);
    // El token viejo dejó de resolver (ABSENCIA/revocación) → semilla god-view.
    // Fase 3: qrToken es UNICO POR EMPRESA → findFirst (ya no findUnique standalone).
    expect(await semilla().empleado.findFirst({ where: { qrToken: viejo } })).toBeNull();
    // El nuevo SÍ resuelve para el tenant (POSITIVO bajo RLS).
    expect(
      await comoEmpresa(empresaId, () =>
        txEmpresa((tx) => tx.empleado.findFirst({ where: { qrToken: nuevo } })),
      ),
    ).not.toBeNull();
    expect((await comoEmpresa(empresaId, () => obtenerQrToken(emp.id))).qrToken).toBe(nuevo);
  });

  it('reset PIN: el nuevo verifica y el viejo deja de valer', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const emp = await comoEmpresa(empresaId, () => crearEmpleado(datos(sede.id, { pin: '5293' })));

    await comoEmpresa(empresaId, () => resetearPin(emp.id, '7391'));

    // Lectura de columna-secreto pinHash (sin método de servicio): god-view.
    const fila = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) => tx.empleado.findUnique({ where: { id: emp.id } })),
    );
    expect(await verificarContrasena(fila!.pinHash, '7391')).toBe(true);
    expect(await verificarContrasena(fila!.pinHash, '5293')).toBe(false);
  });

  it('rechaza PINs triviales: secuencias y repeticiones', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    for (const pin of ['1234', '4321', '5678', '0000', '1111', '123']) {
      await expect(
        comoEmpresa(empresaId, () =>
          crearEmpleado({ numero: `T-${uniq()}`, nombre: 'X', sedeId: sede.id, salarioFijo: 1000, pin }),
        ),
      ).rejects.toBeInstanceOf(ErrorValidacion);
    }
  });

  it('regresión: el contrato EmpleadoResumido (id/numero/nombre/sedeId) sigue intacto y sin secretos', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const emp = await comoEmpresa(empresaId, () => crearEmpleado(datos(sede.id)));
    const fila = (await comoEmpresa(empresaId, () => listarEmpleados({ sedeId: sede.id }))).find((e) => e.id === emp.id);
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
    const empresaId = await crearEmpresa();
    const sedeA = await nuevaSede(empresaId);
    const sedeB = await nuevaSede(empresaId);
    await comoEmpresa(empresaId, () => crearEmpleado(datos(sedeA.id)));
    await comoEmpresa(empresaId, () => crearEmpleado(datos(sedeB.id)));

    const deA = await comoEmpresa(empresaId, () => listarEmpleados({ sedeId: sedeA.id }));
    expect(deA.length).toBeGreaterThan(0);
    expect(deA.every((e) => e.sedeId === sedeA.id)).toBe(true);
    expect(deA.some((e) => e.sedeId === sedeB.id)).toBe(false);
  });

  it('asigna VARIOS roles operativos a un empleado y el DTO los devuelve', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const cajera = await rolOp(empresaId, 'cajera', 'Cajera');
    const verificador = await rolOp(empresaId, 'verificador', 'Verificador');
    const emp = await comoEmpresa(empresaId, () =>
      crearEmpleado(datos(sede.id, { rolesOperativos: [cajera.id, verificador.id] })),
    );
    expect(emp.roles.map((r) => r.clave).sort()).toEqual(['cajera', 'verificador']);
  });

  it('lista empleados por rol operativo: ?rol=cajera y ?rol=verificador', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const cajera = await rolOp(empresaId, 'cajera', 'Cajera');
    const verificador = await rolOp(empresaId, 'verificador', 'Verificador');
    const soloCajera = await comoEmpresa(empresaId, () => crearEmpleado(datos(sede.id, { rolesOperativos: [cajera.id] })));
    const soloVerif = await comoEmpresa(empresaId, () => crearEmpleado(datos(sede.id, { rolesOperativos: [verificador.id] })));
    const ambos = await comoEmpresa(empresaId, () => crearEmpleado(datos(sede.id, { rolesOperativos: [cajera.id, verificador.id] })));

    const idsCajera = (await comoEmpresa(empresaId, () => listarEmpleados({ rol: 'cajera' }))).map((e) => e.id);
    expect(idsCajera).toEqual(expect.arrayContaining([soloCajera.id, ambos.id]));
    expect(idsCajera).not.toContain(soloVerif.id);

    const idsVerif = (await comoEmpresa(empresaId, () => listarEmpleados({ rol: 'verificador' }))).map((e) => e.id);
    expect(idsVerif).toEqual(expect.arrayContaining([soloVerif.id, ambos.id]));
    expect(idsVerif).not.toContain(soloCajera.id);
  });

  it('editar REEMPLAZA el conjunto de roles (lista vacía = sin roles)', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const cajera = await rolOp(empresaId, 'cajera', 'Cajera');
    const verificador = await rolOp(empresaId, 'verificador', 'Verificador');
    const emp = await comoEmpresa(empresaId, () => crearEmpleado(datos(sede.id, { rolesOperativos: [cajera.id] })));

    const aVerif = await comoEmpresa(empresaId, () => editarEmpleado(emp.id, { rolesOperativos: [verificador.id] }));
    expect(aVerif.roles.map((r) => r.clave)).toEqual(['verificador']);

    const sinRoles = await comoEmpresa(empresaId, () => editarEmpleado(emp.id, { rolesOperativos: [] }));
    expect(sinRoles.roles).toEqual([]);
  });

  it('editar SIN rolesOperativos (undefined) deja los roles intactos', async () => {
    const empresaId = await crearEmpresa();
    const sede = await nuevaSede(empresaId);
    const cajera = await rolOp(empresaId, 'cajera', 'Cajera');
    const verificador = await rolOp(empresaId, 'verificador', 'Verificador');
    const emp = await comoEmpresa(empresaId, () =>
      crearEmpleado(datos(sede.id, { rolesOperativos: [cajera.id, verificador.id] })),
    );
    const esperados = [cajera.id, verificador.id].sort();

    // Edit parcial realista (la forma que envía el frontend tras N4: body sin el campo).
    const renombrado = await comoEmpresa(empresaId, () => editarEmpleado(emp.id, { nombre: 'Renombrado Sin Roles' }));
    expect(renombrado.nombre).toBe('Renombrado Sin Roles');
    expect(renombrado.roles.map((r) => r.id).sort()).toEqual(esperados);

    // Edit vacío puro: el contrato literal `undefined → no tocar` (backlog D1).
    const intacto = await comoEmpresa(empresaId, () => editarEmpleado(emp.id, {}));
    expect(intacto.roles.map((r) => r.id).sort()).toEqual(esperados);

    // Nivel tabla: exactamente las mismas 2 filas (mismos rolOperativoId). POSITIVO
    // bajo RLS (el tenant ve sus asignaciones).
    const filas = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) => tx.empleadoRolOperativo.findMany({ where: { empleadoId: emp.id } })),
    );
    expect(filas).toHaveLength(2);
    expect(filas.map((f) => f.rolOperativoId).sort()).toEqual(esperados);
  });
});
