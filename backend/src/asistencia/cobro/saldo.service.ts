import { prisma, type ClienteTx } from '../../core/prisma.js';
import { ErrorValidacion } from '../../core/errors.js';

/**
 * Servicio transaccional ÚNICO del saldo de horas extra (en dinero).
 *
 * REGLA: toda escritura del saldo pasa por aquí; nunca hay UPDATEs sueltos al
 * saldo desde otro lado. `acreditar` y `debitar` reciben SIEMPRE el cliente
 * transaccional `tx`, para que la escritura del saldo sea atómica con la
 * operación que la origina (cerrar/corregir una jornada, pagar un cobro).
 */

/**
 * Acredita (o ajusta) el saldo del empleado en `monto`. El monto puede ser
 * negativo si un recálculo de jornada reduce las extras (ajuste a la baja). Crea
 * la fila de saldo si no existe. Debe llamarse dentro de la transacción que
 * cierra/corrige la jornada.
 */
export async function acreditarSaldo(
  tx: ClienteTx,
  empleadoId: string,
  monto: number,
): Promise<void> {
  if (monto === 0) return;
  await tx.saldoHorasExtra.upsert({
    where: { empleadoId },
    create: { empleadoId, saldo: monto },
    update: { saldo: { increment: monto } },
  });
}

/**
 * Debita `monto` del saldo del empleado. Bloquea la fila (`SELECT … FOR UPDATE`)
 * y rechaza si el saldo es insuficiente: el saldo NUNCA queda negativo, ni
 * siquiera bajo concurrencia. Debe llamarse dentro de la transacción del cobro.
 */
export async function debitarSaldo(
  tx: ClienteTx,
  empleadoId: string,
  monto: number,
): Promise<void> {
  if (monto <= 0) {
    throw new ErrorValidacion('El monto a debitar debe ser mayor que cero.');
  }

  const filas = await tx.$queryRaw<Array<{ saldo: string }>>`
    SELECT saldo FROM saldo_horas_extra WHERE empleado_id = ${empleadoId}::uuid FOR UPDATE`;
  const saldoActual = filas.length > 0 ? Number(filas[0]?.saldo) : 0;

  if (monto > saldoActual) {
    throw new ErrorValidacion(
      `Saldo insuficiente: disponible B/. ${saldoActual.toFixed(2)}, solicitado B/. ${monto.toFixed(2)}.`,
    );
  }

  await tx.saldoHorasExtra.update({
    where: { empleadoId },
    data: { saldo: { decrement: monto } },
  });
}

/** Lee el saldo actual del empleado (0 si aún no tiene fila). Solo lectura. */
export async function obtenerSaldo(empleadoId: string): Promise<number> {
  const fila = await prisma.saldoHorasExtra.findUnique({ where: { empleadoId } });
  return fila ? Number(fila.saldo) : 0;
}
