import type { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { ErrorAutenticacion } from '../errors.js';
import { responderError } from '../http.js';
import { cambiarContrasena, crearServicioAuth } from './auth.service.js';

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

const esquemaCambiarContrasena = {
  body: {
    type: 'object',
    required: ['contrasenaActual', 'contrasenaNueva'],
    // Estricto (como el resto de /auth): con additionalProperties:false, ajv ELIMINA
    // cualquier campo inesperado del body antes del handler —p. ej. un `usuarioId`
    // colado para apuntar a OTRO usuario—. De todos modos el usuarioId sale del token.
    additionalProperties: false,
    properties: {
      contrasenaActual: { type: 'string', minLength: 1 },
      // Misma regla de fortaleza que al crear la cuenta (adminPassword): mínimo 8.
      contrasenaNueva: { type: 'string', minLength: 8 },
    },
  },
} as const;

/**
 * Rutas de autenticación, montadas bajo el prefijo /auth:
 *   POST /auth/login    email + contraseña  -> access + refresh + usuario
 *   POST /auth/refresh  refresh token       -> nuevo access token
 *   POST /auth/logout   refresh token       -> 204 (invalida la sesión)
 *   GET  /auth/me       (protegida)         -> datos del usuario autenticado
 *   POST /auth/cambiar-contrasena (protegida) -> 204 (cambia la propia contraseña)
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  const servicio = crearServicioAuth((payload) =>
    app.jwt.sign(payload, { expiresIn: TTL_ACCESS }),
  );

  app.post<{ Body: { email: string; password: string } }>(
    '/login',
    {
      schema: esquemaLogin,
      // Estricto: el login es el objetivo de fuerza bruta de contraseñas.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
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
    {
      schema: esquemaRefresh,
      // Más holgado que el login: el refresco es automático (refresh-on-401) y
      // una sede comparte IP de salida; aun así acotado contra abuso.
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
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
    {
      schema: esquemaRefresh,
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
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
    // rol/empresaId/esSuperAdmin salen del TOKEN (contexto activo resuelto en
    // login/refresh), NO del registro global: así /me coincide con el contrato de
    // /login (UsuarioPublico) y refleja la empresa ACTIVA, no el rol global legado
    // (que diferiría del de la membresía en un usuario multi-empresa).
    return reply.code(200).send({
      id: usuario.id,
      nombre: usuario.nombre,
      email: usuario.email,
      rol: request.user.rol,
      empresaId: request.user.empresaId,
      esSuperAdmin: request.user.esSuperAdmin,
    });
  });

  // Autoservicio: el usuario autenticado cambia su PROPIA contraseña. El usuarioId
  // sale SIEMPRE del token (request.user.sub), NUNCA del body.
  app.post<{ Body: { contrasenaActual: string; contrasenaNueva: string } }>(
    '/cambiar-contrasena',
    {
      preHandler: app.autenticar,
      schema: esquemaCambiarContrasena,
      // Mismo límite que /login: el handler verifica una contraseña con argon2 (costoso)
      // y es superficie /auth/* sensible. Acota fuerza bruta de la clave actual y DoS de CPU.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      try {
        await cambiarContrasena(
          request.user.sub,
          request.body.contrasenaActual,
          request.body.contrasenaNueva,
        );
        return await reply.code(204).send();
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
