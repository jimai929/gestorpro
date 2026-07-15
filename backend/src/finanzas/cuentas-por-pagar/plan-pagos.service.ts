/**
 * Planificador de pagos a proveedores (SIMULACIÓN, sin efectos).
 *
 * NO crea, actualiza ni borra ningún PagoProveedor: solo calcula y devuelve una
 * PROPUESTA de reparto de un presupuesto entre las facturas pendientes. La deuda se
 * lee con `leerFacturasPendientes` (fuente única: la vista `cuenta_por_pagar`, que
 * ya netea reversos/correcciones) — no hay un algoritmo de deuda nuevo.
 *
 * Todo el dinero se opera en CÉNTIMOS enteros: nada de coma flotante. Ninguna
 * asignación supera el saldo de su factura ni, en total, el presupuesto; nunca hay
 * pagos negativos ni menores a 0.01. El mismo input produce el mismo output.
 */

import { ErrorValidacion, ErrorNoEncontrado } from '../../core/errors.js';
import {
  leerFacturasPendientes,
  type FacturaPendiente,
  type TramoAntiguedad,
} from './antiguedad.service.js';

export type EstrategiaPlan =
  | 'mas_antiguas_primero'
  | 'saldos_menores_primero'
  | 'proporcional_por_proveedor'
  | 'manual';

const ESTRATEGIAS: EstrategiaPlan[] = [
  'mas_antiguas_primero',
  'saldos_menores_primero',
  'proporcional_por_proveedor',
  'manual',
];

export interface EntradaPlan {
  presupuestoDisponible: number;
  estrategia: EstrategiaPlan;
  proveedorIds?: string[];
  tramos?: TramoAntiguedad[];
  fechaCorte?: string;
  montoMinimoPago?: number;
  limitePorProveedor?: number;
  compraIdsPrioritarias?: string[];
  /** Modo manual: monto planificado por compra (lo REVALIDA el backend). */
  asignacionesManuales?: Array<{ compraId: string; monto: number }>;
  /** Solo para tests: "hoy" fijo. */
  hoy?: Date;
}

function aCentimos(n: number): number {
  return Math.round(n * 100);
}
function aMoneda(centimos: number): number {
  return centimos / 100;
}

interface Trabajo extends FacturaPendiente {
  saldoCent: number;
  asignadoCent: number;
}

/** Reparto secuencial: asigna a cada factura el mínimo entre su saldo y lo que queda. */
function repartirSecuencial(orden: Trabajo[], presupuestoCent: number): number {
  let restante = presupuestoCent;
  for (const f of orden) {
    if (restante <= 0) break;
    const asignar = Math.min(f.saldoCent - f.asignadoCent, restante);
    if (asignar <= 0) continue;
    f.asignadoCent += asignar;
    restante -= asignar;
  }
  return restante;
}

export async function simularPlanPagos(entrada: EntradaPlan) {
  // ── Validación de entrada ──
  if (!ESTRATEGIAS.includes(entrada.estrategia)) {
    throw new ErrorValidacion('La estrategia del plan no es válida.');
  }
  const presupuestoCent = aCentimos(entrada.presupuestoDisponible);
  if (!Number.isFinite(entrada.presupuestoDisponible) || presupuestoCent <= 0) {
    throw new ErrorValidacion('El presupuesto disponible debe ser mayor que cero.');
  }
  const minimoCent = entrada.montoMinimoPago !== undefined ? aCentimos(entrada.montoMinimoPago) : 0;
  if (minimoCent < 0) {
    throw new ErrorValidacion('El monto mínimo de pago no puede ser negativo.');
  }
  const limiteProvCent =
    entrada.limitePorProveedor !== undefined ? aCentimos(entrada.limitePorProveedor) : null;
  if (limiteProvCent !== null && limiteProvCent <= 0) {
    throw new ErrorValidacion('El límite por proveedor debe ser mayor que cero.');
  }

  const hoy = entrada.hoy ?? new Date();
  const todas = await leerFacturasPendientes(hoy);
  const porId = new Map(todas.map((f) => [f.compraId, f]));

  // ── Selección del universo elegible según filtros ──
  const fechaCorte = entrada.fechaCorte ? new Date(entrada.fechaCorte) : null;
  if (fechaCorte && Number.isNaN(fechaCorte.getTime())) {
    throw new ErrorValidacion('La fecha de corte no es válida.');
  }
  const setProv = entrada.proveedorIds && entrada.proveedorIds.length
    ? new Set(entrada.proveedorIds)
    : null;
  const setTramos = entrada.tramos && entrada.tramos.length ? new Set(entrada.tramos) : null;

  let elegibles = todas.filter((f) => {
    if (setProv && !setProv.has(f.proveedorId)) return false;
    if (setTramos && !setTramos.has(f.tramo)) return false;
    if (fechaCorte && new Date(f.fechaCompra) > fechaCorte) return false;
    return true;
  });

  // ── Modo MANUAL: el backend revalida cada monto; NO confía en el front ──
  const trabajos: Trabajo[] = elegibles.map((f) => ({
    ...f,
    saldoCent: aCentimos(f.saldoPendiente),
    asignadoCent: 0,
  }));
  const trabajoPorId = new Map(trabajos.map((t) => [t.compraId, t]));

  if (entrada.estrategia === 'manual') {
    const manuales = entrada.asignacionesManuales ?? [];
    let sumaCent = 0;
    for (const a of manuales) {
      const t = trabajoPorId.get(a.compraId);
      if (!t) {
        // Puede ser una compra inexistente, pagada o fuera del filtro: se rechaza.
        if (!porId.has(a.compraId)) {
          throw new ErrorNoEncontrado(`La compra ${a.compraId} no existe o no tiene saldo pendiente.`);
        }
        throw new ErrorValidacion('Una compra asignada no está dentro del filtro actual.');
      }
      const montoCent = aCentimos(a.monto);
      if (!Number.isFinite(a.monto) || montoCent < 0) {
        throw new ErrorValidacion('Un monto planificado no es válido.');
      }
      if (montoCent === 0) continue; // 0 = sin pago para esa factura
      if (montoCent > t.saldoCent) {
        throw new ErrorValidacion('Un monto planificado excede el saldo de la factura.');
      }
      if (minimoCent > 0 && montoCent < minimoCent) {
        throw new ErrorValidacion('Un monto planificado es menor que el mínimo permitido.');
      }
      t.asignadoCent = montoCent;
      sumaCent += montoCent;
    }
    if (sumaCent > presupuestoCent) {
      throw new ErrorValidacion('El total planificado excede el presupuesto disponible.');
    }
    // Límite por proveedor (revalidado también en manual).
    if (limiteProvCent !== null) {
      const porProv = new Map<string, number>();
      for (const t of trabajos) {
        porProv.set(t.proveedorId, (porProv.get(t.proveedorId) ?? 0) + t.asignadoCent);
      }
      for (const total of porProv.values()) {
        if (total > limiteProvCent) {
          throw new ErrorValidacion('Un proveedor supera el límite por proveedor.');
        }
      }
    }
  } else {
    // ── Estrategias automáticas ──
    // Presupuesto por proveedor: min(presupuesto, límite por proveedor si lo hay).
    const cupoProveedor = new Map<string, number>();
    const asignarConLimite = (orden: Trabajo[], presupuesto: number): number => {
      let restante = presupuesto;
      for (const f of orden) {
        if (restante <= 0) break;
        const usadoProv = cupoProveedor.get(f.proveedorId) ?? 0;
        const cupoRestanteProv = limiteProvCent !== null ? limiteProvCent - usadoProv : Infinity;
        const asignar = Math.min(f.saldoCent - f.asignadoCent, restante, cupoRestanteProv);
        if (asignar <= 0) continue;
        f.asignadoCent += asignar;
        restante -= asignar;
        cupoProveedor.set(f.proveedorId, usadoProv + asignar);
      }
      return restante;
    };

    if (entrada.estrategia === 'mas_antiguas_primero') {
      // Prioridad manual primero (si se pidió), luego antigüedad desc / fecha asc / id.
      const prioritarias = new Set(entrada.compraIdsPrioritarias ?? []);
      const ordenadas = [...trabajos].sort((a, b) => {
        const pa = prioritarias.has(a.compraId) ? 0 : 1;
        const pb = prioritarias.has(b.compraId) ? 0 : 1;
        if (pa !== pb) return pa - pb;
        if (a.diasAntiguedad !== b.diasAntiguedad) return b.diasAntiguedad - a.diasAntiguedad;
        if (a.fechaCompra !== b.fechaCompra) return a.fechaCompra < b.fechaCompra ? -1 : 1;
        return a.compraId < b.compraId ? -1 : 1;
      });
      asignarConLimite(ordenadas, presupuestoCent);
    } else if (entrada.estrategia === 'saldos_menores_primero') {
      const ordenadas = [...trabajos].sort((a, b) => {
        if (a.saldoCent !== b.saldoCent) return a.saldoCent - b.saldoCent;
        if (a.diasAntiguedad !== b.diasAntiguedad) return b.diasAntiguedad - a.diasAntiguedad;
        return a.compraId < b.compraId ? -1 : 1;
      });
      asignarConLimite(ordenadas, presupuestoCent);
    } else {
      // proporcional_por_proveedor: reparte el presupuesto por peso de deuda de cada
      // proveedor; dentro del proveedor, más antiguas primero. Los céntimos sobrantes
      // por redondeo se reasignan de forma estable (mayor deuda primero, luego id).
      const deudaProv = new Map<string, number>();
      for (const t of trabajos) deudaProv.set(t.proveedorId, (deudaProv.get(t.proveedorId) ?? 0) + t.saldoCent);
      const deudaTotalCent = [...deudaProv.values()].reduce((a, b) => a + b, 0);
      const presupuestoEfectivo = Math.min(presupuestoCent, deudaTotalCent);

      const provs = [...deudaProv.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
      const cuota = new Map<string, number>();
      let repartido = 0;
      for (const [prov, deuda] of provs) {
        let base = Math.floor((presupuestoEfectivo * deuda) / (deudaTotalCent || 1));
        if (limiteProvCent !== null) base = Math.min(base, limiteProvCent, deuda);
        else base = Math.min(base, deuda);
        cuota.set(prov, base);
        repartido += base;
      }
      // Reasignar los céntimos sobrantes (por floor) de forma estable.
      let sobrante = presupuestoEfectivo - repartido;
      for (const [prov, deuda] of provs) {
        if (sobrante <= 0) break;
        const actual = cuota.get(prov) ?? 0;
        const tope = limiteProvCent !== null ? Math.min(limiteProvCent, deuda) : deuda;
        const puede = Math.min(sobrante, tope - actual);
        if (puede > 0) {
          cuota.set(prov, actual + puede);
          sobrante -= puede;
        }
      }
      // Dentro de cada proveedor: más antiguas primero.
      const porProveedor = new Map<string, Trabajo[]>();
      for (const t of trabajos) {
        const lista = porProveedor.get(t.proveedorId) ?? [];
        lista.push(t);
        porProveedor.set(t.proveedorId, lista);
      }
      for (const [prov, lista] of porProveedor) {
        lista.sort((a, b) => {
          if (a.diasAntiguedad !== b.diasAntiguedad) return b.diasAntiguedad - a.diasAntiguedad;
          if (a.fechaCompra !== b.fechaCompra) return a.fechaCompra < b.fechaCompra ? -1 : 1;
          return a.compraId < b.compraId ? -1 : 1;
        });
        repartirSecuencial(lista, cuota.get(prov) ?? 0);
      }
    }

    // Filtro de monto mínimo: descartar asignaciones por debajo del mínimo (salvo que
    // paguen el saldo completo). Se hace al final para no arrastrar céntimos sueltos.
    if (minimoCent > 0) {
      for (const t of trabajos) {
        if (t.asignadoCent > 0 && t.asignadoCent < minimoCent && t.asignadoCent < t.saldoCent) {
          t.asignadoCent = 0;
        }
      }
    }
  }

  // ── Construcción del resultado ──
  const asignaciones = trabajos
    .filter((t) => t.asignadoCent > 0)
    .map((t, i) => {
      const saldoProyCent = t.saldoCent - t.asignadoCent;
      return {
        compraId: t.compraId,
        numeroFactura: t.numeroFactura,
        proveedorId: t.proveedorId,
        proveedorNombre: t.proveedorNombre,
        identificacionFiscal: t.identificacionFiscal,
        fechaCompra: t.fechaCompra,
        diasAntiguedad: t.diasAntiguedad,
        tramo: t.tramo,
        montoOriginal: t.montoOriginal,
        saldoPendiente: aMoneda(t.saldoCent),
        montoPlanificado: aMoneda(t.asignadoCent),
        saldoProyectado: aMoneda(saldoProyCent),
        tipoResultado: saldoProyCent === 0 ? ('completa' as const) : ('parcial' as const),
        orden: i + 1,
      };
    });

  const totalPlanCent = trabajos.reduce((acc, t) => acc + t.asignadoCent, 0);
  const deudaTotalCent = todas.reduce((acc, f) => acc + aCentimos(f.saldoPendiente), 0);

  // Resumen por proveedor (sobre las facturas del universo ELEGIBLE, con su deuda).
  interface AggProv {
    proveedorId: string; nombre: string; identificacionFiscal: string | null;
    deudaCent: number; planCent: number; incluidas: number; completadas: number;
  }
  const aggProv = new Map<string, AggProv>();
  for (const t of trabajos) {
    let a = aggProv.get(t.proveedorId);
    if (!a) {
      a = { proveedorId: t.proveedorId, nombre: t.proveedorNombre, identificacionFiscal: t.identificacionFiscal, deudaCent: 0, planCent: 0, incluidas: 0, completadas: 0 };
      aggProv.set(t.proveedorId, a);
    }
    a.deudaCent += t.saldoCent;
    if (t.asignadoCent > 0) {
      a.planCent += t.asignadoCent;
      a.incluidas += 1;
      if (t.asignadoCent === t.saldoCent) a.completadas += 1;
    }
  }
  const resumenPorProveedor = [...aggProv.values()]
    .filter((a) => a.planCent > 0)
    .map((a) => ({
      proveedorId: a.proveedorId,
      nombre: a.nombre,
      identificacionFiscal: a.identificacionFiscal,
      deudaActual: aMoneda(a.deudaCent),
      montoPlanificado: aMoneda(a.planCent),
      deudaProyectada: aMoneda(a.deudaCent - a.planCent),
      cantidadFacturasIncluidas: a.incluidas,
      cantidadFacturasCompletadas: a.completadas,
    }))
    .sort((a, b) => b.montoPlanificado - a.montoPlanificado || a.nombre.localeCompare(b.nombre));

  // Resumen por tramo: deuda ANTES (todo el universo pendiente) y pago planificado.
  const TRAMOS: TramoAntiguedad[] = ['dias_0_30', 'dias_31_60', 'dias_61_90', 'dias_90_mas'];
  const antesCent: Record<TramoAntiguedad, number> = { dias_0_30: 0, dias_31_60: 0, dias_61_90: 0, dias_90_mas: 0 };
  const pagoCent: Record<TramoAntiguedad, number> = { dias_0_30: 0, dias_31_60: 0, dias_61_90: 0, dias_90_mas: 0 };
  for (const f of todas) antesCent[f.tramo] += aCentimos(f.saldoPendiente);
  for (const t of trabajos) pagoCent[t.tramo] += t.asignadoCent;
  const resumenPorTramo = TRAMOS.map((tr) => ({
    tramo: tr,
    deudaAntes: aMoneda(antesCent[tr]),
    pagoPlanificado: aMoneda(pagoCent[tr]),
    deudaDespues: aMoneda(antesCent[tr] - pagoCent[tr]),
  }));

  const completas = asignaciones.filter((a) => a.tipoResultado === 'completa').length;

  return {
    cabecera: {
      presupuestoDisponible: aMoneda(presupuestoCent),
      montoPlanificado: aMoneda(totalPlanCent),
      presupuestoNoUsado: aMoneda(presupuestoCent - totalPlanCent),
      deudaTotal: aMoneda(deudaTotalCent),
      deudaProyectada: aMoneda(deudaTotalCent - totalPlanCent),
      estrategia: entrada.estrategia,
      cantidadProveedores: resumenPorProveedor.length,
      cantidadFacturas: asignaciones.length,
      facturasCompletas: completas,
      facturasParciales: asignaciones.length - completas,
    },
    asignaciones,
    resumenPorProveedor,
    resumenPorTramo,
  };
}
