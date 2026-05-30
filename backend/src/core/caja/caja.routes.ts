import type { FastifyInstance } from 'fastify';
import { responderError } from '../http.js';
import { crearCaja, editarCaja, listarCajas } from './caja.service.js';

const esquemaCaja = {
  body: {
    type: 'object',
    required: ['numero', 'nombre', 'sedeId'],
    additionalProperties: false,
    properties: {
      numero: { type: 'string', minLength: 1, maxLength: 20 },
      nombre: { type: 'string', minLength: 1 },
      sedeId: { type: 'string', minLength: 1 },
    },
  },
} as const;

const esquemaEditarCaja = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      numero: { type: 'string', minLength: 1, maxLength: 20 },
      nombre: { type: 'string', minLength: 1 },
      sedeId: { type: 'string', minLength: 1 },
      activo: { type: 'boolean' },
    },
  },
} as const;

/**
 * Rutas de Caja (núcleo: catálogo transversal por sede). El listado es para
 * cualquier usuario autenticado (lo consume el selector del cierre); la
 * escritura es solo para administrador. La baja es lógica (`activo`).
 */
export async function cajaRoutes(app: FastifyInstance): Promise<void> {
  const soloAdmin = {
    preHandler: [app.autenticar, app.autorizar('administrador')],
  };
  const autenticado = { preHandler: [app.autenticar] };

  app.get<{ Querystring: { sedeId?: string; incluirInactivas?: string } }>(
    '/cajas',
    autenticado,
    async (request, reply) => {
      try {
        const incluirInactivas = request.query.incluirInactivas === 'true';
        return await reply.send(
          await listarCajas({ sedeId: request.query.sedeId, incluirInactivas }),
        );
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.post<{ Body: { numero: string; nombre: string; sedeId: string } }>(
    '/cajas',
    { ...soloAdmin, schema: esquemaCaja },
    async (request, reply) => {
      try {
        return await reply.code(201).send(await crearCaja(request.body));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.put<{
    Params: { id: string };
    Body: { numero?: string; nombre?: string; sedeId?: string; activo?: boolean };
  }>('/cajas/:id', { ...soloAdmin, schema: esquemaEditarCaja }, async (request, reply) => {
    try {
      return await reply.send(await editarCaja(request.params.id, request.body));
    } catch (error) {
      return responderError(error, request, reply);
    }
  });
}
