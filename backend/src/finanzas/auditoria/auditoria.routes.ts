import type { FastifyInstance } from 'fastify';
import { responderError } from '../../core/http.js';
import {
  auditoriaCorrecciones,
  type EntidadAuditoria,
  type AccionAuditoria,
} from './auditoria-correcciones.service.js';

/** GET /finanzas/auditoria-correcciones — todo opcional; los tipos se validan aquí. */
const esquemaAuditoria = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      desde: { type: 'string', minLength: 1 },
      hasta: { type: 'string', minLength: 1 },
      entidad: { type: 'string', enum: ['gasto', 'venta', 'pago', 'todas'] },
      accion: { type: 'string', enum: ['correccion', 'anulacion', 'todas'] },
      usuarioId: { type: 'string', minLength: 1 },
      texto: { type: 'string' },
      pagina: { type: 'integer', minimum: 1 },
      // Máximo alto para permitir la exportación a CSV del conjunto completo en una
      // sola página; la lectura real está acotada aparte (TOPE_EVENTOS_POR_ENTIDAD).
      tamano: { type: 'integer', minimum: 1, maximum: 2000 },
    },
  },
} as const;

/**
 * Centro de auditoría de correcciones financieras (solo lectura).
 *
 * `soloGestion` = supervisor/administrador; un empleado recibe 403. El tenant sale
 * del token (RLS): jamás se ven correcciones de otra empresa. La ruta NO expone
 * ninguna operación de escritura ni de corrección.
 */
export async function auditoriaFinancieraRoutes(app: FastifyInstance): Promise<void> {
  const soloGestion = {
    preHandler: [app.autenticar, app.autorizar('supervisor', 'administrador')],
  };

  app.get<{
    Querystring: {
      desde?: string;
      hasta?: string;
      entidad?: EntidadAuditoria | 'todas';
      accion?: AccionAuditoria | 'todas';
      usuarioId?: string;
      texto?: string;
      pagina?: number;
      tamano?: number;
    };
  }>(
    '/finanzas/auditoria-correcciones',
    { ...soloGestion, schema: esquemaAuditoria },
    async (request, reply) => {
      try {
        return await reply.send(await auditoriaCorrecciones(request.query));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
