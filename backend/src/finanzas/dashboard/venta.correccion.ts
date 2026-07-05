import {
  ErrorCorreccion,
  type AdaptadorCorreccion,
  type MovimientoBase,
} from '../../shared/services/correccion.service.js';
import { revisarArqueo, type LineaArqueo, type TipoArqueo } from './ventas.service.js';
import type { Prisma } from '../../generated/prisma/client.js';

/** Cierre de caja con lo que el servicio de corrección necesita copiar. */
interface VentaMovimiento extends MovimientoBase {
  sedeId: string;
  fechaOperacion: Date;
  turno: 'manana' | 'tarde' | 'noche';
  cajera: string;
  cerradoPor: string;
  horaApertura: string | null;
  horaCierre: string | null;
  monto: Prisma.Decimal;
  detalles: Array<{ tipoArqueo: TipoArqueo; monto: Prisma.Decimal }>;
}

function redondear(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Adaptador de corrección para el cierre de caja. Los asientos de reverso y
 * corrección llevan la misma (sede, fecha, turno, cajera) que el original: no
 * chocan con `uq_venta_normal` porque éste solo aplica a `tipo = 'normal'`. El
 * reverso copia el arqueo del original; la corrección lleva el arqueo corregido
 * (no un único monto), para que el neto por tipo y el total sigan cuadrando.
 */
export const adaptadorVenta: AdaptadorCorreccion<VentaMovimiento> = {
  entidad: 'venta',

  async cargar(id, tx) {
    return tx.ventaDiaria.findUnique({
      where: { id },
      select: {
        id: true,
        tipo: true,
        sedeId: true,
        fechaOperacion: true,
        turno: true,
        cajera: true,
        cerradoPor: true,
        horaApertura: true,
        horaCierre: true,
        monto: true,
        detalles: { select: { tipoArqueo: true, monto: true } },
      },
    });
  },

  async bloquearOriginal(id, tx) {
    await tx.$queryRaw`SELECT id FROM venta_diaria WHERE id = ${id}::uuid FOR UPDATE`;
  },

  async existeReverso(id, tx) {
    return (await tx.ventaDiaria.count({ where: { corrigeId: id, tipo: 'reverso' } })) > 0;
  },

  hayCorreccion(entrada) {
    return entrada.detallesCorregidos !== undefined;
  },

  async crearReverso(original, datos, tx) {
    return tx.ventaDiaria.create({
      data: {
        sedeId: original.sedeId,
        fechaOperacion: original.fechaOperacion,
        turno: original.turno,
        cajera: original.cajera,
        cerradoPor: original.cerradoPor,
        horaApertura: original.horaApertura,
        horaCierre: original.horaCierre,
        monto: original.monto,
        tipo: 'reverso',
        corrigeId: original.id,
        motivo: datos.motivo,
        usuarioId: datos.usuarioId,
        detalles: {
          create: original.detalles.map((d) => ({ tipoArqueo: d.tipoArqueo, monto: d.monto })),
        },
      },
      select: { id: true, tipo: true },
    });
  },

  async crearCorreccion(original, entrada, datos, tx) {
    const corregidos = entrada.detallesCorregidos;
    if (!corregidos || corregidos.length === 0) {
      throw new ErrorCorreccion('La corrección de un cierre requiere el arqueo corregido.');
    }
    // El esquema de la ruta ya valida los tipos; el cast confía en esa validación.
    const arqueo = corregidos as LineaArqueo[];
    const error = revisarArqueo(arqueo);
    if (error) {
      throw new ErrorCorreccion(error);
    }
    const total = redondear(arqueo.reduce((acc, d) => acc + d.monto, 0));

    return tx.ventaDiaria.create({
      data: {
        sedeId: original.sedeId,
        fechaOperacion: original.fechaOperacion,
        turno: original.turno,
        cajera: original.cajera,
        cerradoPor: original.cerradoPor,
        horaApertura: original.horaApertura,
        horaCierre: original.horaCierre,
        monto: total,
        tipo: 'correccion',
        corrigeId: original.id,
        motivo: datos.motivo,
        usuarioId: datos.usuarioId,
        detalles: {
          create: arqueo.map((d) => ({ tipoArqueo: d.tipoArqueo, monto: d.monto })),
        },
      },
      select: { id: true, tipo: true },
    });
  },
};
