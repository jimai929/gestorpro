import { prisma } from '../../core/prisma.js';
import { ErrorValidacion } from '../../core/errors.js';

/**
 * Configuración única del cobro. Si aún no existe ninguna fila, se crea con los
 * valores por defecto del schema (80% cobrable, umbral B/. 100), de modo que la
 * lectura nunca devuelve null.
 */
export async function obtenerConfiguracionCobro() {
  const existente = await prisma.configuracionCobro.findFirst();
  if (existente) return existente;
  return prisma.configuracionCobro.create({ data: {} });
}

/**
 * Define (actualiza) la configuración única del cobro. Valida el porcentaje
 * (0–100) y el umbral (no negativo) antes de tocar la base; la app mantiene una
 * sola fila.
 */
export async function definirConfiguracionCobro(datos: {
  porcentajeCobrable?: number;
  umbralAprobacion?: number;
}) {
  if (
    datos.porcentajeCobrable !== undefined &&
    (datos.porcentajeCobrable < 0 || datos.porcentajeCobrable > 100)
  ) {
    throw new ErrorValidacion('El porcentaje cobrable debe estar entre 0 y 100.');
  }
  if (datos.umbralAprobacion !== undefined && datos.umbralAprobacion < 0) {
    throw new ErrorValidacion('El umbral de aprobación no puede ser negativo.');
  }

  const data = {
    ...(datos.porcentajeCobrable !== undefined
      ? { porcentajeCobrable: datos.porcentajeCobrable }
      : {}),
    ...(datos.umbralAprobacion !== undefined
      ? { umbralAprobacion: datos.umbralAprobacion }
      : {}),
  };

  const actual = await prisma.configuracionCobro.findFirst();
  if (actual) {
    return prisma.configuracionCobro.update({ where: { id: actual.id }, data });
  }
  return prisma.configuracionCobro.create({ data });
}
