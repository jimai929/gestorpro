import type { FastifyInstance } from 'fastify';
import { responderError } from '../../core/http.js';
import {
  listarCategorias,
  registrarGasto,
  listarGastos,
} from './gastos.service.js';

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

  app.get('/categorias-gasto', autenticado, async (request, reply) => {
    try {
      return await reply.send(await listarCategorias());
    } catch (error) {
      return responderError(error, request, reply);
    }
  });

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
