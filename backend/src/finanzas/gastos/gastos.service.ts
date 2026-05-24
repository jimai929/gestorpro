import { prisma } from '../../core/prisma.js';
import { ErrorValidacion } from '../../core/errors.js';

/** Serializa el monto (Decimal) a number para el contrato de la API. */
function aGastoDto<T extends { monto: { toString(): string } }>(gasto: T) {
  return { ...gasto, monto: Number(gasto.monto) };
}

export function listarCategorias() {
  return prisma.categoriaGasto.findMany({
    where: { activo: true },
    orderBy: { nombre: 'asc' },
  });
}

export interface DatosGasto {
  categoriaId: string;
  sedeId: string;
  monto: number;
  fechaOperacion: string;
  descripcion?: string;
  empleadoId?: string;
  tipoPago?: string;
  usuarioId: string;
}

/**
 * Registra un gasto operativo (movimiento `normal`). Aplica la regla de
 * coherencia de empleado según la categoría:
 *  - categoría de pago a empleado  → `empleadoId` es obligatorio.
 *  - categoría normal              → `empleadoId` y `tipoPago` deben ir vacíos.
 * El `usuarioId` viene del token.
 */
export async function registrarGasto(datos: DatosGasto) {
  if (datos.monto <= 0) {
    throw new ErrorValidacion('El monto del gasto debe ser mayor que cero.');
  }

  const categoria = await prisma.categoriaGasto.findUnique({
    where: { id: datos.categoriaId },
  });
  if (!categoria) {
    throw new ErrorValidacion('La categoría de gasto indicada no existe.');
  }

  if (categoria.esPagoEmpleado) {
    if (!datos.empleadoId) {
      throw new ErrorValidacion(
        'La categoría es de pago a empleado: el empleadoId es obligatorio.',
      );
    }
  } else if (datos.empleadoId || datos.tipoPago) {
    throw new ErrorValidacion(
      'La categoría no es de pago a empleado: no debe llevar empleadoId ni tipoPago.',
    );
  }

  const gasto = await prisma.gasto.create({
    data: {
      categoriaId: datos.categoriaId,
      sedeId: datos.sedeId,
      monto: datos.monto,
      fechaOperacion: new Date(datos.fechaOperacion),
      descripcion: datos.descripcion ?? null,
      empleadoId: datos.empleadoId ?? null,
      tipoPago: datos.tipoPago ?? null,
      tipo: 'normal',
      usuarioId: datos.usuarioId,
    },
  });
  return aGastoDto(gasto);
}

export async function listarGastos(filtros: {
  desde?: string;
  hasta?: string;
  sedeId?: string;
}) {
  const gastos = await prisma.gasto.findMany({
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
    include: { categoria: true },
  });
  return gastos.map(aGastoDto);
}
