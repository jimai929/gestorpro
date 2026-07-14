import type { FastifyInstance } from 'fastify';
import { responderError } from '../../core/http.js';
import {
  crearProveedor,
  editarProveedor,
  listarProveedores,
  registrarCompra,
  listarCompras,
  registrarPago,
  listarCuentasPorPagar,
  listarPagos,
  type EstadoPago,
} from './cuentas-por-pagar.service.js';

/**
 * GET /cuentas-por-pagar/pagos — historial de pagos. Todo opcional; los tipos se
 * validan aquí (así una `pagina` no numérica es 400, no una consulta rara).
 */
const esquemaHistorialPagos = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      proveedorId: { type: 'string', minLength: 1 },
      desde: { type: 'string', minLength: 1 },
      hasta: { type: 'string', minLength: 1 },
      estado: { type: 'string', enum: ['vigente', 'corregido', 'anulado'] },
      pagina: { type: 'integer', minimum: 1 },
      tamano: { type: 'integer', minimum: 1, maximum: 100 },
    },
  },
} as const;

const esquemaProveedor = {
  body: {
    type: 'object',
    required: ['nombre'],
    additionalProperties: false,
    properties: {
      nombre: { type: 'string', minLength: 1 },
      identificacionFiscal: { type: 'string' },
      telefono: { type: 'string' },
      personaContacto: { type: 'string' },
    },
  },
} as const;

const esquemaEditarProveedor = {
  body: {
    type: 'object',
    additionalProperties: false,
    properties: {
      nombre: { type: 'string', minLength: 1 },
      // Campos de texto: cadena para fijar, null para borrar, ausente = sin tocar.
      identificacionFiscal: { type: ['string', 'null'] },
      telefono: { type: ['string', 'null'] },
      personaContacto: { type: ['string', 'null'] },
      activo: { type: 'boolean' },
    },
  },
} as const;

const esquemaCompra = {
  body: {
    type: 'object',
    required: ['proveedorId', 'sedeId', 'numeroFactura', 'montoTotal', 'tipo', 'fechaEmision'],
    additionalProperties: false,
    properties: {
      proveedorId: { type: 'string', minLength: 1 },
      sedeId: { type: 'string', minLength: 1 },
      numeroFactura: { type: 'string', minLength: 1 },
      montoTotal: { type: 'number', exclusiveMinimum: 0 },
      tipo: { type: 'string', enum: ['contado', 'credito'] },
      fechaEmision: { type: 'string', minLength: 1 },
      // Opcional a nivel de esquema; el servicio la exige para crédito.
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
  app.post<{
    Body: { nombre: string; identificacionFiscal?: string; telefono?: string; personaContacto?: string };
  }>('/proveedores', { ...soloGestion, schema: esquemaProveedor }, async (request, reply) => {
    try {
      const proveedor = await crearProveedor(request.body);
      return await reply.code(201).send(proveedor);
    } catch (error) {
      return responderError(error, request, reply);
    }
  });

  app.put<{
    Params: { id: string };
    Body: {
      nombre?: string;
      identificacionFiscal?: string | null;
      telefono?: string | null;
      personaContacto?: string | null;
      activo?: boolean;
    };
  }>('/proveedores/:id', { ...soloGestion, schema: esquemaEditarProveedor }, async (request, reply) => {
    try {
      const proveedor = await editarProveedor(request.params.id, request.body);
      return await reply.send(proveedor);
    } catch (error) {
      return responderError(error, request, reply);
    }
  });

  // `?activo=true` devuelve solo los proveedores de alta (para los selectores).
  app.get<{ Querystring: { activo?: string } }>(
    '/proveedores',
    autenticado,
    async (request, reply) => {
      try {
        const soloActivos = request.query.activo === 'true';
        return await reply.send(await listarProveedores({ soloActivos }));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  // Compras (facturas)
  app.post<{
    Body: {
      proveedorId: string;
      sedeId: string;
      numeroFactura: string;
      montoTotal: number;
      tipo: 'contado' | 'credito';
      fechaEmision: string;
      fechaVencimiento?: string;
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

  // Historial de pagos (lectura para cualquier autenticado; corregir sigue siendo
  // supervisor/admin en POST /correcciones). Va ANTES de rutas más genéricas para
  // que no lo capture ninguna otra; el tenant sale del token vía RLS.
  app.get<{
    Querystring: {
      proveedorId?: string;
      desde?: string;
      hasta?: string;
      estado?: EstadoPago;
      pagina?: number;
      tamano?: number;
    };
  }>(
    '/cuentas-por-pagar/pagos',
    { ...autenticado, schema: esquemaHistorialPagos },
    async (request, reply) => {
      try {
        return await reply.send(await listarPagos(request.query));
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
