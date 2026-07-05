import type { FastifyInstance } from 'fastify';
import { responderError } from '../http.js';
import {
  cambiarEstadoEmpresa,
  crearEmpresa,
  crearMembresia,
  listarEmpresas,
} from './empresa.service.js';

const PATRON_UUID =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

const esquemaEstadoEmpresa = {
  params: {
    type: 'object',
    required: ['empresaId'],
    additionalProperties: false,
    properties: {
      // uuid validado en la puerta: un id malformado es 400, nunca llega a Prisma.
      empresaId: { type: 'string', pattern: PATRON_UUID },
    },
  },
  body: {
    type: 'object',
    required: ['activo'],
    additionalProperties: false,
    properties: {
      // ÚNICO campo mutable por esta ruta: la baja/reactivación lógica del tenant.
      activo: { type: 'boolean' },
    },
  },
} as const;

const esquemaMembresia = {
  params: {
    type: 'object',
    required: ['empresaId'],
    additionalProperties: false,
    properties: {
      // uuid validado en la puerta: un id malformado es 400, nunca llega a Prisma.
      empresaId: { type: 'string', pattern: PATRON_UUID },
    },
  },
  body: {
    type: 'object',
    required: ['email', 'rol'],
    additionalProperties: false,
    properties: {
      // LOOKUP, no creación: se identifica una cuenta EXISTENTE por email exacto, así
      // que la puerta debe ser tan permisiva como la vía que crea las cuentas objetivo.
      // POST /empresas (adminEmail) y el login validan solo minLength:3 SIN patrón: un
      // admin con email no-canónico (p.ej. 'jefe@interno', sin punto) existe y se
      // loguea; un patrón estricto aquí lo dejaría inalcanzable por API. La comparación
      // real la hace crearMembresia (findUnique por email exacto).
      email: { type: 'string', minLength: 3 },
      // Lista BLANCA: la plataforma asigna administrador o empleado, nunca otro valor.
      rol: { type: 'string', enum: ['administrador', 'empleado'] },
    },
  },
} as const;

const esquemaEmpresa = {
  body: {
    type: 'object',
    required: ['nombre', 'slug', 'adminNombre', 'adminEmail', 'adminPassword'],
    additionalProperties: false,
    properties: {
      nombre: { type: 'string', minLength: 1 },
      // slug URL-safe: minúsculas, dígitos y guiones (subdominio futuro acme.gestorpro.app).
      slug: { type: 'string', minLength: 1, pattern: '^[a-z0-9-]+$' },
      adminNombre: { type: 'string', minLength: 1 },
      adminEmail: { type: 'string', minLength: 3 },
      adminPassword: { type: 'string', minLength: 8 },
    },
  },
} as const;

/**
 * Rutas de PLATAFORMA (SaaS): gestión de tenants. SOLO super-admin (`soloPlataforma`
 * responde 404 a cualquier otro, no revela el endpoint). Alcance: alta de empresa
 * (crear tenant + su primer admin), listado, baja/reactivación lógica y alta de
 * membresías multi-empresa sobre usuarios existentes.
 *
 *   POST  /empresas                        -> 201 (tenant + primer admin)
 *   GET   /empresas                        -> 200 (listado)
 *   PATCH /empresas/:empresaId             -> 200 (baja/reactivación lógica)
 *   POST  /empresas/:empresaId/membresias  -> 201 (membresía de usuario existente)
 */
export async function empresaRoutes(app: FastifyInstance): Promise<void> {
  // Guards en onRequest, NO en preHandler: en el ciclo de Fastify la validación de
  // schema corre ENTRE ambos (onRequest → parsing → validation → preHandler). Con los
  // guards en preHandler, un no-super-admin (o un cliente sin token) que enviara input
  // malformado recibiría el 400 de ajv ANTES de los guards — revelando la existencia y
  // el contrato de las rutas de plataforma y rompiendo el invariante "soloPlataforma
  // responde 404 a cualquier otro". En onRequest los guards cortan primero SIEMPRE.
  const soloSuper = { onRequest: [app.autenticar, app.soloPlataforma] };

  app.post<{
    Body: {
      nombre: string;
      slug: string;
      adminNombre: string;
      adminEmail: string;
      adminPassword: string;
    };
  }>('/empresas', { ...soloSuper, schema: esquemaEmpresa }, async (request, reply) => {
    try {
      // El super-admin que ejecuta la acción SIEMPRE sale del token (request.user.sub),
      // NUNCA del body: es contexto de seguridad, igual que usuarioId.
      const creada = await crearEmpresa(request.body, request.user.sub);
      return await reply.code(201).send(creada);
    } catch (error) {
      return responderError(error, request, reply);
    }
  });

  // Listar tenants (solo super-admin). Lectura cross-tenant PROTEGIDA por el guard de
  // RUTA (soloPlataforma → 404 al resto), NO por RLS: empresa/membresia/usuario no tienen
  // RLS, así que gestorpro_app hace el SELECT+join directo (sin bypass; el bypass de POST
  // era solo para escribir en auditoria).
  app.get('/empresas', soloSuper, async (_request, reply) => {
    const empresas = await listarEmpresas();
    return reply.code(200).send(empresas);
  });

  // Alta de MEMBRESÍA multi-empresa: añade un usuario EXISTENTE (por email) a la
  // empresa del path con rol per-tenant. Única vía que crea segundas membresías;
  // el estado/contraseña de una cuenta multi-empresa se gestiona con el super-admin
  // ENTRANDO a la empresa (dos niveles, ver usuarios.service).
  app.post<{ Params: { empresaId: string }; Body: { email: string; rol: 'administrador' | 'empleado' } }>(
    '/empresas/:empresaId/membresias',
    { ...soloSuper, schema: esquemaMembresia },
    async (request, reply) => {
      try {
        // El super-admin que ejecuta SIEMPRE sale del token (request.user.sub).
        const creada = await crearMembresia(
          request.params.empresaId,
          request.body.email,
          request.body.rol,
          request.user.sub,
        );
        return await reply.code(201).send(creada);
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  // Baja/reactivación LÓGICA del tenant (Empresa.activo; nunca se borra). Desactivar
  // expulsa las sesiones de refresco de sus usuarios (login/refresh ya rechazan
  // empresas inactivas, fail-closed); reactivar solo restaura el acceso.
  app.patch<{ Params: { empresaId: string }; Body: { activo: boolean } }>(
    '/empresas/:empresaId',
    { ...soloSuper, schema: esquemaEstadoEmpresa },
    async (request, reply) => {
      try {
        // El super-admin que ejecuta SIEMPRE sale del token (request.user.sub).
        const actualizada = await cambiarEstadoEmpresa(
          request.params.empresaId,
          request.user.sub,
          request.body.activo,
        );
        return await reply.code(200).send(actualizada);
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
