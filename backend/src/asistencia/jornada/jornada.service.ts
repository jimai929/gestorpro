import { prisma, type ClienteTx } from '../../core/prisma.js';
import { txEmpresa } from '../../core/tenant/contexto.js';
import { ErrorNoEncontrado, ErrorValidacion } from '../../core/errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { acreditarSaldo } from '../cobro/saldo.service.js';
import {
  calcularJornada,
  type FichajeCalculo,
  type ResultadoJornada,
} from './calculo.js';

/** Ventana para emparejar entrada y salida (turnos que cruzan medianoche). */
const VENTANA_MS = 16 * 60 * 60 * 1000;

/** Normaliza un instante a su fecha (UTC, medianoche) para la clave de jornada. */
function soloFecha(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

const UN_DIA_MS = 86_400_000;

/** Lunes (UTC, medianoche) de la semana de una fecha-jornada ya normalizada. */
function lunesDeLaSemana(fecha: Date): Date {
  const dia = fecha.getUTCDay(); // 0=domingo … 6=sábado
  const desdeLunes = (dia + 6) % 7; // días transcurridos desde el lunes
  return new Date(fecha.getTime() - desdeLunes * UN_DIA_MS);
}

/**
 * Suma los minutos extra PAGABLES ya registrados esta semana ANTES de `fecha`
 * para un empleado (días lunes..fecha exclusive). Lee el detalle de cada jornada
 * (`recargosDetalle.minutosExtraPagables`). Base del tope semanal de 9h.
 */
async function extraPagablesSemanaPrevios(
  tx: ClienteTx,
  empleadoId: string,
  fecha: Date,
): Promise<number> {
  const lunes = lunesDeLaSemana(fecha);
  const jornadas = await tx.jornada.findMany({
    where: { empleadoId, fecha: { gte: lunes, lt: fecha } },
    select: { recargosDetalle: true },
  });
  return jornadas.reduce((suma, j) => {
    const detalle = j.recargosDetalle as { minutosExtraPagables?: number } | null;
    return suma + (detalle?.minutosExtraPagables ?? 0);
  }, 0);
}

async function esDiaFestivo(tx: ClienteTx, fecha: Date): Promise<boolean> {
  return (await tx.diaFestivo.findUnique({ where: { fecha } })) !== null;
}

/** Inserta o sobreescribe la jornada (recalculable) de un empleado, dentro de tx. */
async function guardarJornada(
  tx: ClienteTx,
  empleadoId: string,
  fecha: Date,
  r: ResultadoJornada,
) {
  const datos = {
    minutosPresencia: r.minutosPresencia,
    minutosPausa: r.minutosPausa,
    minutosTrabajados: r.minutosTrabajados,
    minutosOrdinarios: r.minutosOrdinarios,
    minutosExtra: r.minutosExtra,
    clasificacion: r.clasificacion,
    montoExtra: r.montoExtra,
    esFestivo: r.esFestivo,
    anomalia: r.anomalia,
    detalleAnomalia: r.detalleAnomalia,
    estado: r.anomalia ? 'anomalia' : 'calculada',
    recargosDetalle: {
      recargo: r.recargo,
      minutosExtraPagables: r.minutosExtraPagables,
      topeDiaExcedido: r.topeDiaExcedido,
      topeSemanaExcedido: r.topeSemanaExcedido,
    },
    calculadaEn: new Date(),
  };
  return tx.jornada.upsert({
    where: { empleadoId_fecha: { empleadoId, fecha } },
    update: datos,
    create: { empleadoId, fecha, ...datos },
  });
}

/**
 * Recalcula la jornada del día que cierra un fichaje de salida. Empareja los
 * fichajes desde la entrada (dentro de la ventana de 16h) hasta la salida, llama
 * al motor con el turno y salario del empleado, y guarda la jornada (la fecha es
 * la de la entrada, para atar turnos que cruzan medianoche).
 */
export async function recalcularJornadaPorSalida(
  empleadoId: string,
  momentoSalida: Date,
) {
  const inicioVentana = new Date(momentoSalida.getTime() - VENTANA_MS);
  // Bajo RLS, las lecturas previas y el cierre van en la MISMA txEmpresa: comparten
  // el GUC de tenant (si no, las lecturas darían 0 filas) y son atómicas (si una
  // falla, no queda la jornada cerrada con el saldo mal). Una jornada recalculable
  // acredita el DELTA respecto a su monto previo.
  return txEmpresa(async (tx) => {
    const fichajes = await tx.fichaje.findMany({
      where: { empleadoId, momento: { gte: inicioVentana, lte: momentoSalida } },
      orderBy: { momento: 'asc' },
    });

    const entrada = fichajes.find((f) => f.tipo === 'entrada');
    if (!entrada) return null; // salida sin entrada: la caza el job de huérfanos

    const delDia: FichajeCalculo[] = fichajes
      .filter((f) => f.momento >= entrada.momento)
      .map((f) => ({ tipo: f.tipo, momento: f.momento }));

    const empleado = await tx.empleado.findUnique({
      where: { id: empleadoId },
      include: { turno: true },
    });
    if (!empleado) return null;

    const fecha = soloFecha(entrada.momento);
    const resultado = calcularJornada(delDia, {
      pausaPorDefectoMin: empleado.turno?.pausaPorDefectoMin ?? 0,
      salarioMensual: Number(empleado.salarioFijo),
      esFestivo: await esDiaFestivo(tx, fecha),
      minutosExtraPagablesSemanaPrevios: await extraPagablesSemanaPrevios(tx, empleadoId, fecha),
    });

    const previa = await tx.jornada.findUnique({
      where: { empleadoId_fecha: { empleadoId, fecha } },
      select: { montoExtra: true },
    });
    const montoPrevio = previa ? Number(previa.montoExtra) : 0;
    const jornada = await guardarJornada(tx, empleadoId, fecha, resultado);
    await acreditarSaldo(tx, empleadoId, resultado.montoExtra - montoPrevio);
    return jornada;
  });
}

/**
 * Lista jornadas (consulta de horas) del tenant en contexto, bajo RLS. Filtros
 * opcionales por empleado y rango de fechas. Lo consume GET /jornadas.
 */
export function listarJornadas(filtros: {
  empleadoId?: string;
  desde?: string;
  hasta?: string;
}) {
  return txEmpresa((tx) =>
    tx.jornada.findMany({
      where: {
        ...(filtros.empleadoId ? { empleadoId: filtros.empleadoId } : {}),
        ...(filtros.desde || filtros.hasta
          ? {
              fecha: {
                ...(filtros.desde ? { gte: new Date(filtros.desde) } : {}),
                ...(filtros.hasta ? { lte: new Date(filtros.hasta) } : {}),
              },
            }
          : {}),
      },
      orderBy: { fecha: 'desc' },
      include: { empleado: { select: { numero: true, nombre: true } } },
    }),
  );
}

/**
 * Job nocturno de respaldo: marca como ANOMALÍA las entradas sin salida pasada
 * la ventana de 16h (fichajes huérfanos), para que el jefe las revise. Devuelve
 * cuántas marcó. Idempotente: no duplica si ya hay jornada para ese día.
 */
export async function barrerHuerfanos(ahora: Date = new Date()): Promise<number> {
  const limite = new Date(ahora.getTime() - VENTANA_MS);

  // Job de PLATAFORMA, no de request: corre fuera de RLS de tenant. Itera las
  // empresas activas (empresa está EXCLUIDA de RLS → legible sin GUC) y procesa
  // cada una dentro de su PROPIA txEmpresa: el GUC fija el tenant, así RLS acota
  // fichaje/jornada a esa empresa. Antes barría TODAS las sedes sin contexto;
  // bajo RLS eso daría 0 filas y reportaría marcadas:0 en silencio (corrección B2).
  const empresas = await prisma.empresa.findMany({
    where: { activo: true },
    select: { id: true },
  });

  let marcadas = 0;
  for (const { id: empresaId } of empresas) {
    marcadas += await txEmpresa(
      async (tx) => {
        const entradas = await tx.fichaje.findMany({
          where: { tipo: 'entrada', momento: { lt: limite } },
        });

        let n = 0;
        for (const entrada of entradas) {
          const fin = new Date(entrada.momento.getTime() + VENTANA_MS);
          const salida = await tx.fichaje.findFirst({
            where: {
              empleadoId: entrada.empleadoId,
              tipo: 'salida',
              momento: { gte: entrada.momento, lte: fin },
            },
          });
          if (salida) continue; // tiene salida: no es huérfano

          const fecha = soloFecha(entrada.momento);
          const existente = await tx.jornada.findUnique({
            where: { empleadoId_fecha: { empleadoId: entrada.empleadoId, fecha } },
          });
          if (existente) continue; // ya hay jornada (calculada o marcada)

          await tx.jornada.create({
            data: {
              empleadoId: entrada.empleadoId,
              fecha,
              anomalia: true,
              detalleAnomalia: 'Fichaje de entrada sin salida (huérfano).',
              estado: 'anomalia',
            },
          });
          n++;
        }
        return n;
      },
      { empresaId },
    );
  }
  return marcadas;
}

/**
 * Corrección manual de una jornada por el jefe. Registra una `Correccion`
 * INMUTABLE (valor anterior y nuevo + motivo) y sobreescribe la jornada con los
 * ajustes, marcándola como 'corregida'. Puede resolver una anomalía. Todo en una
 * transacción: la corrección y la jornada quedan consistentes.
 */
export async function corregirJornada(datos: {
  jornadaId: string;
  jefeId: string;
  motivo: string;
  minutosTrabajados?: number;
  minutosExtra?: number;
  montoExtra?: number;
  resolverAnomalia?: boolean;
}) {
  if (!datos.motivo || datos.motivo.trim().length === 0) {
    throw new ErrorValidacion('El motivo de la corrección es obligatorio.');
  }

  return txEmpresa(async (tx) => {
    const jornada = await tx.jornada.findUnique({ where: { id: datos.jornadaId } });
    if (!jornada) {
      throw new ErrorNoEncontrado('La jornada no existe.');
    }

    const anterior: Record<string, unknown> = {};
    const nuevo: Record<string, unknown> = {};
    if (datos.minutosTrabajados !== undefined) {
      anterior.minutosTrabajados = jornada.minutosTrabajados;
      nuevo.minutosTrabajados = datos.minutosTrabajados;
    }
    if (datos.minutosExtra !== undefined) {
      anterior.minutosExtra = jornada.minutosExtra;
      nuevo.minutosExtra = datos.minutosExtra;
    }
    if (datos.montoExtra !== undefined) {
      anterior.montoExtra = Number(jornada.montoExtra);
      nuevo.montoExtra = datos.montoExtra;
    }
    if (datos.resolverAnomalia) {
      anterior.anomalia = jornada.anomalia;
      nuevo.anomalia = false;
    }

    await tx.correccion.create({
      data: {
        jornadaId: jornada.id,
        usuarioId: datos.jefeId,
        valorAnterior: anterior as Prisma.InputJsonValue,
        valorNuevo: nuevo as Prisma.InputJsonValue,
        motivo: datos.motivo,
      },
    });

    const actualizada = await tx.jornada.update({
      where: { id: jornada.id },
      data: {
        estado: 'corregida',
        ...(datos.minutosTrabajados !== undefined
          ? { minutosTrabajados: datos.minutosTrabajados }
          : {}),
        ...(datos.minutosExtra !== undefined ? { minutosExtra: datos.minutosExtra } : {}),
        ...(datos.montoExtra !== undefined ? { montoExtra: datos.montoExtra } : {}),
        ...(datos.resolverAnomalia ? { anomalia: false, detalleAnomalia: null } : {}),
      },
      // Misma forma que GET /jornadas (incluye empleado) para que el frontend
      // pueda actualizar la fila con la respuesta sin romperse.
      include: { empleado: { select: { numero: true, nombre: true } } },
    });

    // Si la corrección cambió el monto extra, ajustar el saldo por el delta
    // (misma transacción, vía el servicio único de saldo).
    if (datos.montoExtra !== undefined) {
      await acreditarSaldo(tx, jornada.empleadoId, datos.montoExtra - Number(jornada.montoExtra));
    }

    return actualizada;
  });
}

/**
 * Alta MANUAL de una jornada por el jefe, para días SIN fichajes (p. ej. la
 * sede perdió conexión y nadie pudo fichar): no hay jornada que corregir porque
 * nunca llegó a crearse. Crea la jornada con los minutos/monto que indique el
 * jefe y deja una `Correccion` INMUTABLE como rastro (`valorAnterior` marca que
 * no existía jornada previa). Falla si ya hay jornada para ese día —para eso
 * está la corrección— y acredita el monto extra al saldo en la misma tx.
 */
export async function crearJornadaManual(datos: {
  empleadoId: string;
  fecha: string;
  jefeId: string;
  motivo: string;
  minutosTrabajados?: number;
  minutosExtra?: number;
  montoExtra?: number;
}) {
  if (!datos.motivo || datos.motivo.trim().length === 0) {
    throw new ErrorValidacion('El motivo es obligatorio.');
  }
  const instante = new Date(datos.fecha);
  if (Number.isNaN(instante.getTime())) {
    throw new ErrorValidacion('La fecha es inválida.');
  }
  const fecha = soloFecha(instante);
  if (fecha.getTime() > soloFecha(new Date()).getTime()) {
    throw new ErrorValidacion('No se puede registrar una jornada en una fecha futura.');
  }

  const minutosTrabajados = datos.minutosTrabajados ?? 0;
  const minutosExtra = datos.minutosExtra ?? 0;
  const montoExtra = datos.montoExtra ?? 0;

  return txEmpresa(async (tx) => {
    const empleado = await tx.empleado.findUnique({ where: { id: datos.empleadoId } });
    if (!empleado) {
      throw new ErrorNoEncontrado('El empleado no existe.');
    }

    const existente = await tx.jornada.findUnique({
      where: { empleadoId_fecha: { empleadoId: datos.empleadoId, fecha } },
    });
    if (existente) {
      throw new ErrorValidacion(
        'Ya existe una jornada para ese empleado y fecha; use la corrección.',
      );
    }

    const jornada = await tx.jornada.create({
      data: {
        empleadoId: datos.empleadoId,
        fecha,
        minutosTrabajados,
        minutosExtra,
        montoExtra,
        // Creada a mano por el jefe: es una intervención humana, como la corrección.
        estado: 'corregida',
      },
      include: { empleado: { select: { numero: true, nombre: true } } },
    });

    await tx.correccion.create({
      data: {
        jornadaId: jornada.id,
        usuarioId: datos.jefeId,
        valorAnterior: { existia: false } as Prisma.InputJsonValue,
        valorNuevo: { minutosTrabajados, minutosExtra, montoExtra } as Prisma.InputJsonValue,
        motivo: datos.motivo,
      },
    });

    // No había jornada previa: se acredita el monto extra completo.
    if (montoExtra !== 0) {
      await acreditarSaldo(tx, datos.empleadoId, montoExtra);
    }

    return jornada;
  });
}
