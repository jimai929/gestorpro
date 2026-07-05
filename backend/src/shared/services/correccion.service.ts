import type { ClienteTx } from '../../core/prisma.js';
import { ErrorConflicto } from '../../core/errors.js';
import { txEmpresa } from '../../core/tenant/contexto.js';
import { auditoriaRepo } from '../repositories/auditoria.repository.js';

/** Error de negocio al corregir un movimiento. Las rutas lo mapean a 400. */
export class ErrorCorreccion extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorCorreccion';
  }
}

/** Lo mínimo que todo movimiento corregible expone. */
export interface MovimientoBase {
  id: string;
  tipo: 'normal' | 'reverso' | 'correccion';
}

/** Datos comunes a cada asiento de corrección. */
export interface DatosAsiento {
  motivo: string;
  usuarioId: string;
}

/**
 * Adaptador por entidad. El servicio de corrección es genérico (uno solo para
 * Gasto, PagoProveedor y VentaDiaria); cada entidad aporta cómo cargar el
 * movimiento original y cómo crear los asientos de reverso y de corrección
 * copiando sus campos propios (compra, categoría, sede/fecha, etc.).
 */
export interface AdaptadorCorreccion<T extends MovimientoBase> {
  /** Nombre de la entidad para la auditoría: 'pago' | 'gasto' | 'venta'. */
  entidad: string;
  cargar(id: string, tx: ClienteTx): Promise<T | null>;
  /**
   * Bloquea la fila del movimiento original (`SELECT ... FOR UPDATE` en SU tabla).
   * Serializa las correcciones concurrentes del mismo movimiento: la perdedora
   * espera aquí y, al despertar, `existeReverso` ya ve el reverso de la ganadora.
   */
  bloquearOriginal(id: string, tx: ClienteTx): Promise<void>;
  /** ¿Ya existe un asiento `reverso` que corrige este movimiento? (regla "sin doble corrección") */
  existeReverso(id: string, tx: ClienteTx): Promise<boolean>;
  crearReverso(
    original: T,
    datos: DatosAsiento,
    tx: ClienteTx,
  ): Promise<MovimientoBase>;
  /**
   * ¿La entrada pide además una corrección (no solo la anulación)? Cada entidad
   * decide según su payload: pago/gasto miran `montoCorregido`, el cierre de
   * caja mira `detallesCorregidos` (el arqueo corregido).
   */
  hayCorreccion(entrada: EntradaCorreccion): boolean;
  crearCorreccion(
    original: T,
    entrada: EntradaCorreccion,
    datos: DatosAsiento,
    tx: ClienteTx,
  ): Promise<MovimientoBase>;
}

export interface EntradaCorreccion {
  movimientoId: string;
  motivo: string;
  usuarioId: string;
  /** Monto corregido para pago/gasto. Si se omite (y tampoco hay arqueo), es anulación pura. */
  montoCorregido?: number;
  /** Arqueo corregido para el cierre de caja (reemplaza el desglose original). */
  detallesCorregidos?: Array<{ tipoArqueo: string; monto: number }>;
}

export interface ResultadoCorreccion {
  reverso: MovimientoBase;
  correccion: MovimientoBase | null;
}

/**
 * Corrige un movimiento de dinero SIN tocar el original (inmutable). Crea un
 * asiento de `reverso` que anula el original y, si se pasa `montoCorregido`,
 * un asiento de `correccion` con el valor correcto. Todo en una transacción,
 * con su rastro en la auditoría. La anulación pura omite la corrección.
 */
export async function corregirMovimiento<T extends MovimientoBase>(
  adaptador: AdaptadorCorreccion<T>,
  entrada: EntradaCorreccion,
): Promise<ResultadoCorreccion> {
  const { movimientoId, motivo, usuarioId, montoCorregido } = entrada;

  if (!motivo || motivo.trim().length === 0) {
    throw new ErrorCorreccion('El motivo de la corrección es obligatorio.');
  }
  if (montoCorregido !== undefined && montoCorregido < 0) {
    throw new ErrorCorreccion('El monto corregido no puede ser negativo.');
  }

  return txEmpresa(async (tx) => {
    const original = await adaptador.cargar(movimientoId, tx);
    if (!original) {
      throw new ErrorCorreccion('El movimiento a corregir no existe.');
    }
    if (original.tipo !== 'normal') {
      throw new ErrorCorreccion(
        'Solo se puede corregir un movimiento normal, no un asiento de corrección.',
      );
    }

    // Regla "sin doble corrección": a lo sumo UN reverso por movimiento normal.
    // El chequeo va BAJO el lock de la fila original — dos correcciones
    // concurrentes se serializan en bloquearOriginal y la perdedora ve aquí el
    // reverso ya commiteado de la ganadora → 409 limpio (el índice único parcial
    // uq_*_reverso_unico respalda la regla a nivel de BD). El original es
    // inmutable, así que `tipo` no necesita re-chequeo bajo el lock.
    await adaptador.bloquearOriginal(original.id, tx);
    if (await adaptador.existeReverso(original.id, tx)) {
      throw new ErrorConflicto(
        'El movimiento ya fue corregido: no admite una segunda corrección.',
      );
    }

    const datos: DatosAsiento = { motivo, usuarioId };

    const reverso = await adaptador.crearReverso(original, datos, tx);
    await auditoriaRepo.registrar(
      {
        entidad: adaptador.entidad,
        entidadId: reverso.id,
        accion: 'reverso',
        usuarioId,
        detalle: { movimientoOriginal: original.id, motivo },
      },
      tx,
    );

    let correccion: MovimientoBase | null = null;
    if (adaptador.hayCorreccion(entrada)) {
      correccion = await adaptador.crearCorreccion(original, entrada, datos, tx);
      await auditoriaRepo.registrar(
        {
          entidad: adaptador.entidad,
          entidadId: correccion.id,
          accion: 'correccion',
          usuarioId,
          detalle: {
            movimientoOriginal: original.id,
            motivo,
            ...(montoCorregido !== undefined ? { montoCorregido } : {}),
            ...(entrada.detallesCorregidos ? { detallesCorregidos: entrada.detallesCorregidos } : {}),
          },
        },
        tx,
      );
    }

    return { reverso, correccion };
  }, {
    // Aislamiento EXPLÍCITO (misma convención y motivo que registrarPago): el
    // guard anti-doble-corrección depende de READ COMMITTED — la tx que espera
    // el FOR UPDATE debe ver, al despertar, el reverso ya commiteado por la
    // ganadora; bajo REPEATABLE READ el snapshot stale dejaría pasar AMBAS.
    // El timeout holgado cubre la espera del lock bajo contención.
    tx: { isolationLevel: 'ReadCommitted', timeout: 15000 },
  });
}
