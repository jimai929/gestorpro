import type { FastifyInstance } from 'fastify';
import { responderError } from '../../core/http.js';
import {
  barrerHuerfanos,
  corregirJornada,
  crearJornadaManual,
  listarJornadas,
} from './jornada.service.js';

const esquemaCorreccion = {
  body: {
    type: 'object',
    required: ['jornadaId', 'motivo'],
    additionalProperties: false,
    properties: {
      jornadaId: { type: 'string', minLength: 1 },
      motivo: { type: 'string', minLength: 1 },
      minutosTrabajados: { type: 'integer', minimum: 0 },
      minutosExtra: { type: 'integer', minimum: 0 },
      montoExtra: { type: 'number', minimum: 0 },
      resolverAnomalia: { type: 'boolean' },
    },
  },
} as const;

const esquemaJornadaManual = {
  body: {
    type: 'object',
    required: ['empleadoId', 'fecha', 'motivo'],
    additionalProperties: false,
    properties: {
      empleadoId: { type: 'string', minLength: 1 },
      fecha: { type: 'string', minLength: 1 },
      motivo: { type: 'string', minLength: 1 },
      minutosTrabajados: { type: 'integer', minimum: 0 },
      minutosExtra: { type: 'integer', minimum: 0 },
      montoExtra: { type: 'number', minimum: 0 },
    },
  },
} as const;

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
        // listarJornadas corre bajo txEmpresa (RLS): GET /jornadas (autenticado) ve
        // solo las jornadas del tenant del token. El empresaId sale del contexto, no
        // del query (que solo filtra por empleado/fecha).
        const jornadas = await listarJornadas(request.query);
        return await reply.send(jornadas.map(aJornadaDto));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  // Corrección de una jornada por el jefe (registra Correccion inmutable).
  app.post<{
    Body: {
      jornadaId: string;
      motivo: string;
      minutosTrabajados?: number;
      minutosExtra?: number;
      montoExtra?: number;
      resolverAnomalia?: boolean;
    };
  }>(
    '/jornadas/correccion',
    {
      preHandler: [app.autenticar, app.autorizar('supervisor', 'administrador')],
      schema: esquemaCorreccion,
    },
    async (request, reply) => {
      try {
        const jornada = await corregirJornada({ ...request.body, jefeId: request.user.sub });
        return await reply.send(aJornadaDto(jornada));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  // Alta manual de jornada para días sin fichajes (p. ej. corte de internet en
  // la sede): no hay jornada que corregir, así que el jefe la crea a mano.
  app.post<{
    Body: {
      empleadoId: string;
      fecha: string;
      motivo: string;
      minutosTrabajados?: number;
      minutosExtra?: number;
      montoExtra?: number;
    };
  }>(
    '/jornadas/manual',
    {
      preHandler: [app.autenticar, app.autorizar('supervisor', 'administrador')],
      schema: esquemaJornadaManual,
    },
    async (request, reply) => {
      try {
        const jornada = await crearJornadaManual({ ...request.body, jefeId: request.user.sub });
        return await reply.code(201).send(aJornadaDto(jornada));
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
