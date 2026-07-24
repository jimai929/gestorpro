import { ErrorValidacion } from './errors.js';

/**
 * Parsea una fecha llegada por querystring. Una fecha inválida (p. ej.
 * `?desde=foo`, o un MES fuera de rango como `2026-13-01`) lanza
 * `ErrorValidacion` (→ 400 con mensaje claro), en vez de llegar como
 * `Invalid Date` a Prisma y estallar en un 500 genérico.
 *
 * LÍMITE CONOCIDO: un desborde de DÍA (`2026-02-31`) NO se detecta — la
 * gramática ISO de `new Date` lo RUEDA al mes siguiente (2026-03-03), igual
 * que el comportamiento previo a este helper. El frontend no puede
 * producirlo (inputs type=date), así que no se añade un calendario a mano.
 */
export function fechaDeFiltro(valor: string, campo: string): Date {
  const fecha = new Date(valor);
  if (isNaN(fecha.getTime())) {
    throw new ErrorValidacion(`El parámetro "${campo}" no es una fecha válida (AAAA-MM-DD).`);
  }
  return fecha;
}
