import {
  JORNADA_LEGAL_MIN,
  TOPES_EXTRA_MIN,
  minutosNocturnos,
  recargoExtra,
  valorHora,
  type Clasificacion,
} from './legal.js';

export type TipoFichaje =
  | 'entrada'
  | 'salida_comida'
  | 'entrada_comida'
  | 'salida';

export interface FichajeCalculo {
  tipo: TipoFichaje;
  momento: Date;
}

export interface OpcionesCalculo {
  /** Red de seguridad: pausa a descontar si NO hay fichajes de comida. */
  pausaPorDefectoMin?: number;
  esFestivo?: boolean;
  /** Salario mensual del empleado; necesario para el monto en dinero de las extras. */
  salarioMensual?: number;
  /**
   * Minutos extra PAGABLES ya acumulados esta semana ANTES de este día (suma de
   * los días previos de la misma semana). Sirve para aplicar el tope semanal de
   * 9h. Por defecto 0 (día aislado).
   */
  minutosExtraPagablesSemanaPrevios?: number;
}

export interface ResultadoJornada {
  minutosPresencia: number;
  minutosPausa: number;
  minutosTrabajados: number;
  minutosOrdinarios: number;
  minutosExtra: number;
  /** Minutos extra pagables tras aplicar el tope diario (3h). */
  minutosExtraPagables: number;
  clasificacion: Clasificacion;
  /** Recargo aplicado a la extra (0.25/0.50/0.75/1.50). */
  recargo: number;
  /** Monto en dinero de las extras (con recargo). 0 si no se pasó salario. */
  montoExtra: number;
  /** true si la extra superó el tope diario de 3h (marca para revisión). */
  topeDiaExcedido: boolean;
  /** true si la extra pagable acumulada en la semana superó el tope de 9h. */
  topeSemanaExcedido: boolean;
  esFestivo: boolean;
  anomalia: boolean;
  detalleAnomalia: string | null;
}

const VACIO = {
  minutosPresencia: 0,
  minutosPausa: 0,
  minutosTrabajados: 0,
  minutosOrdinarios: 0,
  minutosExtra: 0,
  minutosExtraPagables: 0,
  clasificacion: 'diurna' as Clasificacion,
  recargo: 0,
  montoExtra: 0,
  topeDiaExcedido: false,
  topeSemanaExcedido: false,
};

function anomalia(detalle: string, esFestivo: boolean): ResultadoJornada {
  return { ...VACIO, esFestivo, anomalia: true, detalleAnomalia: detalle };
}

function minutos(desde: Date, hasta: Date): number {
  return Math.round((hasta.getTime() - desde.getTime()) / 60000);
}

/**
 * Calcula la jornada de un empleado a partir de sus fichajes del día. Empareja
 * los cuatro fichajes (entrada, salida_comida, entrada_comida, salida), mide la
 * pausa de comida y deriva presencia, horas trabajadas, clasificación
 * (diurna/nocturna/mixta) y el reparto ordinarias/extra contra la jornada legal.
 *
 * La pausa es MEDIDA (diferencia entre los fichajes de comida). Si faltan AMBOS
 * fichajes de comida se usa `pausaPorDefectoMin` (red de seguridad). Si falta
 * solo uno, o hay duplicados, o el orden es incorrecto → ANOMALÍA para el jefe
 * (no se inventa la pausa). Los recargos y topes son responsabilidad de la capa
 * superior (5.3); aquí está el cálculo base.
 */
export function calcularJornada(
  fichajes: FichajeCalculo[],
  opciones: OpcionesCalculo = {},
): ResultadoJornada {
  const esFestivo = opciones.esFestivo ?? false;

  const de = (tipo: TipoFichaje) => fichajes.filter((f) => f.tipo === tipo);
  const entradas = de('entrada');
  const salidas = de('salida');
  const salidasComida = de('salida_comida');
  const entradasComida = de('entrada_comida');

  if (entradas.length !== 1 || salidas.length !== 1) {
    return anomalia('Falta el fichaje de entrada o de salida, o está duplicado.', esFestivo);
  }
  if (salidasComida.length > 1 || entradasComida.length > 1) {
    return anomalia('Fichajes de comida duplicados.', esFestivo);
  }

  const entrada = entradas[0]!.momento;
  const salida = salidas[0]!.momento;
  const presencia = minutos(entrada, salida);
  if (presencia <= 0) {
    return anomalia('La salida no es posterior a la entrada.', esFestivo);
  }

  // Pausa de comida: medida si están los dos fichajes; red de seguridad si no
  // hay ninguno; anomalía si falta uno solo.
  let pausa = 0;
  let inicioPausa: Date | null = null;
  let finPausa: Date | null = null;

  const haySalidaComida = salidasComida.length === 1;
  const hayEntradaComida = entradasComida.length === 1;

  if (haySalidaComida && hayEntradaComida) {
    inicioPausa = salidasComida[0]!.momento;
    finPausa = entradasComida[0]!.momento;
    pausa = minutos(inicioPausa, finPausa);
    const enOrden =
      entrada <= inicioPausa && inicioPausa <= finPausa && finPausa <= salida;
    if (!enOrden || pausa < 0) {
      return anomalia('Los fichajes de comida están en desorden.', esFestivo);
    }
  } else if (haySalidaComida !== hayEntradaComida) {
    return anomalia(
      'Fichajes de comida incompletos (falta la salida o la vuelta de comida).',
      esFestivo,
    );
  } else {
    // Sin fichajes de comida: se descuenta la pausa por defecto del turno.
    pausa = opciones.pausaPorDefectoMin ?? 0;
  }

  const trabajados = Math.max(0, presencia - pausa);

  // Clasificación según los minutos trabajados que caen en franja nocturna.
  let nocturnos = minutosNocturnos(entrada, salida);
  if (inicioPausa && finPausa) {
    nocturnos -= minutosNocturnos(inicioPausa, finPausa);
  }
  nocturnos = Math.max(0, Math.min(nocturnos, trabajados));

  let clasificacion: Clasificacion;
  if (nocturnos <= 0) clasificacion = 'diurna';
  else if (nocturnos >= trabajados) clasificacion = 'nocturna';
  else clasificacion = 'mixta';

  const jornadaLegal = JORNADA_LEGAL_MIN[clasificacion];
  const ordinarios = Math.min(trabajados, jornadaLegal);
  const extra = Math.max(0, trabajados - jornadaLegal);

  // Tope diario de 3h: solo es pagable como extra hasta el tope. Si se excede,
  // se marca para que el jefe lo revise (no se paga por debajo del mínimo legal,
  // pero tampoco se reconoce extra por encima del tope sin revisión).
  const topeDiaExcedido = extra > TOPES_EXTRA_MIN.dia;
  let extraPagable = Math.min(extra, TOPES_EXTRA_MIN.dia);

  // Tope semanal de 9h: la extra pagable acumulada en la semana (días previos +
  // hoy) no puede superar el tope. Si lo supera, se recorta lo pagable de hoy al
  // saldo disponible y se marca para revisión del jefe (mismo criterio que el
  // tope diario). NOTA: es un cálculo HACIA ADELANTE — recalcular un día anterior
  // no reajusta retroactivamente los días posteriores ya cerrados de la semana.
  const previosSemana = Math.max(0, opciones.minutosExtraPagablesSemanaPrevios ?? 0);
  const disponibleSemana = Math.max(0, TOPES_EXTRA_MIN.semana - previosSemana);
  const topeSemanaExcedido = extraPagable > disponibleSemana;
  if (topeSemanaExcedido) {
    extraPagable = disponibleSemana;
  }

  // Recargo fijo según clasificación (o 150% si es festivo) y monto en dinero.
  const recargo = recargoExtra(clasificacion, esFestivo);
  const montoExtra =
    opciones.salarioMensual === undefined
      ? 0
      : Math.round(
          (extraPagable / 60) * valorHora(opciones.salarioMensual) * (1 + recargo) * 100,
        ) / 100;

  return {
    minutosPresencia: presencia,
    minutosPausa: pausa,
    minutosTrabajados: trabajados,
    minutosOrdinarios: ordinarios,
    minutosExtra: extra,
    minutosExtraPagables: extraPagable,
    clasificacion,
    recargo,
    montoExtra,
    topeDiaExcedido,
    topeSemanaExcedido,
    esFestivo,
    anomalia: false,
    detalleAnomalia: null,
  };
}
