/**
 * Flujo de caja operativo (lectura, sin efectos).
 *
 * Reúne los MOVIMIENTOS de dinero YA registrados: ingresos por cierre de caja
 * (venta), salidas por gasto y por pago a proveedor. El monto vigente y el estado
 * de cada uno salen del MISMO `resumirCorreccion()` que usan los listados, el
 * historial y la auditoría — no hay un cuarto algoritmo. Un movimiento anulado vale
 * 0; uno corregido vale su importe corregido. Es el mismo criterio CAJA del
 * dashboard (`flujoNeto = ingresos − gastos − pagos a proveedor`).
 *
 * NO es ganancia ni el saldo real de banco/caja: solo los movimientos registrados
 * en GestorPro. Las compras a crédito impagas NO son salida de caja (no hay pago).
 * Las compras de contado no generan un PagoProveedor: no aparecen como movimiento
 * individual aquí (sí en el criterio agregado del dashboard).
 *
 * Todo el dinero se opera en CÉNTIMOS enteros.
 */

import { txEmpresa } from '../../core/tenant/contexto.js';
import { ErrorValidacion } from '../../core/errors.js';
import { resumirCorreccion } from '../../shared/services/correccion.estado.js';
import type { TipoArqueo } from './ventas.service.js';

export type TipoFlujo = 'ingreso' | 'gasto' | 'pago_proveedor';
export type EntidadFlujo = 'venta' | 'gasto' | 'pago';
export type DireccionFlujo = 'entrada' | 'salida';
export type EstadoFlujo = 'vigente' | 'corregido' | 'anulado';
export type OrdenFlujo = 'fecha_desc' | 'fecha_asc' | 'monto_desc' | 'monto_asc';

interface LineaArqueo {
  tipoArqueo: string;
  monto: number;
}

export type DetalleFlujo =
  | {
      entidad: 'venta';
      sede: string;
      cajera: string;
      turno: string;
      arqueoOriginal: LineaArqueo[];
      arqueoVigente: LineaArqueo[];
    }
  | { entidad: 'gasto'; categoria: string; descripcion: string | null; tipoPago: string | null; fecha: string }
  | { entidad: 'pago'; proveedor: string; numeroFactura: string; fechaPago: string };

export interface MovimientoFlujo {
  id: string;
  tipo: TipoFlujo;
  entidad: EntidadFlujo;
  fecha: string; // fecha de negocio (día de caja)
  fechaCreacion: string;
  montoOriginal: number;
  montoVigente: number;
  direccion: DireccionFlujo;
  /** Impacto NETO en caja: + para entradas, − para salidas. 0 si está anulado. */
  impactoNeto: number;
  estado: EstadoFlujo;
  motivoCorreccion: string | null;
  descripcion: string;
  documento: string;
  registradoPor: string | null;
  usuarioId: string;
  detalle: DetalleFlujo;
}

export interface FiltrosFlujo {
  desde?: string;
  hasta?: string;
  tipo?: TipoFlujo | 'todos';
  sedeId?: string;
  proveedorId?: string;
  categoriaId?: string;
  estado?: EstadoFlujo | 'todos';
  texto?: string;
  orden?: OrdenFlujo;
  pagina?: number;
  tamano?: number;
}

const TAMANO_DEFECTO = 20;
const TAMANO_MAXIMO = 2000;
const TOPE_MOVIMIENTOS = 10000;
const ORDENES: OrdenFlujo[] = ['fecha_desc', 'fecha_asc', 'monto_desc', 'monto_asc'];

function aCentimos(n: number): number { return Math.round(n * 100); }
function aMoneda(c: number): number { return c / 100; }
function aFechaIso(f: Date): string { return f.toISOString().slice(0, 10); }
function porcentaje(parte: number, total: number): number {
  return total === 0 ? 0 : Math.round((parte / total) * 1000) / 10;
}

interface Asiento { tipo: string; monto: { toString(): string }; motivo?: string | null }

export async function flujoCajaOperativo(filtros: FiltrosFlujo) {
  const orden = filtros.orden ?? 'fecha_desc';
  if (filtros.orden && !ORDENES.includes(filtros.orden)) {
    throw new ErrorValidacion('El criterio de orden no es válido.');
  }
  if (!filtros.desde || !filtros.hasta) {
    throw new ErrorValidacion('El rango de fechas (desde y hasta) es obligatorio.');
  }
  const desde = new Date(filtros.desde);
  const hasta = new Date(filtros.hasta);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    throw new ErrorValidacion('Las fechas no son válidas.');
  }
  if (desde > hasta) {
    throw new ErrorValidacion('La fecha "desde" no puede ser posterior a "hasta".');
  }
  const pagina = Math.max(1, Math.trunc(filtros.pagina ?? 1));
  const tamano = Math.min(TAMANO_MAXIMO, Math.max(1, Math.trunc(filtros.tamano ?? TAMANO_DEFECTO)));
  const enRango = { gte: desde, lte: hasta };

  const tipoFiltro = filtros.tipo && filtros.tipo !== 'todos' ? filtros.tipo : null;
  // Un filtro de proveedor solo tiene sentido para pagos; uno de categoría, para gastos.
  const traerVenta = (!tipoFiltro || tipoFiltro === 'ingreso') && !filtros.proveedorId && !filtros.categoriaId;
  const traerGasto = (!tipoFiltro || tipoFiltro === 'gasto') && !filtros.proveedorId;
  const traerPago = (!tipoFiltro || tipoFiltro === 'pago_proveedor') && !filtros.categoriaId;

  const { movimientos, sedes, proveedores, categorias, usuarios } = await txEmpresa(async (tx) => {
    const acumulado: MovimientoFlujo[] = [];

    // ── INGRESOS: cierres de caja ──
    if (traerVenta) {
      const ventas = await tx.ventaDiaria.findMany({
        where: {
          tipo: 'normal',
          fechaOperacion: enRango,
          ...(filtros.sedeId ? { sedeId: filtros.sedeId } : {}),
        },
        take: TOPE_MOVIMIENTOS,
        select: {
          id: true, monto: true, fechaOperacion: true, creadoEn: true, turno: true,
          cajera: true, usuarioId: true, sede: { select: { nombre: true } },
          detalles: { select: { tipoArqueo: true, monto: true } },
          correcciones: {
            select: { tipo: true, monto: true, motivo: true, detalles: { select: { tipoArqueo: true, monto: true } } },
          },
        },
      });
      for (const v of ventas) {
        const original = Number(v.monto);
        const resumen = resumirCorreccion(original, v.correcciones as Asiento[]);
        const correccion = (v.correcciones as Array<{ tipo: string; detalles: Array<{ tipoArqueo: string; monto: unknown }> }>).find((c) => c.tipo === 'correccion');
        const arqueoVigente =
          resumen.estado === 'corregido' && correccion
            ? correccion.detalles.map((d) => ({ tipoArqueo: d.tipoArqueo, monto: Number(d.monto) }))
            : resumen.estado === 'anulado' ? []
            : v.detalles.map((d) => ({ tipoArqueo: d.tipoArqueo, monto: Number(d.monto) }));
        acumulado.push({
          id: v.id, tipo: 'ingreso', entidad: 'venta',
          fecha: aFechaIso(v.fechaOperacion), fechaCreacion: v.creadoEn.toISOString(),
          montoOriginal: original, montoVigente: resumen.montoVigente,
          direccion: 'entrada', impactoNeto: resumen.montoVigente,
          estado: resumen.estado, motivoCorreccion: resumen.motivoCorreccion,
          descripcion: `${v.sede.nombre} · ${v.cajera}`,
          documento: `${aFechaIso(v.fechaOperacion)} ${v.turno}`,
          registradoPor: null, usuarioId: v.usuarioId,
          detalle: {
            entidad: 'venta', sede: v.sede.nombre, cajera: v.cajera, turno: v.turno,
            arqueoOriginal: v.detalles.map((d) => ({ tipoArqueo: d.tipoArqueo, monto: Number(d.monto) })),
            arqueoVigente,
          },
        });
      }
    }

    // ── SALIDAS: gastos ──
    if (traerGasto) {
      const gastos = await tx.gasto.findMany({
        where: {
          tipo: 'normal',
          fechaOperacion: enRango,
          ...(filtros.sedeId ? { sedeId: filtros.sedeId } : {}),
          ...(filtros.categoriaId ? { categoriaId: filtros.categoriaId } : {}),
        },
        take: TOPE_MOVIMIENTOS,
        select: {
          id: true, monto: true, fechaOperacion: true, creadoEn: true, descripcion: true,
          tipoPago: true, usuarioId: true, categoria: { select: { nombre: true } },
          correcciones: { select: { tipo: true, monto: true, motivo: true } },
        },
      });
      for (const g of gastos) {
        const original = Number(g.monto);
        const resumen = resumirCorreccion(original, g.correcciones as Asiento[]);
        acumulado.push({
          id: g.id, tipo: 'gasto', entidad: 'gasto',
          fecha: aFechaIso(g.fechaOperacion), fechaCreacion: g.creadoEn.toISOString(),
          montoOriginal: original, montoVigente: resumen.montoVigente,
          direccion: 'salida', impactoNeto: -resumen.montoVigente,
          estado: resumen.estado, motivoCorreccion: resumen.motivoCorreccion,
          descripcion: g.categoria.nombre + (g.descripcion ? ` · ${g.descripcion}` : ''),
          documento: g.descripcion ?? g.categoria.nombre,
          registradoPor: null, usuarioId: g.usuarioId,
          detalle: {
            entidad: 'gasto', categoria: g.categoria.nombre, descripcion: g.descripcion,
            tipoPago: g.tipoPago, fecha: aFechaIso(g.fechaOperacion),
          },
        });
      }
    }

    // ── SALIDAS: pagos a proveedor ──
    if (traerPago) {
      const pagos = await tx.pagoProveedor.findMany({
        where: {
          tipo: 'normal',
          fechaPago: enRango,
          compra: {
            ...(filtros.sedeId ? { sedeId: filtros.sedeId } : {}),
            ...(filtros.proveedorId ? { proveedorId: filtros.proveedorId } : {}),
          },
        },
        take: TOPE_MOVIMIENTOS,
        select: {
          id: true, monto: true, fechaPago: true, creadoEn: true, usuarioId: true,
          compra: { select: { numeroFactura: true, proveedor: { select: { nombre: true } } } },
          correcciones: { select: { tipo: true, monto: true, motivo: true } },
        },
      });
      for (const p of pagos) {
        const original = Number(p.monto);
        const resumen = resumirCorreccion(original, p.correcciones as Asiento[]);
        acumulado.push({
          id: p.id, tipo: 'pago_proveedor', entidad: 'pago',
          fecha: aFechaIso(p.fechaPago), fechaCreacion: p.creadoEn.toISOString(),
          montoOriginal: original, montoVigente: resumen.montoVigente,
          direccion: 'salida', impactoNeto: -resumen.montoVigente,
          estado: resumen.estado, motivoCorreccion: resumen.motivoCorreccion,
          descripcion: `${p.compra.proveedor.nombre} · ${p.compra.numeroFactura}`,
          documento: p.compra.numeroFactura,
          registradoPor: null, usuarioId: p.usuarioId,
          detalle: { entidad: 'pago', proveedor: p.compra.proveedor.nombre, numeroFactura: p.compra.numeroFactura, fechaPago: aFechaIso(p.fechaPago) },
        });
      }
    }

    // Catálogos para los selectores (tenant-safe por RLS).
    const [sedes, proveedores, categorias, usuarios] = await Promise.all([
      tx.sede.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
      tx.proveedor.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
      tx.categoriaGasto.findMany({ select: { id: true, nombre: true }, orderBy: { nombre: 'asc' } }),
      tx.usuario.findMany({ where: { id: { in: [...new Set(acumulado.map((m) => m.usuarioId))] } }, select: { id: true, nombre: true } }),
    ]);
    return { movimientos: acumulado, sedes, proveedores, categorias, usuarios };
  });

  // Nombres de quien registró cada movimiento (ya cargados; sin N+1).
  const nombrePorUsuario = new Map(usuarios.map((u) => [u.id, u.nombre]));
  for (const m of movimientos) m.registradoPor = nombrePorUsuario.get(m.usuarioId) ?? null;

  // ── Filtros de aplicación: estado + texto ──
  const estadoFiltro = filtros.estado && filtros.estado !== 'todos' ? filtros.estado : null;
  const texto = (filtros.texto ?? '').trim().toLowerCase();
  const filtrados = movimientos.filter((m) => {
    if (estadoFiltro && m.estado !== estadoFiltro) return false;
    if (texto) {
      const campos = [m.descripcion, m.documento, m.motivoCorreccion, m.registradoPor];
      if (!campos.some((c) => c != null && c.toLowerCase().includes(texto))) return false;
    }
    return true;
  });

  // ── Resumen (sobre el conjunto COMPLETO filtrado) ──
  let ingresosCent = 0, gastosCent = 0, pagosCent = 0;
  let cantIngresos = 0, cantSalidas = 0, corregidos = 0, anulados = 0;
  let mayorEntrada = 0, mayorSalida = 0;
  const porMetodoCent: Record<string, number> = { efectivo: 0, tarjeta: 0, yappy: 0, loteria: 0 };
  const porMetodoCant: Record<string, number> = { efectivo: 0, tarjeta: 0, yappy: 0, loteria: 0 };
  // Por día: acumula entradas/salidas.
  const dias = new Map<string, { ingCent: number; gasCent: number; pagCent: number }>();

  for (const m of filtrados) {
    const vigCent = aCentimos(m.montoVigente);
    if (m.estado === 'corregido') corregidos += 1;
    if (m.estado === 'anulado') anulados += 1;
    const dia = dias.get(m.fecha) ?? { ingCent: 0, gasCent: 0, pagCent: 0 };
    if (m.tipo === 'ingreso') {
      ingresosCent += vigCent; cantIngresos += 1;
      if (m.montoVigente > mayorEntrada) mayorEntrada = m.montoVigente;
      dia.ingCent += vigCent;
      // Método de ingreso: del arqueo VIGENTE.
      if (m.detalle.entidad === 'venta') {
        for (const linea of m.detalle.arqueoVigente) {
          const tipo = linea.tipoArqueo as TipoArqueo;
          porMetodoCent[tipo] = (porMetodoCent[tipo] ?? 0) + aCentimos(linea.monto);
        }
        if (m.montoVigente > 0) {
          for (const linea of m.detalle.arqueoVigente) porMetodoCant[linea.tipoArqueo] = (porMetodoCant[linea.tipoArqueo] ?? 0) + 1;
        }
      }
    } else {
      cantSalidas += 1;
      if (m.montoVigente > mayorSalida) mayorSalida = m.montoVigente;
      if (m.tipo === 'gasto') { gastosCent += vigCent; dia.gasCent += vigCent; }
      else { pagosCent += vigCent; dia.pagCent += vigCent; }
    }
    dias.set(m.fecha, dia);
  }

  // porDia ordenado ascendente, con acumulado desde 0.
  const diasOrdenados = [...dias.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  let acumCent = 0;
  let diasPos = 0, diasNeg = 0;
  let diaMayorSalida: string | null = null; let maxSalidaDiaCent = -1;
  const porDia = diasOrdenados.map(([fecha, d]) => {
    const salidasCent = d.gasCent + d.pagCent;
    const netoCent = d.ingCent - salidasCent;
    acumCent += netoCent;
    if (netoCent > 0) diasPos += 1;
    if (netoCent < 0) diasNeg += 1;
    if (salidasCent > maxSalidaDiaCent) { maxSalidaDiaCent = salidasCent; diaMayorSalida = fecha; }
    return {
      fecha,
      ingresos: aMoneda(d.ingCent),
      gastos: aMoneda(d.gasCent),
      pagosProveedores: aMoneda(d.pagCent),
      salidas: aMoneda(salidasCent),
      flujoNeto: aMoneda(netoCent),
      acumuladoDesdeInicioPeriodo: aMoneda(acumCent),
    };
  });

  const salidasCent = gastosCent + pagosCent;
  const totalMetodoCent = Object.values(porMetodoCent).reduce((a, b) => a + b, 0);
  const porMetodoIngreso = (['efectivo', 'tarjeta', 'yappy', 'loteria'] as const).map((metodo) => ({
    metodo,
    monto: aMoneda(porMetodoCent[metodo] ?? 0),
    porcentaje: porcentaje(porMetodoCent[metodo] ?? 0, totalMetodoCent),
    registros: porMetodoCant[metodo] ?? 0,
  }));

  // ── Orden y página ──
  const ordenados = [...filtrados].sort((a, b) => {
    switch (orden) {
      case 'fecha_asc': return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : (a.fechaCreacion < b.fechaCreacion ? -1 : 1);
      case 'monto_desc': return b.montoVigente - a.montoVigente;
      case 'monto_asc': return a.montoVigente - b.montoVigente;
      case 'fecha_desc':
      default: return a.fecha > b.fecha ? -1 : a.fecha < b.fecha ? 1 : (a.fechaCreacion > b.fechaCreacion ? -1 : 1);
    }
  });
  const total = ordenados.length;
  const pagina1 = ordenados.slice((pagina - 1) * tamano, (pagina - 1) * tamano + tamano)
    .map(({ usuarioId: _u, ...resto }) => resto); // no exponer usuarioId crudo

  return {
    movimientos: pagina1,
    paginacion: { pagina, tamano, total, paginas: Math.max(1, Math.ceil(total / tamano)) },
    resumen: {
      totalIngresos: aMoneda(ingresosCent),
      totalGastos: aMoneda(gastosCent),
      totalPagosProveedores: aMoneda(pagosCent),
      totalSalidas: aMoneda(salidasCent),
      flujoNeto: aMoneda(ingresosCent - salidasCent),
      cantidadMovimientos: total,
      cantidadIngresos: cantIngresos,
      cantidadSalidas: cantSalidas,
      diasConFlujoPositivo: diasPos,
      diasConFlujoNegativo: diasNeg,
      mayorEntrada,
      mayorSalida,
      diaMayorSalida,
      movimientosCorregidos: corregidos,
      movimientosAnulados: anulados,
    },
    porMetodoIngreso,
    porDia,
    filtrosDisponibles: { sedes, proveedores, categorias, usuarios },
  };
}
