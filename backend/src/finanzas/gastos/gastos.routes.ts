import type { FastifyInstance } from 'fastify';
import { responderError } from '../../core/http.js';
import {
  listarCategorias,
  crearCategoria,
  actualizarCategoria,
  desactivarCategoria,
  registrarGasto,
  listarGastos,
} from './gastos.service.js';

/** POST /categorias-gasto: crear una categoría personalizada. `nombre` obligatorio. */
const esquemaCrearCategoria = {
  body: {
    type: 'object',
    required: ['nombre'],
    additionalProperties: false,
    properties: {
      nombre: { type: 'string', minLength: 1 },
      esPagoEmpleado: { type: 'boolean' },
    },
  },
} as const;

/** PATCH /categorias-gasto/:id: cambiar `nombre`, `esPagoEmpleado` y/o `activo` (al menos uno). */
const esquemaActualizarCategoria = {
  body: {
    type: 'object',
    minProperties: 1,
    additionalProperties: false,
    properties: {
      nombre: { type: 'string', minLength: 1 },
      esPagoEmpleado: { type: 'boolean' },
      activo: { type: 'boolean' },
    },
  },
} as const;

const esquemaGasto = {
  body: {
    type: 'object',
    required: ['categoriaId', 'sedeId', 'monto', 'fechaOperacion'],
    additionalProperties: false,
    properties: {
      categoriaId: { type: 'string', minLength: 1 },
      sedeId: { type: 'string', minLength: 1 },
      monto: { type: 'number', exclusiveMinimum: 0 },
      fechaOperacion: { type: 'string', minLength: 1 },
      descripcion: { type: 'string' },
      empleadoId: { type: 'string' },
      tipoPago: { type: 'string' },
    },
  },
} as const;

/**
 * Rutas de gastos: catálogo de categorías, registro de gasto (con la regla de
 * coherencia de empleado en el servicio) y listado por período. Lectura para
 * autenticados; registro para supervisor o administrador. El `usuarioId` sale
 * del token.
 */
export async function gastosRoutes(app: FastifyInstance): Promise<void> {
  const soloGestion = {
    preHandler: [app.autenticar, app.autorizar('supervisor', 'administrador')],
  };
  const autenticado = { preHandler: [app.autenticar] };

  // Lectura para cualquier autenticado (la consume el select del formulario de gasto).
  // Con ?incluirInactivas=true trae también las dadas de baja (pantalla de gestión).
  app.get<{ Querystring: { incluirInactivas?: string } }>(
    '/categorias-gasto',
    autenticado,
    async (request, reply) => {
      try {
        const incluirInactivas = request.query.incluirInactivas === 'true';
        // Ver inactivas es una vista de GESTIÓN: solo supervisor/administrador. Un empleado
        // que lo pida recibe 403 (frontera clara), NO una lista degradada en silencio.
        if (
          incluirInactivas &&
          request.user.rol !== 'administrador' &&
          request.user.rol !== 'supervisor'
        ) {
          return await reply
            .code(403)
            .send({ mensaje: 'No autorizado para ver categorías inactivas.' });
        }
        return await reply.send(await listarCategorias({ incluirInactivas }));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  // Gestión de categorías (supervisor/administrador): crear/reactivar, editar (nombre/
  // esPagoEmpleado/activo) y baja lógica. Cada empresa maneja su propio catálogo (sin límite,
  // sin catálogo global). El servicio protege el invariante de "pago a empleado" activa.
  app.post<{ Body: { nombre: string; esPagoEmpleado?: boolean } }>(
    '/categorias-gasto',
    { ...soloGestion, schema: esquemaCrearCategoria },
    async (request, reply) => {
      try {
        return await reply.code(201).send(await crearCategoria(request.body));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.patch<{
    Params: { id: string };
    Body: { nombre?: string; esPagoEmpleado?: boolean; activo?: boolean };
  }>(
    '/categorias-gasto/:id',
    { ...soloGestion, schema: esquemaActualizarCategoria },
    async (request, reply) => {
      try {
        return await reply.send(await actualizarCategoria(request.params.id, request.body));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  // DELETE = baja LÓGICA (soft delete). Nunca borra: los gastos históricos la referencian.
  app.delete<{ Params: { id: string } }>(
    '/categorias-gasto/:id',
    soloGestion,
    async (request, reply) => {
      try {
        return await reply.send(await desactivarCategoria(request.params.id));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.post<{
    Body: {
      categoriaId: string;
      sedeId: string;
      monto: number;
      fechaOperacion: string;
      descripcion?: string;
      empleadoId?: string;
      tipoPago?: string;
    };
  }>('/gastos', { ...soloGestion, schema: esquemaGasto }, async (request, reply) => {
    try {
      const gasto = await registrarGasto({
        ...request.body,
        usuarioId: request.user.sub, // del token, nunca del body
      });
      return await reply.code(201).send(gasto);
    } catch (error) {
      return responderError(error, request, reply);
    }
  });

  app.get<{ Querystring: { desde?: string; hasta?: string; sedeId?: string } }>(
    '/gastos',
    autenticado,
    async (request, reply) => {
      try {
        const { desde, hasta, sedeId } = request.query;
        return await reply.send(await listarGastos({ desde, hasta, sedeId }));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
