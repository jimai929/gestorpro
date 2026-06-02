import type { FastifyInstance } from 'fastify';
import { responderError } from '../../core/http.js';
import { registrarVenta, listarVentas, listarCajeras, type LineaArqueo } from './ventas.service.js';

const PATRON_HORA = '^([01][0-9]|2[0-3]):[0-5][0-9]$';

const esquemaVenta = {
  body: {
    type: 'object',
    required: ['sedeId', 'fechaOperacion', 'turno', 'cajera', 'cerradoPor', 'detalles'],
    additionalProperties: false,
    properties: {
      sedeId: { type: 'string', minLength: 1 },
      fechaOperacion: { type: 'string', minLength: 1 },
      turno: { type: 'string', enum: ['manana', 'tarde', 'noche'] },
      // Snapshot legible de la cajera ("E001 - Nombre Apellido"); 120 holgado.
      cajera: { type: 'string', minLength: 1, maxLength: 120 },
      cerradoPor: { type: 'string', minLength: 1 },
      horaApertura: { type: 'string', pattern: PATRON_HORA },
      horaCierre: { type: 'string', pattern: PATRON_HORA },
      detalles: {
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

interface CuerpoVenta {
  sedeId: string;
  fechaOperacion: string;
  turno: 'manana' | 'tarde' | 'noche';
  cajera: string;
  cerradoPor: string;
  horaApertura?: string;
  horaCierre?: string;
  detalles: LineaArqueo[];
}

/**
 * Rutas de cierre de caja: registro del cierre de un turno (con su arqueo) y
 * listado por período, filtrable por cajera y turno. Lectura para autenticados;
 * registro para supervisor o administrador. El `usuarioId` sale del token. Un
 * cierre duplicado (misma sede, fecha, turno y cajera) → 409.
 */
export async function ventasRoutes(app: FastifyInstance): Promise<void> {
  const soloGestion = {
    preHandler: [app.autenticar, app.autorizar('supervisor', 'administrador')],
  };
  const autenticado = { preHandler: [app.autenticar] };

  app.post<{ Body: CuerpoVenta }>(
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

  app.get<{
    Querystring: { desde?: string; hasta?: string; sedeId?: string; cajera?: string; turno?: string };
  }>('/ventas', autenticado, async (request, reply) => {
    try {
      const { desde, hasta, sedeId, cajera, turno } = request.query;
      return await reply.send(await listarVentas({ desde, hasta, sedeId, cajera, turno }));
    } catch (error) {
      return responderError(error, request, reply);
    }
  });

  // Valores distintos de cajera presentes en los cierres (para el filtro del
  // dashboard; incluye los valores legacy/texto libre).
  app.get('/ventas/cajeras', autenticado, async (request, reply) => {
    try {
      return await reply.send(await listarCajeras());
    } catch (error) {
      return responderError(error, request, reply);
    }
  });
}
