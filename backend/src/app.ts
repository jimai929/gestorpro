import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { authPlugin } from './core/auth/auth.plugin.js';
import { authRoutes } from './core/auth/auth.routes.js';
import { cuentasPorPagarRoutes } from './finanzas/cuentas-por-pagar/cuentas-por-pagar.routes.js';

/**
 * Construye la instancia de Fastify con sus plugins y rutas registrados.
 *
 * Separar la construcción del arranque (server.ts) permite montar la app en los
 * tests sin abrir un puerto. A medida que avancen las fases, aquí se registran
 * los plugins de cada área (finanzas, asistencia).
 */
export function construirApp(): FastifyInstance {
  const app = Fastify({ logger: true });

  // CORS: en desarrollo el frontend (Vite, :5173) consume esta API desde otro
  // origen. Configurable con CORS_ORIGEN (lista separada por comas).
  app.register(cors, {
    origin: (process.env.CORS_ORIGEN ?? 'http://localhost:5173').split(','),
  });

  // Núcleo: autenticación (debe registrarse antes que las rutas que la usan).
  app.register(authPlugin);
  app.register(authRoutes, { prefix: '/auth' });

  // Finanzas
  app.register(cuentasPorPagarRoutes);

  // Endpoint de salud: confirma que el servidor está vivo y responde.
  app.get('/health', async () => {
    return { estado: 'ok', servicio: 'gestorpro-backend' };
  });

  return app;
}
