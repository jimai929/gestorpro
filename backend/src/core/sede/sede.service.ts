import { prisma } from '../prisma.js';
import { ErrorNoEncontrado } from '../errors.js';

function esErrorPrisma(error: unknown, codigo: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === codigo
  );
}

type ModoExcepcion = 'pin' | 'supervisor' | 'ambos';

export interface DatosSede {
  nombre: string;
  modoExcepcion?: ModoExcepcion;
}

export function crearSede(datos: DatosSede) {
  return prisma.sede.create({
    data: {
      nombre: datos.nombre,
      ...(datos.modoExcepcion ? { modoExcepcion: datos.modoExcepcion } : {}),
    },
  });
}

/**
 * Edita una sede. Actualización parcial: solo se tocan los campos presentes. La
 * sede nunca se borra; la baja es lógica vía `activo` (hay compras, gastos,
 * empleados, cajas, etc. que la referencian).
 */
export interface DatosEditarSede {
  nombre?: string;
  modoExcepcion?: ModoExcepcion;
  activo?: boolean;
}

export async function editarSede(id: string, datos: DatosEditarSede) {
  const data = {
    ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
    ...(datos.modoExcepcion !== undefined ? { modoExcepcion: datos.modoExcepcion } : {}),
    ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
  };
  try {
    return await prisma.sede.update({ where: { id }, data });
  } catch (error) {
    if (esErrorPrisma(error, 'P2025')) {
      throw new ErrorNoEncontrado('La sede indicada no existe.');
    }
    throw error;
  }
}

/** Lista sedes. Por defecto solo activas (para los selectores); con `incluirInactivas`, todas. */
export function listarSedes(filtros?: { incluirInactivas?: boolean }) {
  return prisma.sede.findMany({
    where: filtros?.incluirInactivas ? {} : { activo: true },
    orderBy: { nombre: 'asc' },
  });
}
