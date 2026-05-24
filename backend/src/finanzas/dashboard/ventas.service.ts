import { prisma } from '../../core/prisma.js';
import { ErrorConflicto, ErrorValidacion } from '../../core/errors.js';

function esErrorPrisma(error: unknown, codigo: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === codigo
  );
}

/** Serializa el monto (Decimal) a number para el contrato de la API. */
function aVentaDto<T extends { monto: { toString(): string } }>(venta: T) {
  return { ...venta, monto: Number(venta.monto) };
}

export interface DatosVenta {
  sedeId: string;
  fechaOperacion: string;
  monto: number;
  usuarioId: string;
}

/**
 * Registra el cierre de ventas de un día (movimiento `normal`). Un segundo
 * cierre normal para la misma (sede, fecha) es rechazado con 409: lo impide el
 * índice único parcial `uq_venta_normal`, cuyo P2002 se traduce aquí.
 */
export async function registrarVenta(datos: DatosVenta) {
  if (datos.monto < 0) {
    throw new ErrorValidacion('El monto de la venta no puede ser negativo.');
  }
  try {
    const venta = await prisma.ventaDiaria.create({
      data: {
        sedeId: datos.sedeId,
        fechaOperacion: new Date(datos.fechaOperacion),
        monto: datos.monto,
        tipo: 'normal',
        usuarioId: datos.usuarioId,
      },
    });
    return aVentaDto(venta);
  } catch (error) {
    if (esErrorPrisma(error, 'P2002')) {
      throw new ErrorConflicto(
        'Ya existe el cierre de ventas de esa fecha para la sede; use una corrección para ajustarlo.',
      );
    }
    if (esErrorPrisma(error, 'P2003')) {
      throw new ErrorValidacion('La sede indicada no existe.');
    }
    throw error;
  }
}

export async function listarVentas(filtros: {
  desde?: string;
  hasta?: string;
  sedeId?: string;
}) {
  const ventas = await prisma.ventaDiaria.findMany({
    where: {
      tipo: 'normal',
      ...(filtros.sedeId ? { sedeId: filtros.sedeId } : {}),
      ...(filtros.desde || filtros.hasta
        ? {
            fechaOperacion: {
              ...(filtros.desde ? { gte: new Date(filtros.desde) } : {}),
              ...(filtros.hasta ? { lte: new Date(filtros.hasta) } : {}),
            },
          }
        : {}),
    },
    orderBy: { fechaOperacion: 'desc' },
  });
  return ventas.map(aVentaDto);
}
