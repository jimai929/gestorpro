import { prisma } from '../../core/prisma.js';
import { ErrorNoEncontrado, ErrorValidacion } from '../../core/errors.js';

/**
 * Identifica al empleado por número de empleado o por su QR (a elección del
 * empleado en el kiosco). Devuelve el empleado activo o lanza error. Es el primer
 * paso del fichaje, antes de la verificación facial.
 */
export async function identificarEmpleado(criterio: {
  numero?: string;
  qrToken?: string;
}) {
  let empleado = null;
  if (criterio.numero) {
    empleado = await prisma.empleado.findUnique({
      where: { numero: criterio.numero },
    });
  } else if (criterio.qrToken) {
    empleado = await prisma.empleado.findUnique({
      where: { qrToken: criterio.qrToken },
    });
  } else {
    throw new ErrorValidacion('Debe indicar el número de empleado o el QR.');
  }

  if (!empleado || !empleado.activo) {
    throw new ErrorNoEncontrado('Empleado no encontrado o inactivo.');
  }
  return empleado;
}
