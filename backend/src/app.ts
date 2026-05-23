import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Construye la instancia de Fastify con sus rutas registradas.
 *
 * Separar la construcción del arranque (server.ts) permite montar la app en los
 * tests sin abrir un puerto. A medida que avancen las fases, aquí se registran
 * los plugins de cada área (auth, finanzas, asistencia).
 */
export function construirApp(): FastifyInstance {
  const app = Fastify({
    logger: true,
  });

  // Endpoint de salud: confirma que el servidor está vivo y responde.
  app.get('/health', async () => {
    return { estado: 'ok', servicio: 'gestorpro-backend' };
  });

  return app;
}
