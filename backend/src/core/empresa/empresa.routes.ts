import type { FastifyInstance } from 'fastify';
import { responderError } from '../http.js';
import { crearEmpresa } from './empresa.service.js';

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
 * responde 404 a cualquier otro, no revela el endpoint). Fase 4c, alcance mínimo:
 * solo el alta de empresa (crear tenant + su primer admin). No hay listar/baja aún.
 */
export async function empresaRoutes(app: FastifyInstance): Promise<void> {
  const soloSuper = { preHandler: [app.autenticar, app.soloPlataforma] };

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
}
