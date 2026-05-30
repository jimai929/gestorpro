import { prisma } from '../prisma.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorValidacion } from '../errors.js';

function esErrorPrisma(error: unknown, codigo: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === codigo
  );
}

export interface DatosCaja {
  numero: string;
  nombre: string;
  sedeId: string;
}

/**
 * Da de alta una caja registradora (activa) en una sede. El número se recicla:
 * solo choca contra una caja ACTIVA con el mismo (sede, numero) — lo garantiza
 * el índice parcial `uq_caja_sede_numero_activa`, cuyo P2002 se traduce a 409.
 * Un número que solo exista en cajas inactivas se puede reusar; el mismo número
 * en otra sede es válido.
 */
export async function crearCaja(datos: DatosCaja) {
  try {
    return await prisma.caja.create({
      data: { numero: datos.numero, nombre: datos.nombre, sedeId: datos.sedeId },
    });
  } catch (error) {
    if (esErrorPrisma(error, 'P2002')) {
      throw new ErrorConflicto('Ya existe una caja activa con ese número en la sede.');
    }
    if (esErrorPrisma(error, 'P2003')) {
      throw new ErrorValidacion('La sede indicada no existe.');
    }
    throw error;
  }
}

export interface DatosEditarCaja {
  numero?: string;
  nombre?: string;
  sedeId?: string;
  activo?: boolean;
}

/**
 * Edita una caja (parcial) e incluye la baja/alta lógica (`activo`). Si el
 * resultado queda ACTIVO, verifica ANTES que no exista otra caja activa con el
 * mismo (sede, numero) — el caso típico es reactivar una caja cuyo número ya se
 * recicló. Se rechaza con un mensaje claro (409) en vez de reventar el índice
 * parcial con un 500. El propio índice queda como guardia final ante carreras.
 */
export async function editarCaja(id: string, datos: DatosEditarCaja) {
  const actual = await prisma.caja.findUnique({ where: { id } });
  if (!actual) {
    throw new ErrorNoEncontrado('La caja indicada no existe.');
  }

  const sedeId = datos.sedeId ?? actual.sedeId;
  const numero = datos.numero ?? actual.numero;
  const quedaActiva = datos.activo ?? actual.activo;

  if (quedaActiva) {
    const colision = await prisma.caja.findFirst({
      where: { sedeId, numero, activo: true, id: { not: id } },
    });
    if (colision) {
      throw new ErrorConflicto(
        'Ya existe otra caja activa con ese número en la sede (el número fue reciclado). Usa otro número o desactiva la otra caja.',
      );
    }
  }

  const data = {
    ...(datos.numero !== undefined ? { numero: datos.numero } : {}),
    ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
    ...(datos.sedeId !== undefined ? { sedeId: datos.sedeId } : {}),
    ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
  };
  try {
    return await prisma.caja.update({ where: { id }, data });
  } catch (error) {
    if (esErrorPrisma(error, 'P2002')) {
      throw new ErrorConflicto('Ya existe una caja activa con ese número en la sede.');
    }
    if (esErrorPrisma(error, 'P2003')) {
      throw new ErrorValidacion('La sede indicada no existe.');
    }
    throw error;
  }
}

/**
 * Lista cajas. Por defecto solo activas (para el selector del cierre); con
 * `incluirInactivas`, todas (para la gestión). `sedeId` filtra por sede.
 */
export function listarCajas(filtros?: { sedeId?: string; incluirInactivas?: boolean }) {
  return prisma.caja.findMany({
    where: {
      ...(filtros?.incluirInactivas ? {} : { activo: true }),
      ...(filtros?.sedeId ? { sedeId: filtros.sedeId } : {}),
    },
    orderBy: [{ sedeId: 'asc' }, { numero: 'asc' }],
  });
}
