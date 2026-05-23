import { prisma, type ClienteTx } from '../../core/prisma.js';
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
  crearReverso(
    original: T,
    datos: DatosAsiento,
    tx: ClienteTx,
  ): Promise<MovimientoBase>;
  crearCorreccion(
    original: T,
    montoCorregido: number,
    datos: DatosAsiento,
    tx: ClienteTx,
  ): Promise<MovimientoBase>;
}

export interface EntradaCorreccion {
  movimientoId: string;
  motivo: string;
  usuarioId: string;
  /** Si se omite, es una anulación pura (solo reverso, sin corrección). */
  montoCorregido?: number;
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

  return prisma.$transaction(async (tx) => {
    const original = await adaptador.cargar(movimientoId, tx);
    if (!original) {
      throw new ErrorCorreccion('El movimiento a corregir no existe.');
    }
    if (original.tipo !== 'normal') {
      throw new ErrorCorreccion(
        'Solo se puede corregir un movimiento normal, no un asiento de corrección.',
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
    if (montoCorregido !== undefined) {
      correccion = await adaptador.crearCorreccion(
        original,
        montoCorregido,
        datos,
        tx,
      );
      await auditoriaRepo.registrar(
        {
          entidad: adaptador.entidad,
          entidadId: correccion.id,
          accion: 'correccion',
          usuarioId,
          detalle: { movimientoOriginal: original.id, montoCorregido, motivo },
        },
        tx,
      );
    }

    return { reverso, correccion };
  });
}
