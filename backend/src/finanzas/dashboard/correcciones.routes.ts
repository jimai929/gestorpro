import type { FastifyInstance } from 'fastify';
import { responderError } from '../../core/http.js';
import { ErrorValidacion } from '../../core/errors.js';
import {
  corregirMovimiento,
  type EntradaCorreccion,
} from '../../shared/services/correccion.service.js';
import { adaptadorPago } from '../cuentas-por-pagar/pago.correccion.js';
import { adaptadorGasto } from '../gastos/gasto.correccion.js';
import { adaptadorVenta } from './venta.correccion.js';

const esquemaCorreccion = {
  body: {
    type: 'object',
    required: ['entidad', 'movimientoId', 'motivo'],
    additionalProperties: false,
    properties: {
      entidad: { type: 'string', enum: ['pago', 'gasto', 'venta'] },
      movimientoId: { type: 'string', minLength: 1 },
      motivo: { type: 'string', minLength: 1 },
      // Pago y gasto se corrigen con un único monto.
      montoCorregido: { type: 'number', minimum: 0 },
      // El cierre de caja se corrige con el arqueo corregido (desglose por tipo).
      detallesCorregidos: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          required: ['tipoArqueo', 'monto'],
          additionalProperties: false,
          properties: {
            tipoArqueo: { type: 'string', enum: ['efectivo', 'tarjeta', 'yappy', 'loteria'] },
            monto: { type: 'number', minimum: 0 },
          },
        },
      },
    },
  },
} as const;

/**
 * Endpoint genérico de corrección: UNO solo para las tres entidades de dinero.
 * Mapea `entidad` a su adaptador y delega en el servicio de corrección (reverso
 * + corrección). Si se omite `montoCorregido`, es una anulación pura. Solo
 * supervisor/administrador. El `usuarioId` sale del token.
 */
export async function correccionesRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: {
      entidad: 'pago' | 'gasto' | 'venta';
      movimientoId: string;
      motivo: string;
      montoCorregido?: number;
      detallesCorregidos?: Array<{ tipoArqueo: string; monto: number }>;
    };
  }>(
    '/correcciones',
    {
      preHandler: [app.autenticar, app.autorizar('supervisor', 'administrador')],
      schema: esquemaCorreccion,
    },
    async (request, reply) => {
      const { entidad, movimientoId, motivo, montoCorregido, detallesCorregidos } = request.body;
      const entrada: EntradaCorreccion = {
        movimientoId,
        motivo,
        usuarioId: request.user.sub,
        ...(montoCorregido !== undefined ? { montoCorregido } : {}),
        ...(detallesCorregidos !== undefined ? { detallesCorregidos } : {}),
      };
      try {
        // Cada rama usa su adaptador concreto (evita problemas de varianza).
        switch (entidad) {
          case 'pago':
            return await reply.code(201).send(await corregirMovimiento(adaptadorPago, entrada));
          case 'gasto':
            return await reply.code(201).send(await corregirMovimiento(adaptadorGasto, entrada));
          case 'venta':
            return await reply.code(201).send(await corregirMovimiento(adaptadorVenta, entrada));
          default:
            throw new ErrorValidacion('Entidad de corrección no válida.');
        }
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
