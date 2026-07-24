import { txEmpresa } from '../tenant/contexto.js';
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

/** DTO público de una sede: sin `empresaId` (el tenant no se filtra en respuestas). */
const SELECT_SEDE = {
  id: true,
  nombre: true,
  activo: true,
  modoExcepcion: true,
  creadoEn: true,
} as const;

export interface DatosSede {
  nombre: string;
  modoExcepcion?: ModoExcepcion;
}

export function crearSede(datos: DatosSede) {
  // empresa_id lo rellena el DEFAULT desde el GUC que fija txEmpresa (del token).
  return txEmpresa((tx) =>
    tx.sede.create({
      data: {
        nombre: datos.nombre,
        ...(datos.modoExcepcion ? { modoExcepcion: datos.modoExcepcion } : {}),
      },
      select: SELECT_SEDE,
    }),
  );
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
    // Bajo RLS, where {id} solo ve filas del tenant del GUC → un id de otra
    // empresa da P2025 → 404 (anti cross-tenant).
    return await txEmpresa((tx) => tx.sede.update({ where: { id }, data, select: SELECT_SEDE }));
  } catch (error) {
    if (esErrorPrisma(error, 'P2025')) {
      throw new ErrorNoEncontrado('La sede indicada no existe.');
    }
    throw error;
  }
}

/** Lista sedes. Por defecto solo activas (para los selectores); con `incluirInactivas`, todas. */
export function listarSedes(filtros?: { incluirInactivas?: boolean }) {
  return txEmpresa((tx) =>
    tx.sede.findMany({
      where: filtros?.incluirInactivas ? {} : { activo: true },
      orderBy: { nombre: 'asc' },
      select: SELECT_SEDE,
    }),
  );
}
