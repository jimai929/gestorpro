/**
 * Antigüedad de cuentas por pagar (lectura, sin efectos).
 *
 * Reutiliza la vista `cuenta_por_pagar`, que YA calcula el saldo y el pago efectivo
 * de cada factura a crédito: `total_pagado = SUM(CASE WHEN tipo='reverso' THEN -monto
 * ELSE monto END)`, así que un pago anulado (reverso sin corrección) NO reduce el
 * saldo y uno corregido reduce solo su importe corregido. No hay un tercer algoritmo
 * de deuda: es el mismo que usan el deudaTotal del proveedor y el estado de cuenta.
 *
 * La ANTIGÜEDAD se cuenta en días naturales desde la fecha de emisión de la compra
 * hasta hoy. NO es "días de mora": el sistema no exige una fecha de vencimiento y no
 * se inventa un plazo. Es la edad del saldo pendiente, distinta del vencimiento
 * contractual. Los tramos (0-30, 31-60, 61-90, 90+) tienen UNA sola implementación
 * (`tramoDeAntiguedad`) y el backend etiqueta cada factura: el front no recalcula.
 */

import { txEmpresa } from '../../core/tenant/contexto.js';
import { ErrorValidacion } from '../../core/errors.js';

export type TramoAntiguedad = 'dias_0_30' | 'dias_31_60' | 'dias_61_90' | 'dias_90_mas';
export type OrdenAntiguedad = 'deuda_desc' | 'antiguedad_desc' | 'proveedor_asc' | 'fecha_asc';

/** Única fuente de verdad de los límites de tramo (0-30, 31-60, 61-90, 90+). */
export function tramoDeAntiguedad(dias: number): TramoAntiguedad {
  if (dias <= 30) return 'dias_0_30';
  if (dias <= 60) return 'dias_31_60';
  if (dias <= 90) return 'dias_61_90';
  return 'dias_90_mas';
}

/** Tope duro de facturas pendientes que se traen a memoria (no lectura ilimitada). */
const TOPE_FACTURAS = 10000;
const TAMANO_PAGINA_DEFECTO = 20;
// Alto para permitir la exportación a CSV del conjunto completo en una sola página.
const TAMANO_PAGINA_MAXIMO = 2000;

const ORDENES_VALIDOS: OrdenAntiguedad[] = [
  'deuda_desc',
  'antiguedad_desc',
  'proveedor_asc',
  'fecha_asc',
];

interface FilaVista {
  compra_id: string;
  proveedor_id: string;
  proveedor_nombre: string;
  identificacion_fiscal: string | null;
  numero_factura: string;
  monto_total: string;
  fecha_emision: Date;
  total_pagado: string;
  saldo: string;
}

export interface FacturaAntiguedad {
  compraId: string;
  numeroFactura: string;
  proveedorId: string;
  proveedorNombre: string;
  fechaCompra: string; // YYYY-MM-DD
  diasAntiguedad: number;
  tramo: TramoAntiguedad;
  montoOriginal: number;
  pagosVigentes: number;
  saldoPendiente: number;
  ultimoPago: string | null; // YYYY-MM-DD; null si aún no hay pagos efectivos
}

export interface FiltrosAntiguedad {
  proveedorId?: string;
  tramo?: TramoAntiguedad | 'todos';
  texto?: string;
  orden?: OrdenAntiguedad;
  pagina?: number;
  tamano?: number;
  /** Solo para tests: "hoy" fijo. En producción se usa la fecha real. */
  hoy?: Date;
}

function aCentimos(n: number): number {
  return Math.round(n * 100);
}
function aMoneda(centimos: number): number {
  return centimos / 100;
}
function aFechaIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}
/** Días naturales entre dos fechas (por su año/mes/día UTC, sin arrastrar la hora). */
function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getUTCFullYear(), desde.getUTCMonth(), desde.getUTCDate());
  const b = Date.UTC(hasta.getUTCFullYear(), hasta.getUTCMonth(), hasta.getUTCDate());
  return Math.floor((b - a) / 86_400_000);
}

const porcentaje = (parte: number, total: number): number =>
  total === 0 ? 0 : Math.round((parte / total) * 1000) / 10;

export async function antiguedadCuentasPorPagar(filtros: FiltrosAntiguedad) {
  const orden = filtros.orden ?? 'deuda_desc';
  if (filtros.orden && !ORDENES_VALIDOS.includes(filtros.orden)) {
    throw new ErrorValidacion('El criterio de orden no es válido.');
  }
  const pagina = Math.max(1, Math.trunc(filtros.pagina ?? 1));
  const tamano = Math.min(
    TAMANO_PAGINA_MAXIMO,
    Math.max(1, Math.trunc(filtros.tamano ?? TAMANO_PAGINA_DEFECTO)),
  );
  const hoy = filtros.hoy ?? new Date();

  // Facturas a crédito con SALDO PENDIENTE (> 0): las pagadas quedan fuera. La vista
  // ya excluye las de contado y ya neteó reversos/correcciones. RLS aísla el tenant.
  const filas = await txEmpresa((tx) =>
    tx.$queryRaw<FilaVista[]>`
      SELECT cpp.compra_id, cpp.proveedor_id, p.nombre AS proveedor_nombre,
             p.identificacion_fiscal, cpp.numero_factura, cpp.monto_total,
             cpp.fecha_emision, cpp.total_pagado, cpp.saldo
      FROM cuenta_por_pagar cpp
      JOIN proveedor p ON p.id = cpp.proveedor_id
      WHERE cpp.saldo > 0
      ORDER BY cpp.fecha_emision ASC
      LIMIT ${TOPE_FACTURAS}`,
  );

  // Último pago EFECTIVO por compra (una consulta para todas): max(fecha_pago) de los
  // asientos que suman (normal/corrección), ignorando los reversos.
  const compraIds = filas.map((f) => f.compra_id);
  const ultimoPagoPorCompra = new Map<string, string>();
  if (compraIds.length > 0) {
    const pagos = await txEmpresa((tx) =>
      tx.pagoProveedor.groupBy({
        by: ['compraId'],
        where: { compraId: { in: compraIds }, tipo: { in: ['normal', 'correccion'] } },
        _max: { fechaPago: true },
      }),
    );
    for (const p of pagos) {
      if (p._max.fechaPago) ultimoPagoPorCompra.set(p.compraId, aFechaIso(p._max.fechaPago));
    }
  }

  // Mapear a facturas con antigüedad + tramo (etiquetado ÚNICO en el backend).
  const todas: FacturaAntiguedad[] = filas.map((f) => {
    const dias = Math.max(0, diasEntre(f.fecha_emision, hoy));
    return {
      compraId: f.compra_id,
      numeroFactura: f.numero_factura,
      proveedorId: f.proveedor_id,
      proveedorNombre: f.proveedor_nombre,
      fechaCompra: aFechaIso(f.fecha_emision),
      diasAntiguedad: dias,
      tramo: tramoDeAntiguedad(dias),
      montoOriginal: Number(f.monto_total),
      pagosVigentes: Number(f.total_pagado),
      saldoPendiente: Number(f.saldo),
      ultimoPago: ultimoPagoPorCompra.get(f.compra_id) ?? null,
    };
  });

  // ── Filtros de aplicación ──
  const texto = (filtros.texto ?? '').trim().toLowerCase();
  const tramoFiltro = filtros.tramo && filtros.tramo !== 'todos' ? filtros.tramo : null;
  const filtradas = todas.filter((f) => {
    if (filtros.proveedorId && f.proveedorId !== filtros.proveedorId) return false;
    if (tramoFiltro && f.tramo !== tramoFiltro) return false;
    if (texto) {
      const campos = [f.proveedorNombre, f.numeroFactura];
      if (!campos.some((c) => c.toLowerCase().includes(texto))) return false;
    }
    return true;
  });

  // ── Resumen (sobre TODO el conjunto filtrado) ──
  let deudaCent = 0;
  const porTramoCent: Record<TramoAntiguedad, number> = {
    dias_0_30: 0, dias_31_60: 0, dias_61_90: 0, dias_90_mas: 0,
  };
  let masAntiguaDias = 0;

  // Agregado por proveedor (también sobre el conjunto filtrado completo).
  interface AgregadoProveedor {
    proveedorId: string;
    nombre: string;
    identificacionFiscal: string | null;
    deudaCent: number;
    cantidadFacturas: number;
    tramosCent: Record<TramoAntiguedad, number>;
    facturaMasAntiguaFecha: string;
    facturaMasAntiguaDias: number;
  }
  const agregadoPorProveedor = new Map<string, AgregadoProveedor>();

  for (const f of filtradas) {
    const saldoCent = aCentimos(f.saldoPendiente);
    deudaCent += saldoCent;
    porTramoCent[f.tramo] += saldoCent;
    if (f.diasAntiguedad > masAntiguaDias) masAntiguaDias = f.diasAntiguedad;

    let agg = agregadoPorProveedor.get(f.proveedorId);
    if (!agg) {
      agg = {
        proveedorId: f.proveedorId,
        nombre: f.proveedorNombre,
        identificacionFiscal: filas.find((v) => v.proveedor_id === f.proveedorId)?.identificacion_fiscal ?? null,
        deudaCent: 0,
        cantidadFacturas: 0,
        tramosCent: { dias_0_30: 0, dias_31_60: 0, dias_61_90: 0, dias_90_mas: 0 },
        facturaMasAntiguaFecha: f.fechaCompra,
        facturaMasAntiguaDias: f.diasAntiguedad,
      };
      agregadoPorProveedor.set(f.proveedorId, agg);
    }
    agg.deudaCent += saldoCent;
    agg.cantidadFacturas += 1;
    agg.tramosCent[f.tramo] += saldoCent;
    if (f.diasAntiguedad > agg.facturaMasAntiguaDias) {
      agg.facturaMasAntiguaDias = f.diasAntiguedad;
      agg.facturaMasAntiguaFecha = f.fechaCompra;
    }
  }

  const proveedores = [...agregadoPorProveedor.values()]
    .map((a) => ({
      proveedorId: a.proveedorId,
      nombre: a.nombre,
      identificacionFiscal: a.identificacionFiscal,
      deudaTotal: aMoneda(a.deudaCent),
      cantidadFacturas: a.cantidadFacturas,
      deuda0a30: aMoneda(a.tramosCent.dias_0_30),
      deuda31a60: aMoneda(a.tramosCent.dias_31_60),
      deuda61a90: aMoneda(a.tramosCent.dias_61_90),
      deuda90Mas: aMoneda(a.tramosCent.dias_90_mas),
      facturaMasAntiguaFecha: a.facturaMasAntiguaFecha,
      facturaMasAntiguaDias: a.facturaMasAntiguaDias,
    }))
    .sort((a, b) => b.deudaTotal - a.deudaTotal || a.nombre.localeCompare(b.nombre));

  const proveedorMayor = proveedores[0] ?? null;

  // ── Orden de las facturas para la página ──
  const ordenadas = [...filtradas].sort((a, b) => {
    switch (orden) {
      case 'antiguedad_desc':
        return b.diasAntiguedad - a.diasAntiguedad || b.saldoPendiente - a.saldoPendiente;
      case 'proveedor_asc':
        return a.proveedorNombre.localeCompare(b.proveedorNombre) || b.saldoPendiente - a.saldoPendiente;
      case 'fecha_asc':
        return a.fechaCompra < b.fechaCompra ? -1 : a.fechaCompra > b.fechaCompra ? 1 : 0;
      case 'deuda_desc':
      default:
        return b.saldoPendiente - a.saldoPendiente || b.diasAntiguedad - a.diasAntiguedad;
    }
  });

  const total = ordenadas.length;
  const facturas = ordenadas.slice((pagina - 1) * tamano, (pagina - 1) * tamano + tamano);

  return {
    proveedores,
    facturas,
    paginacion: {
      pagina,
      tamano,
      total,
      paginas: Math.max(1, Math.ceil(total / tamano)),
    },
    resumen: {
      deudaTotal: aMoneda(deudaCent),
      cantidadFacturasPendientes: filtradas.length,
      cantidadProveedores: agregadoPorProveedor.size,
      deuda0a30: aMoneda(porTramoCent.dias_0_30),
      deuda31a60: aMoneda(porTramoCent.dias_31_60),
      deuda61a90: aMoneda(porTramoCent.dias_61_90),
      deuda90Mas: aMoneda(porTramoCent.dias_90_mas),
      pct0a30: porcentaje(porTramoCent.dias_0_30, deudaCent),
      pct31a60: porcentaje(porTramoCent.dias_31_60, deudaCent),
      pct61a90: porcentaje(porTramoCent.dias_61_90, deudaCent),
      pct90Mas: porcentaje(porTramoCent.dias_90_mas, deudaCent),
      cant0a30: filtradas.filter((f) => f.tramo === 'dias_0_30').length,
      cant31a60: filtradas.filter((f) => f.tramo === 'dias_31_60').length,
      cant61a90: filtradas.filter((f) => f.tramo === 'dias_61_90').length,
      cant90Mas: filtradas.filter((f) => f.tramo === 'dias_90_mas').length,
      deudaMasAntiguaDias: masAntiguaDias,
      proveedorMayorDeuda: proveedorMayor
        ? { id: proveedorMayor.proveedorId, nombre: proveedorMayor.nombre, deuda: proveedorMayor.deudaTotal }
        : null,
    },
  };
}
