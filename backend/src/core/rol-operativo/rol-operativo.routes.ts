import type { FastifyInstance } from 'fastify';
import { responderError } from '../http.js';
import { listarRolesOperativos } from './rol-operativo.service.js';

/**
 * Rutas del catálogo de roles operativos. La lectura es para cualquier usuario
 * autenticado: la consumen el formulario de empleado (checkboxes de roles) y los
 * selects de cajera/verificador del cierre. La asignación de roles a un empleado
 * va por los endpoints de Empleado (solo admin), no aquí.
 */
export async function rolOperativoRoutes(app: FastifyInstance): Promise<void> {
  const autenticado = { preHandler: [app.autenticar] };

  app.get<{ Querystring: { incluirInactivos?: string } }>(
    '/roles-operativos',
    autenticado,
    async (request, reply) => {
      try {
        const incluirInactivos = request.query.incluirInactivos === 'true';
        return await reply.send(await listarRolesOperativos({ incluirInactivos }));
      } catch (error) {
        return responderError(error, request, reply);
      }
    },
  );
}
