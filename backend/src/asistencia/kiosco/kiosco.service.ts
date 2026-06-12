import { prisma } from '../../core/prisma.js';
import { ErrorValidacion } from '../../core/errors.js';

export interface DatosKiosco {
  nombre: string;
  sedeId: string;
}

/**
 * Da de alta un kiosco en una sede existente. La ruta exige rol administrador.
 * Se valida que la sede exista antes de crear, para devolver un error de negocio
 * claro en vez de dejar que estalle la FK.
 */
export async function crearKiosco(datos: DatosKiosco) {
  const sede = await prisma.sede.findUnique({ where: { id: datos.sedeId } });
  if (!sede) {
    throw new ErrorValidacion('La sede indicada no existe.');
  }
  return prisma.kiosco.create({
    data: { nombre: datos.nombre, sedeId: datos.sedeId },
  });
}
