import type { FastifyInstance } from 'fastify';
import { responderError } from '../../core/http.js';
import { gananciaDelPeriodo, gastosPorCategoria } from './dashboard.service.js';

const esquemaRango = {
  querystring: {
    type: 'object',
    required: ['desde', 'hasta'],
    properties: {
      desde: { type: 'string', minLength: 1 },
      hasta: { type: 'string', minLength: 1 },
      sedeId: { type: 'string' },
      // Acotan solo las ventas (auditoría de descuadres por cajera/turno).
      cajera: { type: 'string' },
      turno: { type: 'string', enum: ['manana', 'tarde', 'noche'] },
    },
  },
} as const;

/**
 * Rutas del dashboard de ganancias. Período flexible (desde/hasta obligatorios)
 * y sede opcional. Para cualquier usuario autenticado.
 */
export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  const autenticado = { preHandler: [app.autenticar] };

  app.get<{
    Querystring: { desde: string; hasta: string; sedeId?: string; cajera?: string; turno?: string };
  }>(
    '/dashboard/ganancia',
    { ...autenticado, schema: esquemaRango },
    async (request, reply) => {
      try {
        return await reply.send(await gananciaDelPeriodo(request.query));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.get<{ Querystring: { desde: string; hasta: string; sedeId?: string } }>(
    '/dashboard/gastos-por-categoria',
    { ...autenticado, schema: esquemaRango },
    async (request, reply) => {
      try {
        return await reply.send(await gastosPorCategoria(request.query));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
