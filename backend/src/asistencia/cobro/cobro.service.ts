import { prisma } from '../../core/prisma.js';
import { ErrorNoEncontrado, ErrorValidacion } from '../../core/errors.js';
import type { EstadoSolicitudCobro } from '../../generated/prisma/enums.js';
import { debitarSaldo } from './saldo.service.js';

/**
 * Configuración única del cobro. Si aún no existe ninguna fila, se crea con los
 * valores por defecto del schema (80% cobrable, umbral B/. 100), de modo que la
 * lectura nunca devuelve null.
 */
export async function obtenerConfiguracionCobro() {
  const existente = await prisma.configuracionCobro.findFirst();
  if (existente) return existente;
  return prisma.configuracionCobro.create({ data: {} });
}

/**
 * Define (actualiza) la configuración única del cobro. Valida el porcentaje
 * (0–100) y el umbral (no negativo) antes de tocar la base; la app mantiene una
 * sola fila.
 */
export async function definirConfiguracionCobro(datos: {
  porcentajeCobrable?: number;
  umbralAprobacion?: number;
}) {
  if (
    datos.porcentajeCobrable !== undefined &&
    (datos.porcentajeCobrable < 0 || datos.porcentajeCobrable > 100)
  ) {
    throw new ErrorValidacion('El porcentaje cobrable debe estar entre 0 y 100.');
  }
  if (datos.umbralAprobacion !== undefined && datos.umbralAprobacion < 0) {
    throw new ErrorValidacion('El umbral de aprobación no puede ser negativo.');
  }

  const data = {
    ...(datos.porcentajeCobrable !== undefined
      ? { porcentajeCobrable: datos.porcentajeCobrable }
      : {}),
    ...(datos.umbralAprobacion !== undefined
      ? { umbralAprobacion: datos.umbralAprobacion }
      : {}),
  };

  const actual = await prisma.configuracionCobro.findFirst();
  if (actual) {
    return prisma.configuracionCobro.update({ where: { id: actual.id }, data });
  }
  return prisma.configuracionCobro.create({ data });
}

// ─── Solicitud y aprobación de cobro (Modelo B) ─────────────────────────────

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Solicita un cobro anticipado contra el saldo. Aplica el **% cobrable** sobre
 * el saldo (lo adelantable), descuenta lo ya comprometido en solicitudes
 * pendientes, y **rechaza al CREAR** si el monto excede lo disponible. Modelo B:
 * bajo el umbral nace 'aprobada' (directo, debita ya); sobre el umbral nace
 * 'pendiente' (espera al jefe, debita al aprobar). Todo en una transacción.
 */
export async function solicitarCobro(datos: { empleadoId: string; monto: number }) {
  if (datos.monto <= 0) {
    throw new ErrorValidacion('El monto solicitado debe ser mayor que cero.');
  }

  return prisma.$transaction(async (tx) => {
    const saldoFila = await tx.saldoHorasExtra.findUnique({
      where: { empleadoId: datos.empleadoId },
    });
    const saldo = saldoFila ? Number(saldoFila.saldo) : 0;

    const cfg = await tx.configuracionCobro.findFirst();
    const porcentaje = cfg?.porcentajeCobrable ?? 80;
    const umbral = cfg ? Number(cfg.umbralAprobacion) : 100;

    const pendientes = await tx.solicitudCobro.aggregate({
      _sum: { monto: true },
      where: { empleadoId: datos.empleadoId, estado: 'pendiente' },
    });
    const comprometido = Number(pendientes._sum.monto ?? 0);

    // % cobrable sobre el saldo, menos lo ya comprometido en pendientes.
    const disponible = redondear((saldo * porcentaje) / 100 - comprometido);
    if (datos.monto > disponible) {
      throw new ErrorValidacion(
        `El monto solicitado (B/. ${datos.monto.toFixed(2)}) excede tu monto adelantable disponible ` +
          `(B/. ${Math.max(0, disponible).toFixed(2)}; ${porcentaje}% del saldo, menos lo ya solicitado).`,
      );
    }

    const directo = datos.monto <= umbral;
    if (directo) {
      // Cobro directo: se aprueba y debita el saldo de inmediato.
      await debitarSaldo(tx, datos.empleadoId, datos.monto);
    }

    return tx.solicitudCobro.create({
      data: {
        empleadoId: datos.empleadoId,
        monto: datos.monto,
        estado: directo ? 'aprobada' : 'pendiente',
        ...(directo ? { resueltoEn: new Date() } : {}),
      },
    });
  });
}

/** El jefe aprueba un cobro pendiente: debita el saldo (FOR UPDATE) y lo marca 'aprobada'. */
export async function aprobarCobro(solicitudId: string, jefeId: string) {
  return prisma.$transaction(async (tx) => {
    const sol = await tx.solicitudCobro.findUnique({ where: { id: solicitudId } });
    if (!sol) {
      throw new ErrorNoEncontrado('La solicitud de cobro no existe.');
    }
    if (sol.estado !== 'pendiente') {
      throw new ErrorValidacion('Solo se puede aprobar una solicitud pendiente.');
    }
    await debitarSaldo(tx, sol.empleadoId, Number(sol.monto));
    return tx.solicitudCobro.update({
      where: { id: solicitudId },
      data: { estado: 'aprobada', aprobadoPorId: jefeId, resueltoEn: new Date() },
    });
  });
}

/** El jefe rechaza un cobro pendiente (no debita el saldo). */
export async function rechazarCobro(solicitudId: string, jefeId: string, motivo?: string) {
  const sol = await prisma.solicitudCobro.findUnique({ where: { id: solicitudId } });
  if (!sol) {
    throw new ErrorNoEncontrado('La solicitud de cobro no existe.');
  }
  if (sol.estado !== 'pendiente') {
    throw new ErrorValidacion('Solo se puede rechazar una solicitud pendiente.');
  }
  return prisma.solicitudCobro.update({
    where: { id: solicitudId },
    data: {
      estado: 'rechazada',
      aprobadoPorId: jefeId,
      motivoRechazo: motivo ?? null,
      resueltoEn: new Date(),
    },
  });
}

/** Lista solicitudes de cobro, opcionalmente por empleado y/o estado. */
export function listarCobros(filtros: {
  empleadoId?: string;
  estado?: EstadoSolicitudCobro;
}) {
  return prisma.solicitudCobro.findMany({
    where: {
      ...(filtros.empleadoId ? { empleadoId: filtros.empleadoId } : {}),
      ...(filtros.estado ? { estado: filtros.estado } : {}),
    },
    orderBy: { creadoEn: 'desc' },
    include: { empleado: { select: { numero: true, nombre: true } } },
  });
}
