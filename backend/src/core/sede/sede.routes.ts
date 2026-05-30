import type { FastifyInstance } from 'fastify';
import { responderError } from '../http.js';
import { crearSede, editarSede, listarSedes } from './sede.service.js';

const esquemaSede = {
  body: {
    type: 'object',
    required: ['nombre'],
    additionalProperties: false,
    properties: {
      nombre: { type: 'string', minLength: 1 },
      modoExcepcion: { type: 'string', enum: ['pin', 'supervisor', 'ambos'] },
    },
  },
} as const;

const esquemaEditarSede = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      nombre: { type: 'string', minLength: 1 },
      modoExcepcion: { type: 'string', enum: ['pin', 'supervisor', 'ambos'] },
      activo: { type: 'boolean' },
    },
  },
} as const;

/**
 * Rutas de Sede (núcleo). Listado para cualquier usuario autenticado (lo usan
 * los formularios de finanzas y asistencia); alta y edición solo para
 * administrador. La baja es lógica (`activo`), nunca física.
 */
export async function sedeRoutes(app: FastifyInstance): Promise<void> {
  const soloAdmin = {
    preHandler: [app.autenticar, app.autorizar('administrador')],
  };
  const autenticado = { preHandler: [app.autenticar] };

  // `?incluirInactivas=true` lista también las dadas de baja (pantalla de
  // gestión). El default sigue devolviendo solo activas: los selectores
  // existentes no cambian.
  app.get<{ Querystring: { incluirInactivas?: string } }>(
    '/sedes',
    autenticado,
    async (request, reply) => {
      try {
        const incluirInactivas = request.query.incluirInactivas === 'true';
        return await reply.send(await listarSedes({ incluirInactivas }));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.post<{ Body: { nombre: string; modoExcepcion?: 'pin' | 'supervisor' | 'ambos' } }>(
    '/sedes',
    { ...soloAdmin, schema: esquemaSede },
    async (request, reply) => {
      try {
        return await reply.code(201).send(await crearSede(request.body));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.put<{
    Params: { id: string };
    Body: { nombre?: string; modoExcepcion?: 'pin' | 'supervisor' | 'ambos'; activo?: boolean };
  }>('/sedes/:id', { ...soloAdmin, schema: esquemaEditarSede }, async (request, reply) => {
    try {
      return await reply.send(await editarSede(request.params.id, request.body));
    } catch (error) {
      return responderError(error, request, reply);
    }
  });
}
