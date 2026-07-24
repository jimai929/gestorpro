import type { FastifyInstance } from 'fastify';
import { responderError } from '../../core/http.js';
import { gananciaDelPeriodo, gastosPorCategoria } from './dashboard.service.js';
import {
  flujoCajaOperativo,
  type TipoFlujo,
  type EstadoFlujo,
  type OrdenFlujo,
} from './flujo-caja.service.js';

/** GET /finanzas/flujo-caja — rango obligatorio; el resto opcional, tipado aquí. */
const esquemaFlujo = {
  querystring: {
    type: 'object',
    required: ['desde', 'hasta'],
    additionalProperties: false,
    properties: {
      desde: { type: 'string', minLength: 1 },
      hasta: { type: 'string', minLength: 1 },
      tipo: { type: 'string', enum: ['todos', 'ingreso', 'gasto', 'pago_proveedor'] },
      sedeId: { type: 'string', minLength: 1 },
      proveedorId: { type: 'string', minLength: 1 },
      categoriaId: { type: 'string', minLength: 1 },
      estado: { type: 'string', enum: ['todos', 'vigente', 'corregido', 'anulado'] },
      texto: { type: 'string' },
      orden: { type: 'string', enum: ['fecha_desc', 'fecha_asc', 'monto_desc', 'monto_asc'] },
      pagina: { type: 'integer', minimum: 1 },
      tamano: { type: 'integer', minimum: 1, maximum: 2000 },
    },
  },
} as const;

const esquemaRango = {
  querystring: {
    type: 'object',
    required: ['desde', 'hasta'],
    properties: {
      // El formato se exige aquí (400 del schema); un mes fuera de rango
      // (2026-13-01) lo remata fechaDeFiltro en el servicio (400 también).
      // Un desborde de DÍA (2026-02-31) rueda de mes — límite documentado
      // en core/fechas.ts.
      desde: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      hasta: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
      sedeId: { type: 'string' },
      // Acotan solo las ventas (auditoría de descuadres por cajera/turno).
      cajera: { type: 'string' },
      turno: { type: 'string', enum: ['manana', 'tarde', 'noche'] },
    },
  },
} as const;

/**
 * Rutas del dashboard de ganancias. Período flexible (desde/hasta obligatorios)
 * y sede opcional. Para cualquier usuario autenticado.
 */
export async function dashboardRoutes(app: FastifyInstance): Promise<void> {
  const autenticado = { preHandler: [app.autenticar] };
  // El flujo de caja es una vista de gestión (finanzas sensibles): supervisor/admin.
  const soloGestion = { preHandler: [app.autenticar, app.autorizar('supervisor', 'administrador')] };

  // Flujo de caja operativo (solo lectura; jamás escribe). El tenant sale del token (RLS).
  app.get<{
    Querystring: {
      desde: string; hasta: string; tipo?: TipoFlujo | 'todos'; sedeId?: string;
      proveedorId?: string; categoriaId?: string; estado?: EstadoFlujo | 'todos';
      texto?: string; orden?: OrdenFlujo; pagina?: number; tamano?: number;
    };
  }>(
    '/finanzas/flujo-caja',
    { ...soloGestion, schema: esquemaFlujo },
    async (request, reply) => {
      try {
        return await reply.send(await flujoCajaOperativo(request.query));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.get<{
    Querystring: { desde: string; hasta: string; sedeId?: string; cajera?: string; turno?: string };
  }>(
    '/dashboard/ganancia',
    { ...autenticado, schema: esquemaRango },
    async (request, reply) => {
      try {
        return await reply.send(await gananciaDelPeriodo(request.query));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.get<{ Querystring: { desde: string; hasta: string; sedeId?: string } }>(
    '/dashboard/gastos-por-categoria',
    { ...autenticado, schema: esquemaRango },
    async (request, reply) => {
      try {
        return await reply.send(await gastosPorCategoria(request.query));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
