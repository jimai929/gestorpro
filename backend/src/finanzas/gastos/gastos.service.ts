import type { ClienteTx } from '../../core/prisma.js';
import { txEmpresa } from '../../core/tenant/contexto.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorValidacion } from '../../core/errors.js';
import { fechaDeFiltro } from '../../core/fechas.js';
import { resumirCorreccion } from '../../shared/services/correccion.estado.js';

/**
 * Serializa el monto (Decimal) a number y RETIRA `usuarioId` del contrato de la
 * API (dato interno de auditoría: el frontend no lo consume y no debe viajar).
 */
function aGastoDto<T extends { monto: { toString(): string }; usuarioId?: unknown }>(gasto: T) {
  const { usuarioId: _usuarioId, ...resto } = gasto;
  return { ...resto, monto: Number(gasto.monto) };
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
 * INVARIANTE de negocio: cada empresa debe conservar ≥1 categoría ACTIVA con
 * `esPagoEmpleado=true`. Es la base del cobro de horas extra: `cobro.service.pagarCobro`
 * la busca con `findFirst({esPagoEmpleado:true, activo:true})` y falla si no hay ninguna.
 * Antes de una operación que QUITARÍA el último "pago a empleado" activo (desactivarlo o
 * ponerle esPagoEmpleado=false), se aborta con 409 para que la UI no pueda romper el flujo.
 * `actual` = estado antes; `resultante` = estado tras la operación.
 */
async function verificarQuedaPagoEmpleadoActiva(
  tx: ClienteTx,
  actual: { activo: boolean; esPagoEmpleado: boolean },
  resultante: { activo: boolean; esPagoEmpleado: boolean },
): Promise<void> {
  const eraPagoEmpleadoActiva = actual.activo && actual.esPagoEmpleado;
  const seraPagoEmpleadoActiva = resultante.activo && resultante.esPagoEmpleado;
  if (eraPagoEmpleadoActiva && !seraPagoEmpleadoActiva) {
    // Cuenta las activas de pago a empleado ANTES del cambio (incluye a la objetivo).
    const activas = await tx.categoriaGasto.count({
      where: { activo: true, esPagoEmpleado: true },
    });
    if (activas <= 1) {
      throw new ErrorConflicto(
        'Debe quedar al menos una categoría de "pago a empleado" activa: la necesita el ' +
          'cobro de horas extra. Crea o activa otra antes de desactivar esta.',
      );
    }
  }
}

/**
 * Crea (o REACTIVA) una categoría de gasto de la empresa actual. `empresa_id` lo pone el
 * DEFAULT del esquema desde el GUC `app.empresa_id` (nunca del body → tenant-safe). `nombre`
 * único POR empresa. Comportamiento ante un nombre ya existente EN LA MISMA empresa:
 *   - existe ACTIVA con ese nombre → 409 (duplicado real).
 *   - existe INACTIVA con ese nombre → se REACTIVA (activo=true, actualiza esPagoEmpleado)
 *     en vez de crear una fila duplicada; el DTO vuelve con `reactivada:true`.
 * NO hay límite de cantidad ni catálogo fijo. Distintas empresas SÍ pueden tener el mismo nombre.
 */
export async function crearCategoria(datos: { nombre: string; esPagoEmpleado?: boolean }) {
  const nombre = datos.nombre.trim();
  if (!nombre) {
    throw new ErrorValidacion('El nombre de la categoría es obligatorio.');
  }
  const esPagoEmpleado = datos.esPagoEmpleado ?? false;
  return txEmpresa(async (tx) => {
    // RLS acota `findFirst` al tenant; el nombre es único por empresa → 0 o 1 fila.
    const existente = await tx.categoriaGasto.findFirst({
      where: { nombre },
      select: SELECT_CATEGORIA,
    });
    if (existente) {
      if (existente.activo) {
        throw new ErrorConflicto('Ya existe una categoría activa con ese nombre en esta empresa.');
      }
      const reactivada = await tx.categoriaGasto.update({
        where: { id: existente.id },
        data: { activo: true, esPagoEmpleado },
        select: SELECT_CATEGORIA,
      });
      return { ...aCategoriaDto(reactivada), reactivada: true };
    }
    try {
      const creada = await tx.categoriaGasto.create({
        data: { nombre, esPagoEmpleado },
        select: SELECT_CATEGORIA,
      });
      return { ...aCategoriaDto(creada), reactivada: false };
    } catch (error) {
      // Carrera contra otra creación con el mismo nombre: el unique compuesto lo cierra.
      if (esErrorPrisma(error, 'P2002')) {
        throw new ErrorConflicto('Ya existe una categoría con ese nombre en esta empresa.');
      }
      throw error;
    }
  });
}

/**
 * Actualiza una categoría de la empresa actual: `nombre`, `esPagoEmpleado` y/o `activo`
 * (baja/alta lógica). El `id` de otra empresa lo FILTRA la RLS → findUnique null → 404
 * (aislamiento fail-closed). Nombre duplicado en la empresa → 409. Aplica el invariante de
 * "pago a empleado" activa (no quitar la última). Cambiar `esPagoEmpleado` NO altera los
 * gastos ya registrados (su coherencia se validó al crearlos); solo afecta a los futuros.
 */
export async function actualizarCategoria(
  id: string,
  cambios: { nombre?: string; esPagoEmpleado?: boolean; activo?: boolean },
) {
  const data: { nombre?: string; esPagoEmpleado?: boolean; activo?: boolean } = {};
  if (cambios.nombre !== undefined) {
    const nombre = cambios.nombre.trim();
    if (!nombre) {
      throw new ErrorValidacion('El nombre de la categoría no puede quedar vacío.');
    }
    data.nombre = nombre;
  }
  if (cambios.esPagoEmpleado !== undefined) {
    data.esPagoEmpleado = cambios.esPagoEmpleado;
  }
  if (cambios.activo !== undefined) {
    data.activo = cambios.activo;
  }
  if (Object.keys(data).length === 0) {
    throw new ErrorValidacion('No hay cambios que aplicar.');
  }
  return txEmpresa(async (tx) => {
    const actual = await tx.categoriaGasto.findUnique({ where: { id }, select: SELECT_CATEGORIA });
    if (!actual) {
      throw new ErrorNoEncontrado('La categoría no existe.');
    }
    await verificarQuedaPagoEmpleadoActiva(tx, actual, {
      activo: data.activo ?? actual.activo,
      esPagoEmpleado: data.esPagoEmpleado ?? actual.esPagoEmpleado,
    });
    try {
      const actualizada = await tx.categoriaGasto.update({
        where: { id },
        data,
        select: SELECT_CATEGORIA,
      });
      return aCategoriaDto(actualizada);
    } catch (error) {
      if (esErrorPrisma(error, 'P2002')) {
        throw new ErrorConflicto('Ya existe una categoría con ese nombre en esta empresa.');
      }
      if (esErrorPrisma(error, 'P2025')) {
        throw new ErrorNoEncontrado('La categoría no existe.');
      }
      throw error;
    }
  });
}

/**
 * BAJA LÓGICA de una categoría (soft delete): `activo=false`. NUNCA borra la fila: los
 * gastos históricos la referencian por FK. Una categoría inactiva deja de aparecer en el
 * select del formulario de gasto, pero los gastos ya registrados con ella quedan intactos.
 * `id` de otra empresa → RLS → 404. Aplica el invariante de "pago a empleado" activa.
 */
export async function desactivarCategoria(id: string) {
  return txEmpresa(async (tx) => {
    const actual = await tx.categoriaGasto.findUnique({ where: { id }, select: SELECT_CATEGORIA });
    if (!actual) {
      throw new ErrorNoEncontrado('La categoría no existe.');
    }
    await verificarQuedaPagoEmpleadoActiva(tx, actual, {
      activo: false,
      esPagoEmpleado: actual.esPagoEmpleado,
    });
    const desactivada = await tx.categoriaGasto.update({
      where: { id },
      data: { activo: false },
      select: SELECT_CATEGORIA,
    });
    return aCategoriaDto(desactivada);
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
  // El soft-delete es de PRIMERA clase: una categoría inactiva no admite gastos nuevos
  // (el select ya solo muestra activas; el backend lo refuerza para un id viejo/fabricado).
  if (!categoria.activo) {
    throw new ErrorValidacion('La categoría de gasto indicada está inactiva.');
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
              ...(filtros.desde ? { gte: fechaDeFiltro(filtros.desde, 'desde') } : {}),
              ...(filtros.hasta ? { lte: fechaDeFiltro(filtros.hasta, 'hasta') } : {}),
            },
          }
        : {}),
    },
    orderBy: { fechaOperacion: 'desc' },
    include: {
      // Solo el DTO público de la categoría: `categoria: true` anidaba la fila
      // completa (incluido su empresaId).
      categoria: { select: SELECT_CATEGORIA },
      // Asientos que corrigen este gasto (reverso y, si la hubo, corrección). El
      // original es INMUTABLE: su estado real solo se conoce mirando sus asientos.
      correcciones: { select: { id: true, tipo: true, monto: true, motivo: true } },
    },
    }),
  );
  return gastos.map((gasto) => {
    const { correcciones, ...resto } = gasto;
    return { ...aGastoDto(resto), ...resumirCorreccion(Number(gasto.monto), correcciones) };
  });
}
