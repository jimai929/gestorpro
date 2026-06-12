import type { FastifyInstance } from 'fastify';
import { prisma } from '../../core/prisma.js';
import { responderError } from '../../core/http.js';
import { crearServicioFichaje, colaRevision, revisarFichaje } from './fichaje.service.js';

const esquemaFichaje = {
  body: {
    type: 'object',
    required: ['kioscoId', 'tipo', 'fotoCaptura'],
    additionalProperties: false,
    properties: {
      kioscoId: { type: 'string', minLength: 1 },
      tipo: { type: 'string', enum: ['entrada', 'salida_comida', 'entrada_comida', 'salida'] },
      numero: { type: 'string' },
      qrToken: { type: 'string' },
      fotoCaptura: { type: 'string', minLength: 1 },
      pin: { type: 'string' },
      supervisorEmail: { type: 'string' },
      supervisorPassword: { type: 'string' },
    },
  },
} as const;

const esquemaRevision = {
  body: {
    type: 'object',
    required: ['fichajeId', 'valido'],
    additionalProperties: false,
    properties: {
      fichajeId: { type: 'string', minLength: 1 },
      valido: { type: 'boolean' },
      motivo: { type: 'string' },
    },
  },
} as const;

interface BodyFichaje {
  kioscoId: string;
  tipo: 'entrada' | 'salida_comida' | 'entrada_comida' | 'salida';
  numero?: string;
  qrToken?: string;
  fotoCaptura: string;
  pin?: string;
  supervisorEmail?: string;
  supervisorPassword?: string;
}

/**
 * Rutas de fichaje. `POST /fichajes` lo consume el kiosco (dispositivo físico):
 * por ahora SIN auth de usuario; pendiente añadir autenticación de kiosco. La
 * cola de revisión y la decisión del jefe sí requieren supervisor/administrador.
 */
export async function fichajeRoutes(app: FastifyInstance): Promise<void> {
  const servicio = crearServicioFichaje();
  const soloJefe = {
    preHandler: [app.autenticar, app.autorizar('supervisor', 'administrador')],
  };

  // Superficie pública del kiosco: acotada por rate limit (la clave es la IP;
  // es defensa en profundidad, no la única protección — ver DESPLIEGUE.md §4.2).
  const limiteKiosco = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  // Catálogo de kioscos para que el dispositivo se identifique. Público (el
  // kiosco no tiene sesión de usuario); expone nombre, sede y modo de excepción.
  app.get('/kioscos', { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } }, async (request, reply) => {
    try {
      const kioscos = await prisma.kiosco.findMany({
        where: { activo: true },
        orderBy: { nombre: 'asc' },
        include: { sede: { select: { nombre: true, modoExcepcion: true } } },
      });
      return await reply.send(kioscos);
    } catch (error) {
      return responderError(error, request, reply);
    }
  });

  app.post<{ Body: BodyFichaje }>(
    '/fichajes',
    { schema: esquemaFichaje, ...limiteKiosco },
    async (request, reply) => {
      try {
        const resultado = await servicio.fichar(request.body);
        if (resultado.estado === 'requiere_excepcion') {
          return await reply.code(409).send({
            requiereExcepcion: true,
            modoExcepcion: resultado.modoExcepcion,
            mensaje: 'Verificación facial fallida; se requiere fichaje de excepción.',
          });
        }
        return await reply.code(201).send(resultado);
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.get<{ Querystring: { sedeId?: string } }>(
    '/fichajes/cola-revision',
    soloJefe,
    async (request, reply) => {
      try {
        return await reply.send(await colaRevision({ sedeId: request.query.sedeId }));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );

  app.post<{ Body: { fichajeId: string; valido: boolean; motivo?: string } }>(
    '/revisiones',
    { ...soloJefe, schema: esquemaRevision },
    async (request, reply) => {
      try {
        const revision = await revisarFichaje({
          ...request.body,
          jefeId: request.user.sub,
        });
        return await reply.code(201).send(revision);
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
