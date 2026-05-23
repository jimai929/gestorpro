import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  ErrorAutenticacion,
  ErrorAutorizacion,
  ErrorConflicto,
  ErrorNoEncontrado,
  ErrorValidacion,
} from './errors.js';

/**
 * Traduce un error de dominio a su respuesta HTTP. Los errores conocidos van a
 * su código; cualquier otro se registra y devuelve 500 sin filtrar detalles.
 * Se usa en los catch de las rutas.
 */
export function responderError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  if (error instanceof ErrorValidacion) {
    return reply.code(400).send({ mensaje: error.message });
  }
  if (error instanceof ErrorAutenticacion) {
    return reply.code(401).send({ mensaje: error.message });
  }
  if (error instanceof ErrorAutorizacion) {
    return reply.code(403).send({ mensaje: error.message });
  }
  if (error instanceof ErrorNoEncontrado) {
    return reply.code(404).send({ mensaje: error.message });
  }
  if (error instanceof ErrorConflicto) {
    return reply.code(409).send({ mensaje: error.message });
  }
  // El servicio de corrección lanza ErrorCorreccion (400). Se detecta por nombre
  // para no acoplar el núcleo a shared/.
  if (error instanceof Error && error.name === 'ErrorCorreccion') {
    return reply.code(400).send({ mensaje: error.message });
  }
  request.log.error(error);
  return reply.code(500).send({ mensaje: 'Error interno.' });
}
