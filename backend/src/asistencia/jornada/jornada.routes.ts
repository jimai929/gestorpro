import type { FastifyInstance } from 'fastify';
import { prisma } from '../../core/prisma.js';
import { responderError } from '../../core/http.js';
import { barrerHuerfanos } from './jornada.service.js';

/** Serializa el monto (Decimal) a number para el contrato de la API. */
function aJornadaDto<T extends { montoExtra: { toString(): string } }>(j: T) {
  return { ...j, montoExtra: Number(j.montoExtra) };
}

/**
 * Rutas de jornada. Listado para usuarios autenticados (consulta de horas);
 * el barrido de huérfanos lo dispara el job nocturno (o un administrador).
 */
export async function jornadaRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { empleadoId?: string; desde?: string; hasta?: string } }>(
    '/jornadas',
    { preHandler: [app.autenticar] },
    async (request, reply) => {
      try {
        const { empleadoId, desde, hasta } = request.query;
        const jornadas = await prisma.jornada.findMany({
          where: {
            ...(empleadoId ? { empleadoId } : {}),
            ...(desde || hasta
              ? {
                  fecha: {
                    ...(desde ? { gte: new Date(desde) } : {}),
                    ...(hasta ? { lte: new Date(hasta) } : {}),
                  },
                }
              : {}),
          },
          orderBy: { fecha: 'desc' },
          include: { empleado: { select: { numero: true, nombre: true } } },
        });
        return await reply.send(jornadas.map(aJornadaDto));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  // Disparador del job nocturno de huérfanos (cron en producción; admin manual).
  app.post(
    '/jornadas/barrer-huerfanos',
    { preHandler: [app.autenticar, app.autorizar('administrador')] },
    async (request, reply) => {
      try {
        const marcadas = await barrerHuerfanos();
        return await reply.send({ marcadas });
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
