import type { ClienteTx } from '../../core/prisma.js';
import { txEmpresa } from '../../core/tenant/contexto.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorValidacion } from '../../core/errors.js';

/** Serializa el monto (Decimal) a number para el contrato de la API. */
function aGastoDto<T extends { monto: { toString(): string } }>(gasto: T) {
  return { ...gasto, monto: Number(gasto.monto) };
}

function esErrorPrisma(error: unknown, codigo: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === codigo
  );
}

interface CategoriaFila {
  id: string;
  nombre: string;
  esPagoEmpleado: boolean;
  activo: boolean;
  creadoEn: Date;
}

/** DTO público de una categoría de gasto (sin empresaId: no se filtra el tenant). */
function aCategoriaDto(c: CategoriaFila) {
  return {
    id: c.id,
    nombre: c.nombre,
    esPagoEmpleado: c.esPagoEmpleado,
    activo: c.activo,
    creadoEn: c.creadoEn.toISOString(),
  };
}

const SELECT_CATEGORIA = {
  id: true,
  nombre: true,
  esPagoEmpleado: true,
  activo: true,
  creadoEn: true,
} as const;

/**
 * Lista las categorías de gasto de la empresa actual (RLS). Por defecto solo las
 * ACTIVAS (las consume el select del formulario de gasto); con `incluirInactivas`,
 * todas (para la pantalla de gestión, que permite reactivar). Ordenadas por nombre.
 */
export function listarCategorias(opciones?: { incluirInactivas?: boolean }) {
  return txEmpresa((tx) =>
    tx.categoriaGasto
      .findMany({
        where: opciones?.incluirInactivas ? {} : { activo: true },
        orderBy: { nombre: 'asc' },
        select: SELECT_CATEGORIA,
      })
      .then((lista) => lista.map(aCategoriaDto)),
  );
}

/**
 * Crea una categoría de gasto PERSONALIZADA de la empresa actual. El `empresa_id` lo
 * pone el DEFAULT del esquema desde el GUC `app.empresa_id` (nunca del body → tenant-safe).
 * `nombre` único POR empresa (`@@unique([empresaId, nombre])`) → duplicado = 409.
 * `esPagoEmpleado` opcional (default false). NO hay límite de cantidad ni catálogo fijo.
 */
export async function crearCategoria(datos: { nombre: string; esPagoEmpleado?: boolean }) {
  const nombre = datos.nombre.trim();
  if (!nombre) {
    throw new ErrorValidacion('El nombre de la categoría es obligatorio.');
  }
  return txEmpresa(async (tx) => {
    try {
      const creada = await tx.categoriaGasto.create({
        data: { nombre, esPagoEmpleado: datos.esPagoEmpleado ?? false },
        select: SELECT_CATEGORIA,
      });
      return aCategoriaDto(creada);
    } catch (error) {
      if (esErrorPrisma(error, 'P2002')) {
        throw new ErrorConflicto('Ya existe una categoría con ese nombre en esta empresa.');
      }
      throw error;
    }
  });
}

/**
 * Actualiza una categoría de la empresa actual: `nombre` y/o `activo` (baja/alta lógica).
 * NO permite cambiar `esPagoEmpleado` (rompería la coherencia de gastos ya registrados con
 * esa categoría). El `id` de otra empresa lo FILTRA la RLS → update de 0 filas → P2025 → 404
 * (aislamiento fail-closed). Nombre duplicado en la empresa → 409.
 */
export async function actualizarCategoria(
  id: string,
  cambios: { nombre?: string; activo?: boolean },
) {
  const data: { nombre?: string; activo?: boolean } = {};
  if (cambios.nombre !== undefined) {
    const nombre = cambios.nombre.trim();
    if (!nombre) {
      throw new ErrorValidacion('El nombre de la categoría no puede quedar vacío.');
    }
    data.nombre = nombre;
  }
  if (cambios.activo !== undefined) {
    data.activo = cambios.activo;
  }
  if (Object.keys(data).length === 0) {
    throw new ErrorValidacion('No hay cambios que aplicar.');
  }
  return txEmpresa(async (tx) => {
    try {
      const actualizada = await tx.categoriaGasto.update({
        where: { id },
        data,
        select: SELECT_CATEGORIA,
      });
      return aCategoriaDto(actualizada);
    } catch (error) {
      if (esErrorPrisma(error, 'P2025')) {
        throw new ErrorNoEncontrado('La categoría no existe.');
      }
      if (esErrorPrisma(error, 'P2002')) {
        throw new ErrorConflicto('Ya existe una categoría con ese nombre en esta empresa.');
      }
      throw error;
    }
  });
}

/**
 * BAJA LÓGICA de una categoría (soft delete): `activo=false`. NUNCA borra la fila: los
 * gastos históricos la referencian por FK. Una categoría inactiva deja de aparecer en el
 * select del formulario de gasto (listarCategorias sin `incluirInactivas`), pero los gastos
 * ya registrados con ella quedan intactos. `id` de otra empresa → RLS → 404.
 */
export function desactivarCategoria(id: string) {
  return txEmpresa(async (tx) => {
    try {
      const desactivada = await tx.categoriaGasto.update({
        where: { id },
        data: { activo: false },
        select: SELECT_CATEGORIA,
      });
      return aCategoriaDto(desactivada);
    } catch (error) {
      if (esErrorPrisma(error, 'P2025')) {
        throw new ErrorNoEncontrado('La categoría no existe.');
      }
      throw error;
    }
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
  return txEmpresa((tx) => crearGastoEnTransaccion(tx, datos));
}

export async function listarGastos(filtros: {
  desde?: string;
  hasta?: string;
  sedeId?: string;
}) {
  const gastos = await txEmpresa((tx) =>
    tx.gasto.findMany({
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
    }),
  );
  return gastos.map(aGastoDto);
}
