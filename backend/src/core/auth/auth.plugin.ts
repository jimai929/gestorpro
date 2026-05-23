import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ErrorAutorizacion } from '../errors.js';
import type { PayloadAccess } from './auth.tipos.js';
import type { Rol } from '../../generated/prisma/enums.js';

// El payload que firmamos y lo que queda en request.user tras verificar.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: PayloadAccess;
    user: PayloadAccess;
  }
}

// Decoradores que este plugin agrega a la instancia de Fastify.
declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler: verifica el access token y puebla request.user. */
    autenticar: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Crea un guard que exige que el usuario tenga uno de los roles dados. */
    autorizar: (
      ...roles: Rol[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

async function pluginAuth(app: FastifyInstance): Promise<void> {
  const secreto = process.env.JWT_ACCESS_SECRET;
  if (!secreto) {
    throw new Error('Falta JWT_ACCESS_SECRET en el entorno.');
  }

  await app.register(fastifyJwt, { secret: secreto });

  // Verifica el access token de la cabecera Authorization: Bearer <token>.
  // Si es inválido o falta, corta con 401. Si es válido, deja request.user.
  app.decorate(
    'autenticar',
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();
      } catch {
        await reply.code(401).send({ mensaje: 'No autenticado.' });
      }
    },
  );

  // Guard de autorización por rol. Se usa SIEMPRE después de `autenticar`.
  app.decorate('autorizar', function (...roles: Rol[]) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      const usuario = request.user;
      if (!usuario || !roles.includes(usuario.rol)) {
        await reply.code(403).send({ mensaje: new ErrorAutorizacion().message });
      }
    };
  });
}

/**
 * Plugin de autenticación. Envuelto con fastify-plugin para que sus decoradores
 * (`autenticar`, `autorizar`, `app.jwt`) queden disponibles en toda la app, no
 * solo en un contexto encapsulado.
 */
export const authPlugin = fp(pluginAuth, { name: 'auth' });
