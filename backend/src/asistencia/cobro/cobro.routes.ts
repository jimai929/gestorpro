import type { FastifyInstance } from 'fastify';
import { responderError } from '../../core/http.js';
import {
  obtenerConfiguracionCobro,
  definirConfiguracionCobro,
  solicitarCobro,
  aprobarCobro,
  rechazarCobro,
  pagarCobro,
  listarCobros,
} from './cobro.service.js';
import type { EstadoSolicitudCobro } from '../../generated/prisma/enums.js';

/** Serializa el umbral (Decimal) a number para el contrato de la API. */
function aConfigDto<T extends { umbralAprobacion: { toString(): string } }>(c: T) {
  return { ...c, umbralAprobacion: Number(c.umbralAprobacion) };
}

/** Serializa el monto (Decimal) a number. */
function aCobroDto<T extends { monto: { toString(): string } }>(s: T) {
  return { ...s, monto: Number(s.monto) };
}

const esquemaSolicitud = {
  body: {
    type: 'object',
    required: ['empleadoId', 'monto'],
    additionalProperties: false,
    properties: {
      empleadoId: { type: 'string', minLength: 1 },
      monto: { type: 'number', exclusiveMinimum: 0 },
    },
  },
} as const;

const esquemaRechazo = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: { motivo: { type: 'string' } },
  },
} as const;

const esquemaConfig = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      porcentajeCobrable: { type: 'integer', minimum: 0, maximum: 100 },
      umbralAprobacion: { type: 'number', minimum: 0 },
    },
  },
} as const;

/**
 * Rutas de configuración del cobro. Lectura para cualquier usuario autenticado;
 * la definición la hace solo el administrador. (El flujo de saldo, solicitudes
 * y pago llega en 6.2–6.4.)
 */
export async function cobroRoutes(app: FastifyInstance): Promise<void> {
  app.get('/configuracion-cobro', { preHandler: [app.autenticar] }, async (request, reply) => {
    try {
      return await reply.send(aConfigDto(await obtenerConfiguracionCobro()));
    } catch (error) {
      return responderError(error, request, reply);
    }
  });

  app.put<{ Body: { porcentajeCobrable?: number; umbralAprobacion?: number } }>(
    '/configuracion-cobro',
    {
      preHandler: [app.autenticar, app.autorizar('administrador')],
      schema: esquemaConfig,
    },
    async (request, reply) => {
      try {
        return await reply.send(aConfigDto(await definirConfiguracionCobro(request.body)));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  // Solicitar un cobro. Valida contra el saldo al crear; Modelo B decide si nace
  // directo (aprobada) o pendiente. El empleadoId viene en el cuerpo.
  app.post<{ Body: { empleadoId: string; monto: number } }>(
    '/cobros',
    { preHandler: [app.autenticar], schema: esquemaSolicitud },
    async (request, reply) => {
      try {
        return await reply.code(201).send(aCobroDto(await solicitarCobro(request.body)));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.get<{ Querystring: { empleadoId?: string; estado?: EstadoSolicitudCobro } }>(
    '/cobros',
    { preHandler: [app.autenticar] },
    async (request, reply) => {
      try {
        const cobros = await listarCobros(request.query);
        return await reply.send(cobros.map(aCobroDto));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/cobros/:id/aprobar',
    { preHandler: [app.autenticar, app.autorizar('supervisor', 'administrador')] },
    async (request, reply) => {
      try {
        return await reply.send(aCobroDto(await aprobarCobro(request.params.id, request.user.sub)));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.post<{ Params: { id: string }; Body: { motivo?: string } }>(
    '/cobros/:id/rechazar',
    {
      preHandler: [app.autenticar, app.autorizar('supervisor', 'administrador')],
      schema: esquemaRechazo,
    },
    async (request, reply) => {
      try {
        return await reply.send(
          aCobroDto(await rechazarCobro(request.params.id, request.user.sub, request.body.motivo)),
        );
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  // Marcar pagado: genera el Gasto en finanzas (referenciaOrigen) en la misma
  // transacción. Solo administrador (es quien entrega el efectivo).
  app.post<{ Params: { id: string } }>(
    '/cobros/:id/pagar',
    { preHandler: [app.autenticar, app.autorizar('administrador')] },
    async (request, reply) => {
      try {
        return await reply.send(aCobroDto(await pagarCobro(request.params.id, request.user.sub)));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
