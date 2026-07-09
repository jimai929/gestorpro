import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { construirApp } from '../../src/app.js';
import { semilla, comoEmpresa, crearEmpresa, cerrarSemilla } from '../helpers/db.js';
import {
  crearCategoria,
  actualizarCategoria,
  desactivarCategoria,
  listarCategorias,
  registrarGasto,
} from '../../src/finanzas/gastos/gastos.service.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorValidacion } from '../../src/core/errors.js';

// ── CRUD + aislamiento a nivel SERVICIO (RLS por contexto de tenant) ──────────
describe('categorías-gasto — CRUD por empresa (servicio, RLS)', () => {
  afterAll(cerrarSemilla);

  it('crea una categoría personalizada (default esPagoEmpleado=false; sin filtrar empresaId)', async () => {
    const empresaId = await crearEmpresa();
    const cat = await comoEmpresa(empresaId, () => crearCategoria({ nombre: 'Publicidad' }));
    expect(cat.nombre).toBe('Publicidad');
    expect(cat.esPagoEmpleado).toBe(false);
    expect(cat.activo).toBe(true);
    expect(cat).not.toHaveProperty('empresaId');
    // Persistió bajo la empresa correcta (god-view).
    const enBd = await semilla().categoriaGasto.findUniqueOrThrow({ where: { id: cat.id } });
    expect(enBd.empresaId).toBe(empresaId);
  });

  it('permite esPagoEmpleado=true explícito', async () => {
    const empresaId = await crearEmpresa();
    const cat = await comoEmpresa(empresaId, () =>
      crearCategoria({ nombre: 'Bono', esPagoEmpleado: true }),
    );
    expect(cat.esPagoEmpleado).toBe(true);
  });

  it('rechaza nombre duplicado en la MISMA empresa (409)', async () => {
    const empresaId = await crearEmpresa();
    await comoEmpresa(empresaId, () => crearCategoria({ nombre: 'Combustible' }));
    await expect(
      comoEmpresa(empresaId, () => crearCategoria({ nombre: 'Combustible' })),
    ).rejects.toBeInstanceOf(ErrorConflicto);
  });

  it('permite el MISMO nombre en empresas DISTINTAS', async () => {
    const a = await crearEmpresa();
    const b = await crearEmpresa();
    const ca = await comoEmpresa(a, () => crearCategoria({ nombre: 'Viáticos' }));
    const cb = await comoEmpresa(b, () => crearCategoria({ nombre: 'Viáticos' }));
    expect(ca.id).not.toBe(cb.id);
  });

  it('sin límite de cantidad: crea muchas categorías', async () => {
    const empresaId = await crearEmpresa();
    for (const n of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6']) {
      await comoEmpresa(empresaId, () => crearCategoria({ nombre: n }));
    }
    const lista = await comoEmpresa(empresaId, () => listarCategorias({ incluirInactivas: true }));
    expect(lista.length).toBe(6);
  });

  it('renombra (PATCH nombre)', async () => {
    const empresaId = await crearEmpresa();
    const cat = await comoEmpresa(empresaId, () => crearCategoria({ nombre: 'Marketng' }));
    const upd = await comoEmpresa(empresaId, () =>
      actualizarCategoria(cat.id, { nombre: 'Marketing' }),
    );
    expect(upd.nombre).toBe('Marketing');
  });

  it('desactiva (soft delete) y reactiva; NO borra la fila', async () => {
    const empresaId = await crearEmpresa();
    const cat = await comoEmpresa(empresaId, () => crearCategoria({ nombre: 'Temporal' }));

    const baja = await comoEmpresa(empresaId, () => desactivarCategoria(cat.id));
    expect(baja.activo).toBe(false);
    // La fila SIGUE existiendo.
    expect(await semilla().categoriaGasto.findUnique({ where: { id: cat.id } })).not.toBeNull();
    // Deja de aparecer en el listado ACTIVO (select del formulario).
    const activas = await comoEmpresa(empresaId, () => listarCategorias());
    expect(activas.find((c) => c.id === cat.id)).toBeUndefined();
    // Aparece con incluirInactivas.
    const todas = await comoEmpresa(empresaId, () => listarCategorias({ incluirInactivas: true }));
    expect(todas.find((c) => c.id === cat.id)?.activo).toBe(false);
    // Reactivar.
    const alta = await comoEmpresa(empresaId, () => actualizarCategoria(cat.id, { activo: true }));
    expect(alta.activo).toBe(true);
  });

  it('soft delete NO rompe un gasto histórico que la referencia', async () => {
    const empresaId = await crearEmpresa();
    const cat = await comoEmpresa(empresaId, () => crearCategoria({ nombre: 'Con gasto' }));
    const sede = await semilla().sede.create({
      data: { nombre: `S ${randomUUID().slice(0, 6)}`, empresaId },
    });
    const usuario = await semilla().usuario.create({
      data: { nombre: 'U', email: `cg-${randomUUID()}@x.local`, rol: 'administrador', passwordHash: 'x' },
    });
    const gasto = await comoEmpresa(empresaId, () =>
      registrarGasto({
        categoriaId: cat.id,
        sedeId: sede.id,
        monto: 30,
        fechaOperacion: '2026-05-17',
        usuarioId: usuario.id,
      }),
    );
    await comoEmpresa(empresaId, () => desactivarCategoria(cat.id));
    // El gasto SIGUE existiendo y apunta a la categoría (ahora inactiva).
    const g = await semilla().gasto.findUnique({
      where: { id: gasto.id },
      include: { categoria: true },
    });
    expect(g?.categoriaId).toBe(cat.id);
    expect(g?.categoria.activo).toBe(false);
  });

  it('AISLAMIENTO: empresa A no puede PATCH/DELETE una categoría de empresa B (404)', async () => {
    const a = await crearEmpresa();
    const b = await crearEmpresa();
    const catB = await comoEmpresa(b, () => crearCategoria({ nombre: 'Solo B' }));
    await expect(
      comoEmpresa(a, () => actualizarCategoria(catB.id, { nombre: 'Hack' })),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
    await expect(
      comoEmpresa(a, () => desactivarCategoria(catB.id)),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
    // B intacta.
    const enB = await semilla().categoriaGasto.findUniqueOrThrow({ where: { id: catB.id } });
    expect(enB.nombre).toBe('Solo B');
    expect(enB.activo).toBe(true);
  });

  it('AISLAMIENTO: listarCategorias solo devuelve las de la empresa del contexto', async () => {
    const a = await crearEmpresa();
    const b = await crearEmpresa();
    await comoEmpresa(a, () => crearCategoria({ nombre: 'DeA' }));
    await comoEmpresa(b, () => crearCategoria({ nombre: 'DeB' }));
    const listaA = await comoEmpresa(a, () => listarCategorias({ incluirInactivas: true }));
    const nombresA = listaA.map((c) => c.nombre);
    expect(nombresA).toContain('DeA');
    expect(nombresA).not.toContain('DeB');
  });

  it('nombre vacío → ErrorValidacion', async () => {
    const empresaId = await crearEmpresa();
    await expect(
      comoEmpresa(empresaId, () => crearCategoria({ nombre: '   ' })),
    ).rejects.toBeInstanceOf(ErrorValidacion);
  });
});

// ── Matriz de permisos a nivel HTTP (autenticar + autorizar) ──────────────────
describe('categorías-gasto — permisos (HTTP)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-categorias';
    app = construirApp();
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
    await cerrarSemilla();
  });

  async function empresaActiva(): Promise<string> {
    const e = await semilla().empresa.create({
      data: { nombre: `Cat ${randomUUID().slice(0, 8)}`, slug: `cat-${randomUUID()}` },
    });
    return e.id;
  }
  function token(empresaId: string, rol: 'administrador' | 'supervisor' | 'empleado'): string {
    return app.jwt.sign({ sub: randomUUID(), rol, empresaId, esSuperAdmin: false });
  }
  function postCategoria(
    empresaId: string,
    rol: 'administrador' | 'supervisor' | 'empleado',
    nombre: string,
  ) {
    return app.inject({
      method: 'POST',
      url: '/categorias-gasto',
      headers: { authorization: `Bearer ${token(empresaId, rol)}` },
      payload: { nombre },
    });
  }

  it('administrador puede crear (201)', async () => {
    const e = await empresaActiva();
    const res = await postCategoria(e, 'administrador', `Admin ${randomUUID().slice(0, 6)}`);
    expect(res.statusCode).toBe(201);
  });

  it('supervisor puede crear (201)', async () => {
    const e = await empresaActiva();
    const res = await postCategoria(e, 'supervisor', `Sup ${randomUUID().slice(0, 6)}`);
    expect(res.statusCode).toBe(201);
  });

  it('empleado NO puede crear (403)', async () => {
    const e = await empresaActiva();
    const res = await postCategoria(e, 'empleado', `Emp ${randomUUID().slice(0, 6)}`);
    expect(res.statusCode).toBe(403);
  });

  it('empleado SÍ puede leer el listado (GET 200)', async () => {
    const e = await empresaActiva();
    const res = await app.inject({
      method: 'GET',
      url: '/categorias-gasto',
      headers: { authorization: `Bearer ${token(e, 'empleado')}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('empleado NO puede editar (PATCH 403)', async () => {
    const e = await empresaActiva();
    const creada = await postCategoria(e, 'administrador', `P ${randomUUID().slice(0, 6)}`);
    const id = (creada.json() as { id: string }).id;
    const res = await app.inject({
      method: 'PATCH',
      url: `/categorias-gasto/${id}`,
      headers: { authorization: `Bearer ${token(e, 'empleado')}` },
      payload: { nombre: 'Hack' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('empleado NO puede desactivar (DELETE 403)', async () => {
    const e = await empresaActiva();
    const creada = await postCategoria(e, 'administrador', `X ${randomUUID().slice(0, 6)}`);
    const id = (creada.json() as { id: string }).id;
    const res = await app.inject({
      method: 'DELETE',
      url: `/categorias-gasto/${id}`,
      headers: { authorization: `Bearer ${token(e, 'empleado')}` },
    });
    expect(res.statusCode).toBe(403);
  });
});
