import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, comoEmpresa, crearEmpresa, cerrarSemilla } from '../helpers/db.js';
import { crearEmpleado } from '../../src/core/empleado/empleado.service.js';

/**
 * Frontera de PERMISOS de la gestión de empleados (a nivel ruta, no servicio):
 *  - crear/editar empleados (incl. roles operativos) → administrador Y supervisor.
 *  - empleado → 403.
 *  - la rotación de secretos (PIN/QR) sigue siendo SOLO administrador.
 *  - el aislamiento multi-tenant se mantiene (un gestor de otra empresa no toca este).
 */
describe('empleados — frontera de permisos (supervisor gestiona, empleado no)', () => {
  let app: FastifyInstance;
  let contador = 0;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-empleado-permisos';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  type RolSistema = 'administrador' | 'supervisor' | 'empleado';
  const token = (rol: RolSistema, empresaId: string) =>
    app.jwt.sign({ sub: randomUUID(), rol, empresaId, esSuperAdmin: false });

  async function escenario() {
    contador += 1;
    const empresaId = await crearEmpresa(`EmpPerm ${contador}`);
    const sede = await semilla().sede.create({ data: { nombre: `SedePerm ${contador}`, empresaId } });
    const rol = await semilla().rolOperativo.upsert({
      where: { empresaId_clave: { empresaId, clave: 'cajera' } },
      update: {},
      create: { clave: 'cajera', nombre: 'Cajera', empresaId },
    });
    const emp = await comoEmpresa(empresaId, () =>
      crearEmpleado({ numero: `E-${contador}`, nombre: `Emp ${contador}`, sedeId: sede.id, salarioFijo: 1000, pin: '5293' }),
    );
    return { empresaId, sede, rol, emp };
  }

  const putRoles = (tk: string, empId: string, rolesOperativos: string[]) =>
    app.inject({
      method: 'PUT',
      url: `/empleados/${empId}`,
      headers: { authorization: `Bearer ${tk}` },
      payload: { rolesOperativos },
    });

  const rolesEnBase = (empId: string) =>
    semilla().empleadoRolOperativo.findMany({ where: { empleadoId: empId } });

  it('supervisor PUEDE asignar roles operativos (200) y quedan persistidos', async () => {
    const { empresaId, rol, emp } = await escenario();
    const res = await putRoles(token('supervisor', empresaId), emp.id, [rol.id]);
    expect(res.statusCode).toBe(200);
    const asignados = await rolesEnBase(emp.id);
    expect(asignados.map((r) => r.rolOperativoId)).toEqual([rol.id]);
  });

  it('administrador sigue pudiendo asignar roles (200)', async () => {
    const { empresaId, rol, emp } = await escenario();
    const res = await putRoles(token('administrador', empresaId), emp.id, [rol.id]);
    expect(res.statusCode).toBe(200);
  });

  it('empleado NO puede asignar roles (403) y no altera nada', async () => {
    const { empresaId, rol, emp } = await escenario();
    const res = await putRoles(token('empleado', empresaId), emp.id, [rol.id]);
    expect(res.statusCode).toBe(403);
    expect(await rolesEnBase(emp.id)).toHaveLength(0);
  });

  it('un supervisor de OTRA empresa no puede editar (404) ni alterar los roles', async () => {
    const { empresaId, rol, emp } = await escenario();
    // El admin dueño le asigna el rol.
    expect((await putRoles(token('administrador', empresaId), emp.id, [rol.id])).statusCode).toBe(200);
    // Un supervisor de otra empresa intenta VACIARLE los roles.
    const otra = await crearEmpresa(`Otra ${contador}`);
    const res = await putRoles(token('supervisor', otra), emp.id, []);
    expect(res.statusCode).toBe(404); // aislamiento: no lo ve
    const asignados = await rolesEnBase(emp.id);
    expect(asignados.map((r) => r.rolOperativoId)).toEqual([rol.id]); // intacto
  });

  it('supervisor también puede CREAR un empleado (201); empleado no (403)', async () => {
    const { empresaId, sede } = await escenario();
    const alta = (rol: RolSistema, numero: string) =>
      app.inject({
        method: 'POST',
        url: '/empleados',
        headers: { authorization: `Bearer ${token(rol, empresaId)}` },
        payload: { numero, nombre: 'X', sedeId: sede.id, salarioFijo: 900, pin: '5293' },
      });
    expect((await alta('supervisor', `SUP-${contador}`)).statusCode).toBe(201);
    expect((await alta('empleado', `EMP-${contador}`)).statusCode).toBe(403);
  });

  it('la rotación de SECRETOS (PIN y QR) sigue siendo SOLO administrador: supervisor 403', async () => {
    const { empresaId, emp } = await escenario();
    const sup = `Bearer ${token('supervisor', empresaId)}`;
    const pin = await app.inject({
      method: 'POST', url: `/empleados/${emp.id}/pin`,
      headers: { authorization: sup }, payload: { pin: '7391' },
    });
    expect(pin.statusCode).toBe(403);
    const qrVer = await app.inject({
      method: 'GET', url: `/empleados/${emp.id}/qr`, headers: { authorization: sup },
    });
    expect(qrVer.statusCode).toBe(403);
    const qrRotar = await app.inject({
      method: 'POST', url: `/empleados/${emp.id}/qr`, headers: { authorization: sup },
    });
    expect(qrRotar.statusCode).toBe(403);
  });
});
