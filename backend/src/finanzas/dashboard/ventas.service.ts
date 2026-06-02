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

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Escapa los comodines de LIKE (`\ % _`) en un valor. El filtro case-insensitive
 * de Prisma (`mode: 'insensitive'`) se traduce a `ILIKE` en PostgreSQL, donde
 * `%` y `_` son comodines: sin escapar, un valor legacy como `caja_1` haría
 * match con filas ajenas. Escapado, `ILIKE` lo trata como literal exacto (solo
 * insensible a mayúsculas). Se exporta para reusarlo en el dashboard.
 */
export function escaparComodinesLike(valor: string): string {
  return valor.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Un tipo del arqueo de caja. */
export type TipoArqueo = 'efectivo' | 'tarjeta' | 'yappy' | 'loteria';

/** Una línea del arqueo: el monto contado de un tipo. */
export interface LineaArqueo {
  tipoArqueo: TipoArqueo;
  monto: number;
}

interface VentaConDetalles {
  monto: { toString(): string };
  detalles?: Array<{ monto: { toString(): string } }>;
}

/** Serializa los montos (Decimal) a number para el contrato de la API. */
function aVentaDto<T extends VentaConDetalles>(venta: T) {
  return {
    ...venta,
    monto: Number(venta.monto),
    detalles: (venta.detalles ?? []).map((d) => ({ ...d, monto: Number(d.monto) })),
  };
}

/**
 * Revisa el arqueo de caja. Devuelve un mensaje de error si es inválido o `null`
 * si está bien. Reglas: al menos una línea, ninguna negativa y sin tipos
 * repetidos. Lo reutilizan el registro y la corrección (con su propio error).
 */
export function revisarArqueo(detalles: LineaArqueo[]): string | null {
  if (!detalles || detalles.length === 0) {
    return 'El arqueo de caja debe tener al menos una línea.';
  }
  const tipos = new Set<string>();
  for (const linea of detalles) {
    if (linea.monto < 0) {
      return 'Una línea del arqueo no puede ser negativa.';
    }
    if (tipos.has(linea.tipoArqueo)) {
      return `El tipo de arqueo "${linea.tipoArqueo}" está repetido en el cierre.`;
    }
    tipos.add(linea.tipoArqueo);
  }
  return null;
}

export interface DatosVenta {
  sedeId: string;
  fechaOperacion: string;
  turno: 'manana' | 'tarde' | 'noche';
  cajera: string;
  cerradoPor: string;
  horaApertura?: string;
  horaCierre?: string;
  detalles: LineaArqueo[];
  usuarioId: string;
}

/**
 * Registra el cierre de caja de un turno (movimiento `normal`) con su arqueo.
 * El `monto` total es la suma de las líneas del arqueo y debe cuadrar con
 * Firestec. `cajera` y `cerradoPor` son snapshot string (`"E001 - Nombre"`), no
 * FK. Un segundo cierre normal para la misma (sede, fecha, turno, cajera) se
 * rechaza con 409: lo impide el índice único parcial `uq_venta_normal`, cuyo
 * P2002 se traduce aquí.
 */
export async function registrarVenta(datos: DatosVenta) {
  const errorArqueo = revisarArqueo(datos.detalles);
  if (errorArqueo) {
    throw new ErrorValidacion(errorArqueo);
  }
  const total = redondear(datos.detalles.reduce((acc, d) => acc + d.monto, 0));

  try {
    const venta = await prisma.ventaDiaria.create({
      data: {
        sedeId: datos.sedeId,
        fechaOperacion: new Date(datos.fechaOperacion),
        turno: datos.turno,
        cajera: datos.cajera,
        cerradoPor: datos.cerradoPor,
        ...(datos.horaApertura ? { horaApertura: datos.horaApertura } : {}),
        ...(datos.horaCierre ? { horaCierre: datos.horaCierre } : {}),
        monto: total,
        tipo: 'normal',
        usuarioId: datos.usuarioId,
        detalles: {
          create: datos.detalles.map((d) => ({ tipoArqueo: d.tipoArqueo, monto: d.monto })),
        },
      },
      include: { detalles: true },
    });
    return aVentaDto(venta);
  } catch (error) {
    if (esErrorPrisma(error, 'P2002')) {
      throw new ErrorConflicto(
        'Ya existe el cierre de esa cajera y turno para la fecha; use una corrección para ajustarlo.',
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
  cajera?: string;
  turno?: string;
}) {
  const ventas = await prisma.ventaDiaria.findMany({
    where: {
      tipo: 'normal',
      ...(filtros.sedeId ? { sedeId: filtros.sedeId } : {}),
      // Filtro de cajera CASE-INSENSITIVE: tolera el texto libre legacy
      // ('yoany', '9 yon') tecleado antes del catálogo de roles. Se escapan los
      // comodines de LIKE para que ILIKE haga match EXACTO (insensible a caso).
      ...(filtros.cajera
        ? { cajera: { equals: escaparComodinesLike(filtros.cajera), mode: 'insensitive' } }
        : {}),
      ...(filtros.turno ? { turno: filtros.turno as 'manana' | 'tarde' | 'noche' } : {}),
      ...(filtros.desde || filtros.hasta
        ? {
            fechaOperacion: {
              ...(filtros.desde ? { gte: new Date(filtros.desde) } : {}),
              ...(filtros.hasta ? { lte: new Date(filtros.hasta) } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ fechaOperacion: 'desc' }, { turno: 'asc' }, { cajera: 'asc' }],
    include: { detalles: true },
  });
  return ventas.map(aVentaDto);
}

/**
 * Valores DISTINTOS de `cajera` presentes en los cierres, para poblar el filtro
 * del dashboard. Incluye los valores legacy/texto libre ('yoany', '9 yon', '1',
 * '2') que se limpiarán en una fase posterior. Ordenados alfabéticamente.
 */
export async function listarCajeras(): Promise<string[]> {
  const filas = await prisma.ventaDiaria.findMany({
    distinct: ['cajera'],
    select: { cajera: true },
    orderBy: { cajera: 'asc' },
  });
  return filas.map((f) => f.cajera);
}
