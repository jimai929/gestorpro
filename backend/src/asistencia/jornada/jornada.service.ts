import { prisma } from '../../core/prisma.js';
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

async function esDiaFestivo(fecha: Date): Promise<boolean> {
  return (await prisma.diaFestivo.findUnique({ where: { fecha } })) !== null;
}

/** Inserta o sobreescribe la jornada (recalculable) de un empleado en una fecha. */
async function guardarJornada(
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
    },
    calculadaEn: new Date(),
  };
  return prisma.jornada.upsert({
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
  const fichajes = await prisma.fichaje.findMany({
    where: { empleadoId, momento: { gte: inicioVentana, lte: momentoSalida } },
    orderBy: { momento: 'asc' },
  });

  const entrada = fichajes.find((f) => f.tipo === 'entrada');
  if (!entrada) return null; // salida sin entrada: la caza el job de huérfanos

  const delDia: FichajeCalculo[] = fichajes
    .filter((f) => f.momento >= entrada.momento)
    .map((f) => ({ tipo: f.tipo, momento: f.momento }));

  const empleado = await prisma.empleado.findUnique({
    where: { id: empleadoId },
    include: { turno: true },
  });
  if (!empleado) return null;

  const fecha = soloFecha(entrada.momento);
  const resultado = calcularJornada(delDia, {
    pausaPorDefectoMin: empleado.turno?.pausaPorDefectoMin ?? 0,
    salarioMensual: Number(empleado.salarioFijo),
    esFestivo: await esDiaFestivo(fecha),
  });
  return guardarJornada(empleadoId, fecha, resultado);
}

/**
 * Job nocturno de respaldo: marca como ANOMALÍA las entradas sin salida pasada
 * la ventana de 16h (fichajes huérfanos), para que el jefe las revise. Devuelve
 * cuántas marcó. Idempotente: no duplica si ya hay jornada para ese día.
 */
export async function barrerHuerfanos(ahora: Date = new Date()): Promise<number> {
  const limite = new Date(ahora.getTime() - VENTANA_MS);
  const entradas = await prisma.fichaje.findMany({
    where: { tipo: 'entrada', momento: { lt: limite } },
  });

  let marcadas = 0;
  for (const entrada of entradas) {
    const fin = new Date(entrada.momento.getTime() + VENTANA_MS);
    const salida = await prisma.fichaje.findFirst({
      where: {
        empleadoId: entrada.empleadoId,
        tipo: 'salida',
        momento: { gte: entrada.momento, lte: fin },
      },
    });
    if (salida) continue; // tiene salida: no es huérfano

    const fecha = soloFecha(entrada.momento);
    const existente = await prisma.jornada.findUnique({
      where: { empleadoId_fecha: { empleadoId: entrada.empleadoId, fecha } },
    });
    if (existente) continue; // ya hay jornada (calculada o marcada)

    await prisma.jornada.create({
      data: {
        empleadoId: entrada.empleadoId,
        fecha,
        anomalia: true,
        detalleAnomalia: 'Fichaje de entrada sin salida (huérfano).',
        estado: 'anomalia',
      },
    });
    marcadas++;
  }
  return marcadas;
}
