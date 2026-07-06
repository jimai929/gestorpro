import type { FastifyInstance } from 'fastify';
import { responderError } from '../http.js';
import {
  cambiarEstadoUsuarioPlataforma,
  restablecerContrasenaPlataforma,
} from './plataforma-usuarios.service.js';

const PATRON_UUID =
  '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

const esquemaEstado = {
  params: {
    type: 'object',
    required: ['usuarioId'],
    additionalProperties: false,
    properties: {
      usuarioId: { type: 'string', pattern: PATRON_UUID },
    },
  },
  body: {
    type: 'object',
    required: ['activo'],
    additionalProperties: false,
    properties: {
      activo: { type: 'boolean' },
    },
  },
  // Respuesta MÍNIMA (defensa en la puerta: el serializador descarta cualquier extra).
  response: {
    200: {
      type: 'object',
      required: ['id', 'nombre', 'email', 'activo'],
      additionalProperties: false,
      properties: {
        id: { type: 'string' },
        nombre: { type: 'string' },
        email: { type: 'string' },
        activo: { type: 'boolean' },
      },
    },
  },
} as const;

const esquemaReset = {
  params: {
    type: 'object',
    required: ['usuarioId'],
    additionalProperties: false,
    properties: {
      usuarioId: { type: 'string', pattern: PATRON_UUID },
    },
  },
  // SIN body: la temporal la GENERA el servidor (mismo criterio que restablecer-admin).
  // Respuesta MÍNIMA: solo temporal + flag; nada de usuarioId/email/hash.
  response: {
    200: {
      type: 'object',
      required: ['contrasenaTemporal', 'debeCambiarContrasena'],
      additionalProperties: false,
      properties: {
        contrasenaTemporal: { type: 'string' },
        debeCambiarContrasena: { type: 'boolean' },
      },
    },
  },
} as const;

/**
 * Rutas de PLATAFORMA para la gestión GLOBAL de cuentas de acceso (M3-plataforma).
 * SOLO super-admin: el guard `soloPlataforma` responde 404 a cualquier otro (no revela
 * el endpoint), y va en `onRequest` (ANTES de la validación ajv) para que un token de
 * tenant con input malformado tampoco pueda enumerar el contrato — mismo patrón que las
 * rutas de empresa. Es la vía por la que se gestionan las cuentas MULTI-EMPRESA que el
 * módulo de tenant rechaza con 409 (Usuario.activo/contraseña son globales).
 *
 *   PATCH /plataforma/usuarios/:usuarioId/estado                -> 200 (baja/reactivación global)
 *   POST  /plataforma/usuarios/:usuarioId/restablecer-contrasena -> 200 (temporal EN CLARO 1 vez)
 */
export async function plataformaUsuariosRoutes(app: FastifyInstance): Promise<void> {
  const soloSuper = { onRequest: [app.autenticar, app.soloPlataforma] };

  app.patch<{ Params: { usuarioId: string }; Body: { activo: boolean } }>(
    '/plataforma/usuarios/:usuarioId/estado',
    { ...soloSuper, schema: esquemaEstado },
    async (request, reply) => {
      try {
        // El super-admin que ejecuta SIEMPRE sale del token (request.user.sub), nunca del body.
        const actualizado = await cambiarEstadoUsuarioPlataforma(
          request.params.usuarioId,
          request.user.sub,
          request.body.activo,
        );
        return await reply.code(200).send(actualizado);
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.post<{ Params: { usuarioId: string } }>(
    '/plataforma/usuarios/:usuarioId/restablecer-contrasena',
    { ...soloSuper, schema: esquemaReset },
    async (request, reply) => {
      try {
        const resultado = await restablecerContrasenaPlataforma(
          request.params.usuarioId,
          request.user.sub,
        );
        return await reply.code(200).send(resultado);
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
