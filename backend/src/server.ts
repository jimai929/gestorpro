// Cargar el entorno de PRIMERO (efecto secundario), antes que cualquier módulo
// que dependa de las variables (p. ej. el cliente Prisma).
import './core/entorno.js';

import { construirApp } from './app.js';

const PUERTO = Number(process.env.PORT ?? 3000);
const HOST = process.env.HOST ?? '0.0.0.0';

const app = construirApp();

try {
  await app.listen({ port: PUERTO, host: HOST });
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
