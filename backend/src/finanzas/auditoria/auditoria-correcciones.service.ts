/**
 * Centro de auditoría de correcciones financieras (lectura, sin efectos).
 *
 * Unifica en UNA lista las correcciones (reverso + corrección) y anulaciones
 * (solo reverso) de las TRES entidades de dinero: gasto, cierre de caja (venta) y
 * pago a proveedor. No inventa un cuarto algoritmo de estado: la fuente es el
 * mismo par de asientos `corrigeId` que ya usan los listados, y el monto vigente
 * sale de `resumirCorreccion()`.
 *
 * Cada movimiento ORIGINAL (tipo='normal') admite a lo sumo UN reverso, así que un
 * original corregido es exactamente UN evento de auditoría:
 *   - reverso presente + corrección presente → acción `correccion` (cambió el monto).
 *   - reverso presente + sin corrección       → acción `anulacion` (quedó en 0).
 * El original es inmutable: aquí solo se lee.
 *
 * Los importes se comparan en CÉNTIMOS enteros (nada de coma flotante).
 */

import { txEmpresa } from '../../core/tenant/contexto.js';
import { ErrorValidacion } from '../../core/errors.js';
import { resumirCorreccion } from '../../shared/services/correccion.estado.js';

export type EntidadAuditoria = 'gasto' | 'venta' | 'pago';
export type AccionAuditoria = 'correccion' | 'anulacion';

/** Línea del arqueo (original y vigente) que se muestra en el detalle del cierre. */
interface LineaArqueoDetalle {
  tipoArqueo: string;
  monto: number;
}

/** Detalle específico por entidad (lo mínimo para la UI y el CSV). */
export type DetalleEntidad =
  | {
      entidad: 'gasto';
      categoria: string;
      descripcion: string | null;
      fecha: string;
      tipoPago: string | null;
    }
  | {
      entidad: 'venta';
      sede: string;
      cajera: string;
      turno: string;
      fecha: string;
      arqueoOriginal: LineaArqueoDetalle[];
      arqueoVigente: LineaArqueoDetalle[];
    }
  | {
      entidad: 'pago';
      proveedor: string;
      numeroFactura: string;
      montoFactura: number;
      fechaPago: string;
    };

export interface RegistroAuditoria {
  id: string; // id del reverso: identifica de forma única el evento de corrección
  entidad: EntidadAuditoria;
  accion: AccionAuditoria;
  registroOriginalId: string;
  reversoId: string;
  correccionId: string | null; // null cuando es una anulación
  fechaOriginal: string; // fecha de negocio del movimiento original
  fechaCorreccion: string; // instante en que se hizo la corrección (ISO)
  montoOriginal: number;
  montoVigente: number;
  diferencia: number; // montoOriginal − montoVigente
  motivo: string | null;
  registradoPor: { id: string; nombre: string | null };
  descripcion: string;
  documento: string;
  detalleEntidad: DetalleEntidad;
}

export interface FiltrosAuditoria {
  desde?: string;
  hasta?: string;
  entidad?: EntidadAuditoria | 'todas';
  accion?: AccionAuditoria | 'todas';
  usuarioId?: string;
  texto?: string;
  pagina?: number;
  tamano?: number;
}

const TAMANO_PAGINA_DEFECTO = 20;
// El máximo alto (no 100) permite que la EXPORTACIÓN a CSV pida el conjunto completo
// en una sola página. No implica más lectura: el material ya se trae entero a memoria
// (acotado por TOPE_EVENTOS_POR_ENTIDAD); `tamano` solo decide el tamaño del slice.
const TAMANO_PAGINA_MAXIMO = 2000;
/** Tope duro de eventos que se traen a memoria por entidad (no lectura ilimitada). */
const TOPE_EVENTOS_POR_ENTIDAD = 5000;

function aCentimos(n: number): number {
  return Math.round(n * 100);
}
function aMoneda(centimos: number): number {
  return centimos / 100;
}
function aFechaIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

/** Asiento colgado de un original (reverso o corrección). */
interface Asiento {
  id: string;
  tipo: string;
  monto: { toString(): string };
  motivo: string | null;
  usuarioId: string;
  creadoEn: Date;
}

/** Separa los asientos de un original en su reverso y su corrección (si la hay). */
function separarAsientos(correcciones: Asiento[]) {
  const reverso = correcciones.find((a) => a.tipo === 'reverso') ?? null;
  const correccion = correcciones.find((a) => a.tipo === 'correccion') ?? null;
  return { reverso, correccion };
}

export async function auditoriaCorrecciones(filtros: FiltrosAuditoria) {
  const pagina = Math.max(1, Math.trunc(filtros.pagina ?? 1));
  const tamano = Math.min(
    TAMANO_PAGINA_MAXIMO,
    Math.max(1, Math.trunc(filtros.tamano ?? TAMANO_PAGINA_DEFECTO)),
  );

  const desde = filtros.desde ? new Date(filtros.desde) : null;
  const hasta = filtros.hasta ? new Date(filtros.hasta) : null;
  if (desde && Number.isNaN(desde.getTime())) {
    throw new ErrorValidacion('La fecha "desde" no es válida.');
  }
  if (hasta && Number.isNaN(hasta.getTime())) {
    throw new ErrorValidacion('La fecha "hasta" no es válida.');
  }
  if (desde && hasta && desde > hasta) {
    throw new ErrorValidacion('La fecha "desde" no puede ser posterior a "hasta".');
  }

  const entidadFiltro = filtros.entidad && filtros.entidad !== 'todas' ? filtros.entidad : null;
  const accionFiltro = filtros.accion && filtros.accion !== 'todas' ? filtros.accion : null;

  // `where` de la relación `correcciones`: un reverso dentro del rango de fechas de
  // LA CORRECCIÓN (creadoEn del reverso). El filtro por USUARIO NO va aquí: se aplica
  // después, para poder devolver la lista COMPLETA de usuarios que corrigieron en el
  // rango (el selector de usuario no debe encogerse al elegir uno).
  const whereReverso = {
    tipo: 'reverso' as const,
    ...(desde || hasta
      ? {
          creadoEn: {
            ...(desde ? { gte: desde } : {}),
            // `hasta` es un día: incluir hasta el final de esa jornada.
            ...(hasta ? { lte: new Date(hasta.getTime() + 24 * 60 * 60 * 1000 - 1) } : {}),
          },
        }
      : {}),
  };

  const traer = entidadFiltro
    ? { gasto: entidadFiltro === 'gasto', venta: entidadFiltro === 'venta', pago: entidadFiltro === 'pago' }
    : { gasto: true, venta: true, pago: true };

  const registros = await txEmpresa(async (tx) => {
    const acumulado: RegistroAuditoria[] = [];

    // ── GASTO ──
    if (traer.gasto) {
      const gastos = await tx.gasto.findMany({
        where: { tipo: 'normal', correcciones: { some: whereReverso } },
        take: TOPE_EVENTOS_POR_ENTIDAD,
        select: {
          id: true,
          monto: true,
          fechaOperacion: true,
          descripcion: true,
          tipoPago: true,
          categoria: { select: { nombre: true } },
          correcciones: {
            select: { id: true, tipo: true, monto: true, motivo: true, usuarioId: true, creadoEn: true },
          },
        },
      });
      for (const g of gastos) {
        const { reverso, correccion } = separarAsientos(g.correcciones as Asiento[]);
        if (!reverso) continue;
        const montoOriginal = Number(g.monto);
        const resumen = resumirCorreccion(montoOriginal, g.correcciones as Asiento[]);
        acumulado.push({
          id: reverso.id,
          entidad: 'gasto',
          accion: correccion ? 'correccion' : 'anulacion',
          registroOriginalId: g.id,
          reversoId: reverso.id,
          correccionId: correccion?.id ?? null,
          fechaOriginal: aFechaIso(g.fechaOperacion),
          fechaCorreccion: reverso.creadoEn.toISOString(),
          montoOriginal,
          montoVigente: resumen.montoVigente,
          diferencia: aMoneda(aCentimos(montoOriginal) - aCentimos(resumen.montoVigente)),
          motivo: reverso.motivo,
          registradoPor: { id: reverso.usuarioId, nombre: null },
          descripcion: g.categoria.nombre + (g.descripcion ? ` · ${g.descripcion}` : ''),
          documento: g.descripcion ?? g.categoria.nombre,
          detalleEntidad: {
            entidad: 'gasto',
            categoria: g.categoria.nombre,
            descripcion: g.descripcion,
            fecha: aFechaIso(g.fechaOperacion),
            tipoPago: g.tipoPago,
          },
        });
      }
    }

    // ── VENTA (cierre de caja) ──
    if (traer.venta) {
      const ventas = await tx.ventaDiaria.findMany({
        where: { tipo: 'normal', correcciones: { some: whereReverso } },
        take: TOPE_EVENTOS_POR_ENTIDAD,
        select: {
          id: true,
          monto: true,
          fechaOperacion: true,
          turno: true,
          cajera: true,
          sede: { select: { nombre: true } },
          detalles: { select: { tipoArqueo: true, monto: true } },
          correcciones: {
            select: {
              id: true,
              tipo: true,
              monto: true,
              motivo: true,
              usuarioId: true,
              creadoEn: true,
              detalles: { select: { tipoArqueo: true, monto: true } },
            },
          },
        },
      });
      for (const v of ventas) {
        const { reverso, correccion } = separarAsientos(v.correcciones as Asiento[]);
        if (!reverso) continue;
        const montoOriginal = Number(v.monto);
        const resumen = resumirCorreccion(montoOriginal, v.correcciones as Asiento[]);
        const arqueoVigente =
          resumen.estado === 'corregido' && correccion
            ? (correccion as unknown as { detalles: Array<{ tipoArqueo: string; monto: unknown }> }).detalles.map(
                (d) => ({ tipoArqueo: d.tipoArqueo, monto: Number(d.monto) }),
              )
            : resumen.estado === 'anulado'
              ? []
              : v.detalles.map((d) => ({ tipoArqueo: d.tipoArqueo, monto: Number(d.monto) }));
        acumulado.push({
          id: reverso.id,
          entidad: 'venta',
          accion: correccion ? 'correccion' : 'anulacion',
          registroOriginalId: v.id,
          reversoId: reverso.id,
          correccionId: correccion?.id ?? null,
          fechaOriginal: aFechaIso(v.fechaOperacion),
          fechaCorreccion: reverso.creadoEn.toISOString(),
          montoOriginal,
          montoVigente: resumen.montoVigente,
          diferencia: aMoneda(aCentimos(montoOriginal) - aCentimos(resumen.montoVigente)),
          motivo: reverso.motivo,
          registradoPor: { id: reverso.usuarioId, nombre: null },
          descripcion: `${v.sede.nombre} · ${v.cajera}`,
          documento: `${aFechaIso(v.fechaOperacion)} ${v.turno}`,
          detalleEntidad: {
            entidad: 'venta',
            sede: v.sede.nombre,
            cajera: v.cajera,
            turno: v.turno,
            fecha: aFechaIso(v.fechaOperacion),
            arqueoOriginal: v.detalles.map((d) => ({ tipoArqueo: d.tipoArqueo, monto: Number(d.monto) })),
            arqueoVigente,
          },
        });
      }
    }

    // ── PAGO a proveedor ──
    if (traer.pago) {
      const pagos = await tx.pagoProveedor.findMany({
        where: { tipo: 'normal', correcciones: { some: whereReverso } },
        take: TOPE_EVENTOS_POR_ENTIDAD,
        select: {
          id: true,
          monto: true,
          fechaPago: true,
          compra: {
            select: {
              numeroFactura: true,
              montoTotal: true,
              proveedor: { select: { nombre: true } },
            },
          },
          correcciones: {
            select: { id: true, tipo: true, monto: true, motivo: true, usuarioId: true, creadoEn: true },
          },
        },
      });
      for (const p of pagos) {
        const { reverso, correccion } = separarAsientos(p.correcciones as Asiento[]);
        if (!reverso) continue;
        const montoOriginal = Number(p.monto);
        const resumen = resumirCorreccion(montoOriginal, p.correcciones as Asiento[]);
        acumulado.push({
          id: reverso.id,
          entidad: 'pago',
          accion: correccion ? 'correccion' : 'anulacion',
          registroOriginalId: p.id,
          reversoId: reverso.id,
          correccionId: correccion?.id ?? null,
          fechaOriginal: aFechaIso(p.fechaPago),
          fechaCorreccion: reverso.creadoEn.toISOString(),
          montoOriginal,
          montoVigente: resumen.montoVigente,
          diferencia: aMoneda(aCentimos(montoOriginal) - aCentimos(resumen.montoVigente)),
          motivo: reverso.motivo,
          registradoPor: { id: reverso.usuarioId, nombre: null },
          descripcion: `${p.compra.proveedor.nombre} · ${p.compra.numeroFactura}`,
          documento: p.compra.numeroFactura,
          detalleEntidad: {
            entidad: 'pago',
            proveedor: p.compra.proveedor.nombre,
            numeroFactura: p.compra.numeroFactura,
            montoFactura: Number(p.compra.montoTotal),
            fechaPago: aFechaIso(p.fechaPago),
          },
        });
      }
    }

    return acumulado;
  });

  // ── Resolución de nombres de usuario (UNA consulta, sin N+1) ──
  const idsUsuario = [...new Set(registros.map((r) => r.registradoPor.id))];
  const usuarios = idsUsuario.length
    ? await txEmpresa((tx) =>
        tx.usuario.findMany({ where: { id: { in: idsUsuario } }, select: { id: true, nombre: true } }),
      )
    : [];
  const nombrePorUsuario = new Map(usuarios.map((u) => [u.id, u.nombre]));
  for (const r of registros) {
    r.registradoPor.nombre = nombrePorUsuario.get(r.registradoPor.id) ?? null;
  }

  // Usuarios que corrigieron en el rango (opciones del selector). Se calcula ANTES
  // del filtro por usuario para que elegir uno no vacíe la lista.
  const usuariosDisponibles = [...new Set(registros.map((r) => r.registradoPor.id))]
    .map((id) => ({ id, nombre: nombrePorUsuario.get(id) ?? null }))
    .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? ''));

  // ── Filtros de aplicación: usuario + acción + texto libre ──
  const texto = (filtros.texto ?? '').trim().toLowerCase();
  const coincideTexto = (r: RegistroAuditoria): boolean => {
    if (!texto) return true;
    // Incluye el id del registro original para poder llegar por deep-link desde las
    // pantallas de gasto / dashboard / historial de pagos (?registroId=...).
    const campos = [r.motivo, r.descripcion, r.documento, r.registradoPor.nombre, r.registroOriginalId];
    return campos.some((c) => c != null && c.toLowerCase().includes(texto));
  };
  const filtrados = registros.filter(
    (r) =>
      (!filtros.usuarioId || r.registradoPor.id === filtros.usuarioId) &&
      (!accionFiltro || r.accion === accionFiltro) &&
      coincideTexto(r),
  );

  // Orden: por fecha de corrección descendente; a igualdad, por id (estable).
  filtrados.sort((a, b) => {
    if (a.fechaCorreccion !== b.fechaCorreccion) {
      return a.fechaCorreccion < b.fechaCorreccion ? 1 : -1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // ── Resumen sobre TODO el conjunto filtrado (no la página) ──
  let totalOriginalCent = 0;
  let totalVigenteCent = 0;
  const usuariosDistintos = new Set<string>();
  let correcciones = 0;
  let anulaciones = 0;
  const porEntidad: Record<EntidadAuditoria, number> = { gasto: 0, venta: 0, pago: 0 };
  for (const r of filtrados) {
    totalOriginalCent += aCentimos(r.montoOriginal);
    totalVigenteCent += aCentimos(r.montoVigente);
    usuariosDistintos.add(r.registradoPor.id);
    if (r.accion === 'correccion') correcciones += 1;
    else anulaciones += 1;
    porEntidad[r.entidad] += 1;
  }

  const total = filtrados.length;
  const pagados = filtrados.slice((pagina - 1) * tamano, (pagina - 1) * tamano + tamano);

  return {
    registros: pagados,
    usuariosDisponibles,
    paginacion: {
      pagina,
      tamano,
      total,
      paginas: Math.max(1, Math.ceil(total / tamano)),
    },
    resumen: {
      total,
      correcciones,
      anulaciones,
      gastos: porEntidad.gasto,
      ventas: porEntidad.venta,
      pagos: porEntidad.pago,
      usuarios: usuariosDistintos.size,
      totalOriginal: aMoneda(totalOriginalCent),
      totalVigente: aMoneda(totalVigenteCent),
      // Diferencia neta = original − vigente (lo que las correcciones quitaron; negativo
      // si el importe correcto era mayor). NO se etiqueta como "pérdida" ni "ganancia".
      diferenciaNeta: aMoneda(totalOriginalCent - totalVigenteCent),
    },
  };
}
