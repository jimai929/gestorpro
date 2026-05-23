import type { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { responderError } from '../http.js';

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

/**
 * Rutas de Sede (núcleo). Listado para cualquier usuario autenticado (lo usan
 * los formularios de finanzas y asistencia); alta solo para administrador.
 */
export async function sedeRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sedes', { preHandler: [app.autenticar] }, async (request, reply) => {
    try {
      const sedes = await prisma.sede.findMany({
        where: { activo: true },
        orderBy: { nombre: 'asc' },
      });
      return await reply.send(sedes);
    } catch (error) {
      return responderError(error, request, reply);
    }
  });

  app.post<{ Body: { nombre: string; modoExcepcion?: 'pin' | 'supervisor' | 'ambos' } }>(
    '/sedes',
    {
      preHandler: [app.autenticar, app.autorizar('administrador')],
      schema: esquemaSede,
    },
    async (request, reply) => {
      try {
        const sede = await prisma.sede.create({
          data: {
            nombre: request.body.nombre,
            ...(request.body.modoExcepcion
              ? { modoExcepcion: request.body.modoExcepcion }
              : {}),
          },
        });
        return await reply.code(201).send(sede);
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
