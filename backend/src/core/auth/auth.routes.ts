import type { FastifyInstance } from 'fastify';
import { prisma } from '../prisma.js';
import { ErrorAutenticacion, ErrorAutorizacion } from '../errors.js';
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

const esquemaCambiarEmpresa = {
  body: {
    type: 'object',
    required: ['empresaId'],
    additionalProperties: false,
    properties: {
      // uuid de la empresa destino, o null = "volver a plataforma" (solo super-admin).
      // El patrón corta ids malformados en la puerta (400) para que jamás lleguen a
      // Prisma como uuid inválido (que reventaría con un error opaco).
      empresaId: {
        type: ['string', 'null'],
        pattern:
          '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
      },
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
 *   POST /auth/cambiar-empresa    (protegida) -> nuevo access + usuario (Fase 4c)
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
    // El NOMBRE de la empresa activa NO viaja en el token (se mantiene pequeño y sin datos
    // que puedan quedar stale): se resuelve aquí desde el `empresaId` del token. Super-admin
    // (empresaId=null) → sin empresa activa → empresaNombre=null, sin consulta. `empresa` no
    // tiene RLS, así que este findUnique no requiere contexto de tenant.
    const empresa = request.user.empresaId
      ? await prisma.empresa.findUnique({
          where: { id: request.user.empresaId },
          select: { nombre: true },
        })
      : null;
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
      empresaNombre: empresa?.nombre ?? null,
      esSuperAdmin: request.user.esSuperAdmin,
      debeCambiarContrasena: request.user.debeCambiarContrasena ?? false,
    });
  });

  // Cambio de empresa ACTIVA (Fase 4c, §3.5). `empresaId` SÍ viene en el body, pero
  // como petición de cambio de contexto SUJETA A AUTORIZACIÓN (membresía en BD o
  // super-admin): el aislamiento sigue saliendo del TOKEN que se emite aquí, nunca
  // de lo que diga el cliente. usuarioId y empresa anterior salen del token. NO está
  // en la allowlist del cambio forzado de contraseña: con contraseña temporal, 403.
  app.post<{ Body: { empresaId: string | null } }>(
    '/cambiar-empresa',
    {
      preHandler: app.autenticar,
      schema: esquemaCambiarEmpresa,
      // Autenticado y barato, pero acota el sondeo de empresaIds ajenos (la denegación
      // es un 403 de mensaje único, aun así no se regala volumen de intentos).
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      try {
        const resultado = await servicio.cambiarEmpresa(
          request.user.sub,
          request.body.empresaId,
          request.user.empresaId,
        );
        return await reply.code(200).send(resultado);
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

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
        // Guard B1 (cuentas de PLATAFORMA): un super-admin no pertenece a ninguna
        // empresa (empresaId null), así que su auto-cambio de contraseña reventaría
        // más adentro al escribir el asiento de auditoría —empresa_id es NOT NULL y su
        // DEFAULT sale del GUC de tenant, que aquí no está fijado→ 500 opaco—. Se
        // rechaza en la ENTRADA, ANTES de abrir transacción alguna (cero efectos: ni
        // toca el hash ni audita), con un error de dominio claro. Se discrimina por la
        // ESENCIA (esSuperAdmin), no por el síntoma (empresaId null). NO se usa el
        // codigo DEBE_CAMBIAR_CONTRASENA: ese es el contrato del cambio forzado, ajeno
        // a este caso. La rotación de la clave de una cuenta de plataforma va por otra vía.
        if (request.user.esSuperAdmin === true) {
          throw new ErrorAutorizacion(
            'Las cuentas de plataforma no cambian su contraseña por este endpoint.',
          );
        }
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
