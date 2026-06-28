import type { FastifyInstance } from 'fastify';
import { ErrorAutorizacion } from '../errors.js';
import { responderError } from '../http.js';
import { crearUsuarioEnTenant } from './usuarios.service.js';

const esquemaUsuario = {
  body: {
    type: 'object',
    required: ['nombre', 'email', 'password', 'rol'],
    additionalProperties: false,
    properties: {
      nombre: { type: 'string', minLength: 1 },
      // Forma de email sin depender de ajv-formats: algo@algo.dominio, sin espacios.
      email: { type: 'string', pattern: '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$' },
      // Misma regla de fortaleza que al crear la cuenta (adminPassword/cambiar): mínimo 8.
      password: { type: 'string', minLength: 8 },
      // Lista BLANCA: un admin de tenant solo crea administrador o empleado. ajv rechaza
      // cualquier otro valor (supervisor, roles de plataforma, strings arbitrarios).
      rol: { type: 'string', enum: ['administrador', 'empleado'] },
    },
  },
} as const;

/**
 * Alta de usuarios DENTRO del tenant (Fase 4c). Un administrador del tenant crea cuentas
 * (administrador|empleado) en su PROPIA empresa, con su membresía. El `empresaId` sale
 * del token (request.user.empresaId), NUNCA del body. Guard: autenticar + administrador
 * (un super-admin de plataforma —rol empleado— queda fuera, no es esta su vía).
 */
export async function usuariosRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: { nombre: string; email: string; password: string; rol: 'administrador' | 'empleado' };
  }>(
    '/usuarios',
    { preHandler: [app.autenticar, app.autorizar('administrador')], schema: esquemaUsuario },
    async (request, reply) => {
      try {
        // empresaId y el id del admin SIEMPRE del token (request.user), NUNCA del body.
        const { empresaId, sub } = request.user;
        if (empresaId === null) {
          // Defensa en profundidad: `autorizar('administrador')` ya exige empresa activa
          // (un admin tiene membresía). Inalcanzable en la práctica.
          throw new ErrorAutorizacion();
        }
        const creado = await crearUsuarioEnTenant(request.body, empresaId, sub);
        return await reply.code(201).send(creado);
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
