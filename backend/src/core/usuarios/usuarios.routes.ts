import type { FastifyInstance } from 'fastify';
import { ErrorAutorizacion } from '../errors.js';
import { responderError } from '../http.js';
import { crearUsuarioEnTenant, restablecerContrasena } from './usuarios.service.js';

const PATRON_UUID =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

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

const esquemaRestablecer = {
  params: {
    type: 'object',
    required: ['usuarioId'],
    additionalProperties: false,
    properties: {
      // uuid validado en la puerta: un id malformado es 400, nunca llega a Prisma.
      usuarioId: { type: 'string', pattern: PATRON_UUID },
    },
  },
  body: {
    type: 'object',
    required: ['contrasenaTemporal'],
    additionalProperties: false,
    properties: {
      // Misma regla de fortaleza que el alta (password) y el autoservicio: mínimo 8.
      contrasenaTemporal: { type: 'string', minLength: 8 },
    },
  },
} as const;

/**
 * Gestión de usuarios DENTRO del tenant (Fase 4c). Un administrador del tenant opera
 * sobre cuentas de su PROPIA empresa. El `empresaId` sale del token
 * (request.user.empresaId), NUNCA del body. Guard: autenticar + administrador.
 * Un super-admin EN PLATAFORMA (empresaId=null) queda fuera; si ENTRÓ a una empresa vía
 * cambiar-empresa, `autorizar` lo deja pasar y opera en ESA empresa (soporte §4.4).
 *
 *   POST /usuarios                                    -> 201 (alta con membresía)
 *   POST /usuarios/:usuarioId/restablecer-contrasena  -> 204 (contraseña temporal)
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

  // Restablecer la contraseña de un usuario del tenant (soporte). La denegación es un
  // 404 ÚNICO (inexistente = de otro tenant = cuenta de plataforma): anti-enumeración.
  // NO está exenta del cambio forzado: un admin con contraseña temporal primero rota
  // la suya. La temporal viaja en el body pero JAMÁS se guarda ni audita en claro.
  app.post<{ Params: { usuarioId: string }; Body: { contrasenaTemporal: string } }>(
    '/usuarios/:usuarioId/restablecer-contrasena',
    { preHandler: [app.autenticar, app.autorizar('administrador')], schema: esquemaRestablecer },
    async (request, reply) => {
      try {
        // empresaId y el id del admin SIEMPRE del token (request.user), NUNCA del body.
        const { empresaId, sub } = request.user;
        if (empresaId === null) {
          // Defensa en profundidad (misma que el alta): `autorizar` ya exige empresa
          // activa. Inalcanzable en la práctica.
          throw new ErrorAutorizacion();
        }
        await restablecerContrasena(
          request.params.usuarioId,
          empresaId,
          sub,
          request.body.contrasenaTemporal,
        );
        return await reply.code(204).send();
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
