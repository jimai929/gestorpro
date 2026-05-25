import { prisma, type ClienteTx } from '../../core/prisma.js';
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
  /** Identificador del origen del gasto (opaco para finanzas). Evita el doble pago. */
  referenciaOrigen?: string;
  usuarioId: string;
}

/**
 * Crea un gasto operativo (movimiento `normal`) DENTRO de una transacción dada.
 * Aplica la regla de coherencia de empleado según la categoría. La usan tanto
 * `registrarGasto` (ruta) como otros módulos que necesitan crear el gasto en su
 * propia transacción (p. ej. el cobro de horas extra, que pasa
 * `referenciaOrigen`). Este módulo (finanzas) NO conoce a quien lo llama.
 */
export async function crearGastoEnTransaccion(tx: ClienteTx, datos: DatosGasto) {
  if (datos.monto <= 0) {
    throw new ErrorValidacion('El monto del gasto debe ser mayor que cero.');
  }

  const categoria = await tx.categoriaGasto.findUnique({
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

  const gasto = await tx.gasto.create({
    data: {
      categoriaId: datos.categoriaId,
      sedeId: datos.sedeId,
      monto: datos.monto,
      fechaOperacion: new Date(datos.fechaOperacion),
      descripcion: datos.descripcion ?? null,
      empleadoId: datos.empleadoId ?? null,
      tipoPago: datos.tipoPago ?? null,
      referenciaOrigen: datos.referenciaOrigen ?? null,
      tipo: 'normal',
      usuarioId: datos.usuarioId,
    },
  });
  return aGastoDto(gasto);
}

/**
 * Registra un gasto operativo (`normal`) desde una ruta: lo crea en su propia
 * transacción. La coherencia de empleado se valida en `crearGastoEnTransaccion`.
 */
export function registrarGasto(datos: DatosGasto) {
  return prisma.$transaction((tx) => crearGastoEnTransaccion(tx, datos));
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
