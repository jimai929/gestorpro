import { construirApp } from './app.js';

// Carga opcional de variables desde .env (Node 20.12+). No falla si no existe.
try {
  process.loadEnvFile();
} catch {
  // Sin archivo .env: se usan los valores por defecto.
}

const PUERTO = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = construirApp();

try {
  await app.listen({ port: PUERTO, host: HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
