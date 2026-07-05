import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { authPlugin } from './core/auth/auth.plugin.js';
import { iniciarContextoTenant } from './core/tenant/contexto.js';
import { authRoutes } from './core/auth/auth.routes.js';
import { empresaRoutes } from './core/empresa/empresa.routes.js';
import { usuariosRoutes } from './core/usuarios/usuarios.routes.js';
import { sedeRoutes } from './core/sede/sede.routes.js';
import { empleadoRoutes } from './core/empleado/empleado.routes.js';
import { rolOperativoRoutes } from './core/rol-operativo/rol-operativo.routes.js';
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
  // trustProxy: SOLO se confía en la IP inmediata del socket cuando cae en un rango
  // privado (incluye la red docker interna 172.16.0.0/12 donde vive Caddy — el ÚNICO
  // proceso que puede alcanzar este puerto, ver docs/DESPLIEGUE.md). Con eso, Fastify
  // toma `request.ip` del `X-Forwarded-For` que Caddy antepone (IP real del cliente),
  // no de la IP del contenedor de Caddy — corrige que @fastify/rate-limit compartiera
  // un único bucket para toda la plataforma. NUNCA `true` a secas: un cliente que
  // conectara DIRECTO (fuera del rango privado) podría forjar el header y evadir el
  // límite; con 'uniquelocal' su IP pública no calificaría como proxy de confianza.
  const app = Fastify({ logger: true, trustProxy: 'uniquelocal' });

  // Contexto de tenant (RLS): en el PUNTO MÁS TEMPRANO de cada request, dale su
  // propio store en la AsyncLocalStorage (fail-closed: empresaId null). `autenticar`
  // lo mutará con el tenant del token. Hacerlo en onRequest (no en un preHandler
  // tardío) garantiza que el contexto no se pierda ni se cruce entre requests
  // concurrentes. Rutas públicas quedan con el store vacío → 0 filas bajo RLS.
  app.addHook('onRequest', async () => {
    iniciarContextoTenant();
  });

  // CORS: en desarrollo el frontend (Vite, :5173) consume esta API desde otro
  // origen. Configurable con CORS_ORIGEN (lista separada por comas). Se declaran
  // los métodos de escritura (PUT/PATCH/DELETE) explícitamente para que el
  // preflight los permita: sin esto, las ediciones y bajas desde el navegador
  // (proveedores, sedes, empleados…) fallan con error de CORS.
  app.register(cors, {
    origin: (process.env.CORS_ORIGEN ?? 'http://localhost:5173').split(','),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Rate limiting en modo NO global: solo afecta a las rutas que lo declaran
  // (config.rateLimit). Se aplica a las superficies sensibles —/auth/* (fuerza
  // bruta de credenciales) y el fichaje público del kiosco—, no a la API
  // autenticada normal. La clave por defecto es la IP; una sede comparte IP de
  // salida, así que esto es defensa en profundidad, no la única protección del
  // kiosco (ver DESPLIEGUE.md §4.2: restricción de red / token de dispositivo).
  // Debe registrarse ANTES que las rutas para que su config por ruta surta efecto.
  app.register(rateLimit, { global: false });

  // Núcleo: autenticación (debe registrarse antes que las rutas que la usan).
  app.register(authPlugin);
  app.register(authRoutes, { prefix: '/auth' });
  app.register(empresaRoutes);
  app.register(usuariosRoutes);
  app.register(sedeRoutes);
  app.register(empleadoRoutes);
  app.register(rolOperativoRoutes);

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
