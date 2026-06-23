import { txEmpresa, contextoTenantActual } from '../../core/tenant/contexto.js';
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
  // Bajo RLS (contexto de la empresa del kiosco), un empleado de OTRA empresa no es
  // visible → findFirst da null → 404. Fase 3: numero/qrToken son UNICOS POR EMPRESA
  // (ya no @unique global), asi que findUnique no aplica; se usa findFirst. El
  // empresaId sale del CONTEXTO (ALS, resuelto desde el kiosco), NUNCA del body; es
  // defensa en profundidad redundante con la RLS (el guard evita romper si se llama
  // sin contexto en algun test).
  const empresaId = contextoTenantActual().empresaId;
  let empleado = null;
  if (criterio.numero) {
    empleado = await txEmpresa((tx) =>
      tx.empleado.findFirst({ where: { numero: criterio.numero, ...(empresaId ? { empresaId } : {}) } }),
    );
  } else if (criterio.qrToken) {
    empleado = await txEmpresa((tx) =>
      tx.empleado.findFirst({ where: { qrToken: criterio.qrToken, ...(empresaId ? { empresaId } : {}) } }),
    );
  } else {
    throw new ErrorValidacion('Debe indicar el número de empleado o el QR.');
  }

  if (!empleado || !empleado.activo) {
    throw new ErrorNoEncontrado('Empleado no encontrado o inactivo.');
  }
  return empleado;
}
