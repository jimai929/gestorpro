import type { FastifyInstance } from 'fastify';
import { responderError } from '../../core/http.js';
import {
  obtenerConfiguracionCobro,
  definirConfiguracionCobro,
} from './cobro.service.js';

/** Serializa el umbral (Decimal) a number para el contrato de la API. */
function aConfigDto<T extends { umbralAprobacion: { toString(): string } }>(c: T) {
  return { ...c, umbralAprobacion: Number(c.umbralAprobacion) };
}

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
}
