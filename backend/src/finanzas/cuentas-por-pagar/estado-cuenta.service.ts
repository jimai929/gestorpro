/**
 * Estado de cuenta de un proveedor (lectura, sin efectos).
 *
 * Deuda = compras a CRÉDITO (las de contado se pagan en el acto y no generan cuenta
 * por pagar: misma regla que la vista `cuenta_por_pagar` y el dashboard) menos los
 * pagos EFECTIVOS. El efecto real de cada pago sale de `resumirCorreccion()` — el
 * MISMO resumen que usan gastos, cierres y el historial de pagos: un pago corregido
 * descuenta solo su importe corregido y uno anulado no descuenta nada. Nunca se
 * descuentan a la vez el original y el corregido, y el registro original no se toca
 * (es inmutable).
 *
 * Los importes se suman en CÉNTIMOS (enteros): nada de coma flotante.
 */

import { txEmpresa, contextoTenantActual } from '../../core/tenant/contexto.js';
import { ErrorNoEncontrado, ErrorValidacion } from '../../core/errors.js';
import { resumirCorreccion } from '../../shared/services/correccion.estado.js';

/** Tipo de movimiento del estado de cuenta (lo consumen la UI y el CSV). */
export type TipoMovimientoEC = 'compra' | 'pago' | 'correccion_pago' | 'anulacion_pago';

export interface MovimientoEstadoCuenta {
  fecha: string; // YYYY-MM-DD
  tipo: TipoMovimientoEC;
  /** Documento identificable: el número de factura de la compra. */
  documento: string;
  concepto: string;
  /** Aumenta la deuda con el proveedor (una factura a crédito). */
  debito: number;
  /** Reduce la deuda (el importe EFECTIVO del pago: 0 si fue anulado). */
  credito: number;
  /** Saldo acumulado DESPUÉS de este movimiento. */
  saldo: number;
  compraId: string;
  pagoId: string | null;
  estado: 'vigente' | 'corregido' | 'anulado' | null;
  motivoCorreccion: string | null;
  registradoPor: string | null;
  creadoEn: string;
}

/** Céntimos ⇄ moneda: se suma en enteros para no arrastrar error de coma flotante. */
function aCentimos(n: number): number {
  return Math.round(n * 100);
}
function aMoneda(centimos: number): number {
  return centimos / 100;
}

/** Fecha de negocio (@db.Date) a YYYY-MM-DD. */
function aFechaIso(fecha: Date): string {
  return fecha.toISOString().slice(0, 10);
}

interface CompraEC {
  id: string;
  numeroFactura: string;
  montoTotal: unknown;
  tipo: string;
  fechaEmision: Date;
  creadoEn: Date;
}

interface PagoEC {
  id: string;
  compraId: string;
  monto: unknown;
  fechaPago: Date;
  usuarioId: string;
  creadoEn: Date;
  correcciones: Array<{ tipo: string; monto: unknown; motivo: string | null }>;
}

export interface FiltrosEstadoCuenta {
  proveedorId: string;
  desde: string;
  hasta: string;
}

export async function estadoCuentaProveedor(filtros: FiltrosEstadoCuenta) {
  const desde = new Date(filtros.desde);
  const hasta = new Date(filtros.hasta);
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) {
    throw new ErrorValidacion('Las fechas del estado de cuenta no son válidas.');
  }
  if (desde > hasta) {
    throw new ErrorValidacion('La fecha "desde" no puede ser posterior a "hasta".');
  }

  const datos = await txEmpresa(async (tx) => {
    // El proveedor se busca BAJO RLS: el de otra empresa sencillamente no existe aquí
    // (404, no 403: no se confirma su existencia a un tenant ajeno).
    const proveedor = await tx.proveedor.findUnique({
      where: { id: filtros.proveedorId },
      select: {
        id: true,
        nombre: true,
        identificacionFiscal: true,
        telefono: true,
        personaContacto: true,
      },
    });
    if (!proveedor) {
      throw new ErrorNoEncontrado('El proveedor no existe.');
    }

    // DOS consultas para todo (sin N+1). Se traen TODAS las compras y pagos del
    // proveedor —no solo los del período— porque el saldo inicial necesita los
    // anteriores; el recorte por fecha se hace al construir los movimientos.
    const compras = await tx.compra.findMany({
      where: { proveedorId: proveedor.id },
      select: {
        id: true,
        numeroFactura: true,
        montoTotal: true,
        tipo: true,
        fechaEmision: true,
        creadoEn: true,
      },
    });

    const pagos = await tx.pagoProveedor.findMany({
      where: { tipo: 'normal', compra: { proveedorId: proveedor.id } },
      select: {
        id: true,
        compraId: true,
        monto: true,
        fechaPago: true,
        usuarioId: true,
        creadoEn: true,
        correcciones: { select: { tipo: true, monto: true, motivo: true } },
      },
    });

    return {
      proveedor,
      compras: compras as unknown as CompraEC[],
      pagos: pagos as unknown as PagoEC[],
    };
  });

  const { proveedor, compras, pagos } = datos;

  // Nombre de quien registró cada pago: UNA consulta para todos los ids.
  const idsUsuario = [...new Set(pagos.map((p) => p.usuarioId))];
  const usuarios = idsUsuario.length
    ? await txEmpresa((tx) =>
        tx.usuario.findMany({
          where: { id: { in: idsUsuario } },
          select: { id: true, nombre: true },
        }),
      )
    : [];
  const nombrePorUsuario = new Map(usuarios.map((u) => [u.id, u.nombre]));

  // Cabecera del documento: nombre de la empresa del CONTEXTO (nunca del body).
  const { empresaId } = contextoTenantActual();
  const empresa = empresaId
    ? await txEmpresa((tx) =>
        tx.empresa.findUnique({ where: { id: empresaId }, select: { id: true, nombre: true } }),
      )
    : null;

  const compraPorId = new Map(compras.map((c) => [c.id, c]));
  const enPeriodo = (fecha: Date) => fecha >= desde && fecha <= hasta;

  let saldoInicialCentimos = 0;
  const previos: Array<Omit<MovimientoEstadoCuenta, 'saldo'> & { orden: number }> = [];

  // ── Compras: solo las de CRÉDITO generan deuda ──
  for (const compra of compras) {
    if (compra.tipo !== 'credito') continue;
    const debito = aCentimos(Number(compra.montoTotal));
    if (compra.fechaEmision < desde) {
      saldoInicialCentimos += debito; // deuda anterior al período
      continue;
    }
    if (!enPeriodo(compra.fechaEmision)) continue;
    previos.push({
      fecha: aFechaIso(compra.fechaEmision),
      tipo: 'compra',
      documento: compra.numeroFactura,
      concepto: 'Factura de compra a crédito',
      debito: aMoneda(debito),
      credito: 0,
      compraId: compra.id,
      pagoId: null,
      estado: null,
      motivoCorreccion: null,
      registradoPor: null,
      creadoEn: compra.creadoEn.toISOString(),
      orden: 0, // a igual fecha, la factura va antes que sus pagos
    });
  }

  // ── Pagos: el crédito efectivo es el monto VIGENTE (0 si se anuló) ──
  let anuladoCentimos = 0;
  for (const pago of pagos) {
    const compra = compraPorId.get(pago.compraId);
    // Un pago sobre una compra de CONTADO no reduce cuenta por pagar (no la generó).
    if (!compra || compra.tipo !== 'credito') continue;

    const montoOriginal = Number(pago.monto);
    const { estado, montoVigente, motivoCorreccion } = resumirCorreccion(
      montoOriginal,
      pago.correcciones as Array<{ tipo: string; monto: { toString(): string }; motivo?: string | null }>,
    );
    const creditoCentimos = aCentimos(montoVigente);

    if (pago.fechaPago < desde) {
      saldoInicialCentimos -= creditoCentimos; // pagos efectivos anteriores
      continue;
    }
    if (!enPeriodo(pago.fechaPago)) continue;

    anuladoCentimos += aCentimos(montoOriginal) - creditoCentimos;

    const tipo: TipoMovimientoEC =
      estado === 'anulado'
        ? 'anulacion_pago'
        : estado === 'corregido'
          ? 'correccion_pago'
          : 'pago';

    const registrado = `B/. ${montoOriginal.toFixed(2)}`;
    const concepto =
      estado === 'anulado'
        ? `Pago anulado (se registró ${registrado})`
        : estado === 'corregido'
          ? `Pago corregido (se registró ${registrado})`
          : 'Pago a proveedor';

    previos.push({
      fecha: aFechaIso(pago.fechaPago),
      tipo,
      documento: compra.numeroFactura,
      concepto,
      debito: 0,
      credito: aMoneda(creditoCentimos), // 0 si está anulado: el reverso lo cancela
      compraId: compra.id,
      pagoId: pago.id,
      estado,
      motivoCorreccion,
      registradoPor: nombrePorUsuario.get(pago.usuarioId) ?? null,
      creadoEn: pago.creadoEn.toISOString(),
      orden: 1,
    });
  }

  // Orden estable: fecha → (compra antes que pago) → creadoEn.
  previos.sort((a, b) => {
    if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1;
    if (a.orden !== b.orden) return a.orden - b.orden;
    return a.creadoEn < b.creadoEn ? -1 : a.creadoEn > b.creadoEn ? 1 : 0;
  });

  // ── Saldo corriente y totales del período ──
  let saldoCentimos = saldoInicialCentimos;
  let debitosCentimos = 0;
  let creditosCentimos = 0;
  const movimientos: MovimientoEstadoCuenta[] = previos.map((m) => {
    const debito = aCentimos(m.debito);
    const credito = aCentimos(m.credito);
    debitosCentimos += debito;
    creditosCentimos += credito;
    saldoCentimos += debito - credito;
    const { orden: _orden, ...resto } = m;
    return { ...resto, saldo: aMoneda(saldoCentimos) };
  });

  return {
    empresa,
    proveedor,
    periodo: { desde: filtros.desde, hasta: filtros.hasta },
    saldoInicial: aMoneda(saldoInicialCentimos),
    movimientos,
    resumen: {
      compras: aMoneda(debitosCentimos),
      pagos: aMoneda(creditosCentimos),
      /** Lo que las correcciones/anulaciones del período dejaron de pagar. */
      correccionesAnulaciones: aMoneda(anuladoCentimos),
      movimientos: movimientos.length,
    },
    // Identidad garantizada: saldoInicial + débitos − créditos.
    saldoFinal: aMoneda(saldoInicialCentimos + debitosCentimos - creditosCentimos),
  };
}
