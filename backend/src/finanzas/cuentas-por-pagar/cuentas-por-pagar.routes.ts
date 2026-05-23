import type { FastifyInstance } from 'fastify';
import { responderError } from '../../core/http.js';
import {
  crearProveedor,
  listarProveedores,
  registrarCompra,
  listarCompras,
  registrarPago,
  listarCuentasPorPagar,
} from './cuentas-por-pagar.service.js';

const esquemaProveedor = {
  body: {
    type: 'object',
    required: ['nombre'],
    additionalProperties: false,
    properties: {
      nombre: { type: 'string', minLength: 1 },
      identificacionFiscal: { type: 'string' },
    },
  },
} as const;

const esquemaCompra = {
  body: {
    type: 'object',
    required: [
      'proveedorId',
      'sedeId',
      'numeroFactura',
      'montoTotal',
      'fechaEmision',
      'fechaVencimiento',
    ],
    additionalProperties: false,
    properties: {
      proveedorId: { type: 'string', minLength: 1 },
      sedeId: { type: 'string', minLength: 1 },
      numeroFactura: { type: 'string', minLength: 1 },
      montoTotal: { type: 'number', exclusiveMinimum: 0 },
      fechaEmision: { type: 'string', minLength: 1 },
      fechaVencimiento: { type: 'string', minLength: 1 },
    },
  },
} as const;

const esquemaPago = {
  body: {
    type: 'object',
    required: ['compraId', 'monto'],
    additionalProperties: false,
    properties: {
      compraId: { type: 'string', minLength: 1 },
      monto: { type: 'number', exclusiveMinimum: 0 },
      fechaPago: { type: 'string' },
    },
  },
} as const;

/**
 * Rutas de cuentas por pagar: proveedores, compras (facturas), pagos (abonos) y
 * el listado de la vista cuenta_por_pagar. Lectura para cualquier usuario
 * autenticado; escritura para supervisor o administrador. El `usuarioId` de un
 * pago sale del token, nunca del body.
 */
export async function cuentasPorPagarRoutes(app: FastifyInstance): Promise<void> {
  const soloGestion = {
    preHandler: [app.autenticar, app.autorizar('supervisor', 'administrador')],
  };
  const autenticado = { preHandler: [app.autenticar] };

  // Proveedores
  app.post<{ Body: { nombre: string; identificacionFiscal?: string } }>(
    '/proveedores',
    { ...soloGestion, schema: esquemaProveedor },
    async (request, reply) => {
      try {
        const proveedor = await crearProveedor(request.body);
        return await reply.code(201).send(proveedor);
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.get('/proveedores', autenticado, async (request, reply) => {
    try {
      return await reply.send(await listarProveedores());
    } catch (error) {
      return responderError(error, request, reply);
    }
  });

  // Compras (facturas)
  app.post<{
    Body: {
      proveedorId: string;
      sedeId: string;
      numeroFactura: string;
      montoTotal: number;
      fechaEmision: string;
      fechaVencimiento: string;
    };
  }>('/compras', { ...soloGestion, schema: esquemaCompra }, async (request, reply) => {
    try {
      const compra = await registrarCompra(request.body);
      return await reply.code(201).send(compra);
    } catch (error) {
      return responderError(error, request, reply);
    }
  });

  app.get<{ Querystring: { sedeId?: string } }>(
    '/compras',
    autenticado,
    async (request, reply) => {
      try {
        return await reply.send(await listarCompras({ sedeId: request.query.sedeId }));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  // Pagos (abonos)
  app.post<{ Body: { compraId: string; monto: number; fechaPago?: string } }>(
    '/pagos',
    { ...soloGestion, schema: esquemaPago },
    async (request, reply) => {
      try {
        const pago = await registrarPago({
          ...request.body,
          usuarioId: request.user.sub, // del token, nunca del body
        });
        return await reply.code(201).send(pago);
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  // Listado de cuentas por pagar (vista derivada)
  app.get<{ Querystring: { sedeId?: string; estado?: string } }>(
    '/cuentas-por-pagar',
    autenticado,
    async (request, reply) => {
      try {
        const cuentas = await listarCuentasPorPagar({
          sedeId: request.query.sedeId,
          estado: request.query.estado,
        });
        return await reply.send(cuentas);
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
