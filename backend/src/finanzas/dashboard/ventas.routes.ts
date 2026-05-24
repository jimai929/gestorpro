import type { FastifyInstance } from 'fastify';
import { responderError } from '../../core/http.js';
import { registrarVenta, listarVentas } from './ventas.service.js';

const esquemaVenta = {
  body: {
    type: 'object',
    required: ['sedeId', 'fechaOperacion', 'monto'],
    additionalProperties: false,
    properties: {
      sedeId: { type: 'string', minLength: 1 },
      fechaOperacion: { type: 'string', minLength: 1 },
      monto: { type: 'number', minimum: 0 },
    },
  },
} as const;

/**
 * Rutas de ventas diarias: registro del cierre del día y listado por período.
 * Lectura para autenticados; registro para supervisor o administrador. El
 * `usuarioId` sale del token. Un cierre duplicado (misma sede y fecha) → 409.
 */
export async function ventasRoutes(app: FastifyInstance): Promise<void> {
  const soloGestion = {
    preHandler: [app.autenticar, app.autorizar('supervisor', 'administrador')],
  };
  const autenticado = { preHandler: [app.autenticar] };

  app.post<{ Body: { sedeId: string; fechaOperacion: string; monto: number } }>(
    '/ventas',
    { ...soloGestion, schema: esquemaVenta },
    async (request, reply) => {
      try {
        const venta = await registrarVenta({
          ...request.body,
          usuarioId: request.user.sub,
        });
        return await reply.code(201).send(venta);
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.get<{ Querystring: { desde?: string; hasta?: string; sedeId?: string } }>(
    '/ventas',
    autenticado,
    async (request, reply) => {
      try {
        const { desde, hasta, sedeId } = request.query;
        return await reply.send(await listarVentas({ desde, hasta, sedeId }));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
