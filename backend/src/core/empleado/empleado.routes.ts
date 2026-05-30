import type { FastifyInstance } from 'fastify';
import { responderError } from '../http.js';
import {
  crearEmpleado,
  editarEmpleado,
  listarEmpleados,
  obtenerQrToken,
  regenerarQrToken,
  resetearPin,
} from './empleado.service.js';

const esquemaEmpleado = {
  body: {
    type: 'object',
    required: ['numero', 'nombre', 'sedeId', 'salarioFijo', 'pin'],
    additionalProperties: false,
    properties: {
      numero: { type: 'string', minLength: 1 },
      nombre: { type: 'string', minLength: 1 },
      sedeId: { type: 'string', minLength: 1 },
      salarioFijo: { type: 'number', minimum: 0 },
      turnoId: { type: ['string', 'null'] },
      // El PIN se valida en el servicio (4 dígitos, anti-trivial).
      pin: { type: 'string' },
    },
  },
} as const;

const esquemaEditarEmpleado = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      numero: { type: 'string', minLength: 1 },
      nombre: { type: 'string', minLength: 1 },
      sedeId: { type: 'string', minLength: 1 },
      salarioFijo: { type: 'number', minimum: 0 },
      turnoId: { type: ['string', 'null'] },
      activo: { type: 'boolean' },
    },
  },
} as const;

const esquemaPin = {
  body: {
    type: 'object',
    required: ['pin'],
    additionalProperties: false,
    properties: { pin: { type: 'string' } },
  },
} as const;

interface CuerpoEmpleado {
  numero: string;
  nombre: string;
  sedeId: string;
  salarioFijo: number;
  turnoId?: string | null;
  pin: string;
}

interface CuerpoEditarEmpleado {
  numero?: string;
  nombre?: string;
  sedeId?: string;
  salarioFijo?: number;
  turnoId?: string | null;
  activo?: boolean;
}

/**
 * Rutas de Empleado (núcleo: entidad transversal). El listado es para cualquier
 * usuario autenticado (lo consumen cobro y el cierre de caja) y NUNCA expone
 * secretos; la escritura y la rotación de secretos (QR/PIN) son solo para
 * administrador. Las rotaciones de secreto van por POST (no son reemplazos
 * idempotentes de campos).
 */
export async function empleadoRoutes(app: FastifyInstance): Promise<void> {
  const soloAdmin = {
    preHandler: [app.autenticar, app.autorizar('administrador')],
  };
  const autenticado = { preHandler: [app.autenticar] };

  app.get<{ Querystring: { incluirInactivos?: string; sedeId?: string } }>(
    '/empleados',
    autenticado,
    async (request, reply) => {
      try {
        const incluirInactivos = request.query.incluirInactivos === 'true';
        return await reply.send(
          await listarEmpleados({ incluirInactivos, sedeId: request.query.sedeId }),
        );
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.post<{ Body: CuerpoEmpleado }>(
    '/empleados',
    { ...soloAdmin, schema: esquemaEmpleado },
    async (request, reply) => {
      try {
        return await reply.code(201).send(await crearEmpleado(request.body));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.put<{ Params: { id: string }; Body: CuerpoEditarEmpleado }>(
    '/empleados/:id',
    { ...soloAdmin, schema: esquemaEditarEmpleado },
    async (request, reply) => {
      try {
        return await reply.send(await editarEmpleado(request.params.id, request.body));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  // QR: ver el actual (reimprimir) y rotar (revoca el anterior).
  app.get<{ Params: { id: string } }>(
    '/empleados/:id/qr',
    soloAdmin,
    async (request, reply) => {
      try {
        return await reply.send(await obtenerQrToken(request.params.id));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    '/empleados/:id/qr',
    soloAdmin,
    async (request, reply) => {
      try {
        return await reply.send(await regenerarQrToken(request.params.id));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  // PIN: resetearlo (rotación de secreto → POST).
  app.post<{ Params: { id: string }; Body: { pin: string } }>(
    '/empleados/:id/pin',
    { ...soloAdmin, schema: esquemaPin },
    async (request, reply) => {
      try {
        await resetearPin(request.params.id, request.body.pin);
        return await reply.code(204).send();
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
