import { prisma } from '../../core/prisma.js';
import { escaparComodinesLike } from './ventas.service.js';

export interface RangoFiltro {
  desde: string;
  hasta: string;
  sedeId?: string;
  /** Filtros de cierre (solo acotan las ventas; compras/gastos no tienen cajera/turno). */
  cajera?: string;
  turno?: string;
}

function num(valor: { toString(): string } | null | undefined): number {
  return valor == null ? 0 : Number(valor);
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Ganancia del período: ventas − compras − gastos.
 *  - Compras por criterio DEVENGADO (fecha de emisión), monto total de la factura.
 *  - Ventas y gastos se toman netos: un `reverso` resta; `normal`/`correccion` suman.
 *  - Las ventas usan el TOTAL del cierre (que cuadra con Firestec), sin
 *    desglosar por tipo de arqueo. `cajera`/`turno` acotan SOLO las ventas; las
 *    compras y gastos no tienen esa dimensión y quedan a nivel sede/período.
 */
export async function gananciaDelPeriodo(filtros: RangoFiltro) {
  const { desde, hasta, sedeId, cajera, turno } = filtros;
  const sede = sedeId ? { sedeId } : {};
  const enRango = { gte: new Date(desde), lte: new Date(hasta) };
  const filtroCierre = {
    ...sede,
    // Cajera CASE-INSENSITIVE: tolera el texto libre legacy en cierres viejos.
    // Se escapan los comodines de LIKE (ILIKE) para un match exacto insensible.
    ...(cajera
      ? { cajera: { equals: escaparComodinesLike(cajera), mode: 'insensitive' as const } }
      : {}),
    ...(turno ? { turno: turno as 'manana' | 'tarde' | 'noche' } : {}),
  };

  const compras = await prisma.compra.aggregate({
    _sum: { montoTotal: true },
    where: { ...sede, fechaEmision: enRango },
  });

  const gastosPos = await prisma.gasto.aggregate({
    _sum: { monto: true },
    where: { ...sede, tipo: { in: ['normal', 'correccion'] }, fechaOperacion: enRango },
  });
  const gastosRev = await prisma.gasto.aggregate({
    _sum: { monto: true },
    where: { ...sede, tipo: 'reverso', fechaOperacion: enRango },
  });

  const ventasPos = await prisma.ventaDiaria.aggregate({
    _sum: { monto: true },
    where: { ...filtroCierre, tipo: { in: ['normal', 'correccion'] }, fechaOperacion: enRango },
  });
  const ventasRev = await prisma.ventaDiaria.aggregate({
    _sum: { monto: true },
    where: { ...filtroCierre, tipo: 'reverso', fechaOperacion: enRango },
  });

  const totalCompras = num(compras._sum.montoTotal);
  const totalGastos = num(gastosPos._sum.monto) - num(gastosRev._sum.monto);
  const totalVentas = num(ventasPos._sum.monto) - num(ventasRev._sum.monto);
  const ganancia = totalVentas - totalCompras - totalGastos;

  return {
    desde,
    hasta,
    ventas: redondear(totalVentas),
    compras: redondear(totalCompras),
    gastos: redondear(totalGastos),
    ganancia: redondear(ganancia),
  };
}

/** Gastos del período agrupados por categoría (netos de corrección). */
export async function gastosPorCategoria(filtros: RangoFiltro) {
  const { desde, hasta, sedeId } = filtros;
  const gastos = await prisma.gasto.findMany({
    where: {
      ...(sedeId ? { sedeId } : {}),
      fechaOperacion: { gte: new Date(desde), lte: new Date(hasta) },
    },
    include: { categoria: true },
  });

  const acumulado = new Map<string, { categoriaId: string; nombre: string; total: number }>();
  for (const gasto of gastos) {
    const signo = gasto.tipo === 'reverso' ? -1 : 1;
    const fila = acumulado.get(gasto.categoriaId) ?? {
      categoriaId: gasto.categoriaId,
      nombre: gasto.categoria.nombre,
      total: 0,
    };
    fila.total += signo * Number(gasto.monto);
    acumulado.set(gasto.categoriaId, fila);
  }

  return [...acumulado.values()]
    .map((fila) => ({ ...fila, total: redondear(fila.total) }))
    .filter((fila) => fila.total !== 0)
    .sort((a, b) => b.total - a.total);
}
