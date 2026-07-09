import { txEmpresa } from '../../core/tenant/contexto.js';
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
 * Ganancia del período en criterio CAJA: ventas − pagos a proveedor − gastos.
 *  - `compras` (INFORMATIVO) = total DEVENGADO por fecha de emisión: todas las facturas
 *    registradas, estén pagadas o no. NO entra en la ganancia de caja.
 *  - `pagosProveedor` = EGRESO REAL de caja hacia proveedores: pagos de facturas a crédito
 *    (por fecha de pago, netos de reverso) + compras de CONTADO (por fecha de emisión: se pagan
 *    en el acto y no generan PagoProveedor). Una compra a crédito IMPAGA NO cuenta como egreso:
 *    queda como deuda en `cuenta_por_pagar` (ver lista de proveedores). Antes se restaba la
 *    compra completa por devengado, contando como efectivo salido dinero que aún no se pagó.
 *  - Ventas y gastos se toman netos: un `reverso` resta; `normal`/`correccion` suman.
 *  - Las ventas usan el TOTAL del cierre (que cuadra con Firestec). `cajera`/`turno` acotan
 *    SOLO las ventas; compras, pagos y gastos quedan a nivel sede/período.
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

  return txEmpresa(async (tx) => {
    // Compras REGISTRADAS (devengado, informativo): todas las facturas por fecha de emisión.
    const compras = await tx.compra.aggregate({
      _sum: { montoTotal: true },
      where: { ...sede, fechaEmision: enRango },
    });

    // Egreso real a proveedores = pagos de crédito (por fecha de pago, netos de reverso)
    //  + compras de contado (pagadas en el acto, por fecha de emisión). PagoProveedor no tiene
    //  sede propia: se acota por la relación `compra`. Se fija `tipo:'credito'` explícito (los
    //  pagos solo existen sobre crédito) como defensa en profundidad ante datos legacy.
    const pagoCompra = { compra: { tipo: 'credito' as const, ...(sedeId ? { sedeId } : {}) } };
    const pagosCreditoPos = await tx.pagoProveedor.aggregate({
      _sum: { monto: true },
      where: { ...pagoCompra, tipo: { in: ['normal', 'correccion'] }, fechaPago: enRango },
    });
    const pagosCreditoRev = await tx.pagoProveedor.aggregate({
      _sum: { monto: true },
      where: { ...pagoCompra, tipo: 'reverso', fechaPago: enRango },
    });
    const contadoEgreso = await tx.compra.aggregate({
      _sum: { montoTotal: true },
      where: { ...sede, tipo: 'contado', fechaEmision: enRango },
    });

    const gastosPos = await tx.gasto.aggregate({
      _sum: { monto: true },
      where: { ...sede, tipo: { in: ['normal', 'correccion'] }, fechaOperacion: enRango },
    });
    const gastosRev = await tx.gasto.aggregate({
      _sum: { monto: true },
      where: { ...sede, tipo: 'reverso', fechaOperacion: enRango },
    });

    const ventasPos = await tx.ventaDiaria.aggregate({
      _sum: { monto: true },
      where: { ...filtroCierre, tipo: { in: ['normal', 'correccion'] }, fechaOperacion: enRango },
    });
    const ventasRev = await tx.ventaDiaria.aggregate({
      _sum: { monto: true },
      where: { ...filtroCierre, tipo: 'reverso', fechaOperacion: enRango },
    });

    const totalCompras = num(compras._sum.montoTotal);
    const totalPagosProveedor =
      num(pagosCreditoPos._sum.monto) -
      num(pagosCreditoRev._sum.monto) +
      num(contadoEgreso._sum.montoTotal);
    const totalGastos = num(gastosPos._sum.monto) - num(gastosRev._sum.monto);
    const totalVentas = num(ventasPos._sum.monto) - num(ventasRev._sum.monto);
    // Ganancia CAJA: solo egresos REALES (pagos a proveedor + gastos); una compra impaga no resta.
    const ganancia = totalVentas - totalPagosProveedor - totalGastos;

    return {
      desde,
      hasta,
      ventas: redondear(totalVentas),
      compras: redondear(totalCompras),
      pagosProveedor: redondear(totalPagosProveedor),
      gastos: redondear(totalGastos),
      ganancia: redondear(ganancia),
    };
  });
}

/** Gastos del período agrupados por categoría (netos de corrección). */
export async function gastosPorCategoria(filtros: RangoFiltro) {
  const { desde, hasta, sedeId } = filtros;
  const gastos = await txEmpresa((tx) =>
    tx.gasto.findMany({
      where: {
        ...(sedeId ? { sedeId } : {}),
        fechaOperacion: { gte: new Date(desde), lte: new Date(hasta) },
      },
      include: { categoria: true },
    }),
  );

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
