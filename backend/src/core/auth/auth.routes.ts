import type { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { ErrorAutenticacion } from '../errors.js';
import { crearServicioAuth } from './auth.service.js';

const TTL_ACCESS = process.env.ACCESS_TOKEN_TTL ?? '15m';

const esquemaLogin = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    additionalProperties: false,
    properties: {
      email: { type: 'string', minLength: 3 },
      password: { type: 'string', minLength: 1 },
    },
  },
} as const;

const esquemaRefresh = {
  body: {
    type: 'object',
    required: ['refreshToken'],
    additionalProperties: false,
    properties: {
      refreshToken: { type: 'string', minLength: 1 },
    },
  },
} as const;

/**
 * Rutas de autenticación, montadas bajo el prefijo /auth:
 *   POST /auth/login    email + contraseña  -> access + refresh + usuario
 *   POST /auth/refresh  refresh token       -> nuevo access token
 *   POST /auth/logout   refresh token       -> 204 (invalida la sesión)
 *   GET  /auth/me       (protegida)         -> datos del usuario autenticado
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  const servicio = crearServicioAuth((payload) =>
    app.jwt.sign(payload, { expiresIn: TTL_ACCESS }),
  );

  app.post<{ Body: { email: string; password: string } }>(
    '/login',
    { schema: esquemaLogin },
    async (request, reply) => {
      try {
        const { email, password } = request.body;
        const resultado = await servicio.iniciarSesion(email, password);
        return await reply.code(200).send(resultado);
      } catch (error) {
        if (error instanceof ErrorAutenticacion) {
          return reply.code(401).send({ mensaje: error.message });
        }
        request.log.error(error);
        return reply.code(500).send({ mensaje: 'Error interno.' });
      }
    },
  );

  app.post<{ Body: { refreshToken: string } }>(
    '/refresh',
    { schema: esquemaRefresh },
    async (request, reply) => {
      try {
        const resultado = await servicio.refrescarAcceso(
          request.body.refreshToken,
        );
        return await reply.code(200).send(resultado);
      } catch (error) {
        if (error instanceof ErrorAutenticacion) {
          return reply.code(401).send({ mensaje: error.message });
        }
        request.log.error(error);
        return reply.code(500).send({ mensaje: 'Error interno.' });
      }
    },
  );

  app.post<{ Body: { refreshToken: string } }>(
    '/logout',
    { schema: esquemaRefresh },
    async (request, reply) => {
      await servicio.cerrarSesion(request.body.refreshToken);
      return reply.code(204).send();
    },
  );

  app.get('/me', { preHandler: app.autenticar }, async (request, reply) => {
    const usuario = await prisma.usuario.findUnique({
      where: { id: request.user.sub },
    });
    if (!usuario || !usuario.activo) {
      return reply.code(401).send({ mensaje: 'No autenticado.' });
    }
    return reply.code(200).send({
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: usuario.rol,
    });
  });
}
