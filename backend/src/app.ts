import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { authPlugin } from './core/auth/auth.plugin.js';
import { authRoutes } from './core/auth/auth.routes.js';
import { sedeRoutes } from './core/sede/sede.routes.js';
import { empleadoRoutes } from './core/empleado/empleado.routes.js';
import { cuentasPorPagarRoutes } from './finanzas/cuentas-por-pagar/cuentas-por-pagar.routes.js';
import { gastosRoutes } from './finanzas/gastos/gastos.routes.js';
import { ventasRoutes } from './finanzas/dashboard/ventas.routes.js';
import { dashboardRoutes } from './finanzas/dashboard/dashboard.routes.js';
import { correccionesRoutes } from './finanzas/dashboard/correcciones.routes.js';
import { fichajeRoutes } from './asistencia/fichaje/fichaje.routes.js';
import { jornadaRoutes } from './asistencia/jornada/jornada.routes.js';
import { cobroRoutes } from './asistencia/cobro/cobro.routes.js';

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
  // origen. Configurable con CORS_ORIGEN (lista separada por comas). Se declaran
  // los métodos de escritura (PUT/PATCH/DELETE) explícitamente para que el
  // preflight los permita: sin esto, las ediciones y bajas desde el navegador
  // (proveedores, sedes, empleados…) fallan con error de CORS.
  app.register(cors, {
    origin: (process.env.CORS_ORIGEN ?? 'http://localhost:5173').split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Núcleo: autenticación (debe registrarse antes que las rutas que la usan).
  app.register(authPlugin);
  app.register(authRoutes, { prefix: '/auth' });
  app.register(sedeRoutes);
  app.register(empleadoRoutes);

  // Finanzas
  app.register(cuentasPorPagarRoutes);
  app.register(gastosRoutes);
  app.register(ventasRoutes);
  app.register(dashboardRoutes);
  app.register(correccionesRoutes);

  // Asistencia
  app.register(fichajeRoutes);
  app.register(jornadaRoutes);
  app.register(cobroRoutes);

  // Endpoint de salud: confirma que el servidor está vivo y responde.
  app.get('/health', async () => {
    return { estado: 'ok', servicio: 'gestorpro-backend' };
  });

  return app;
}
