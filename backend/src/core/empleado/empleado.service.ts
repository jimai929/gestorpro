import { randomBytes } from 'node:crypto';
import { prisma } from '../prisma.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorValidacion } from '../errors.js';
import { hashearContrasena } from '../auth/contrasena.js';

function esErrorPrisma(error: unknown, codigo: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === codigo
  );
}

/** Token de QR aleatorio, único y revocable (se regenera para rotarlo). */
function generarQrToken(): string {
  return randomBytes(24).toString('base64url');
}

/**
 * Valida un PIN de empleado: exactamente 4 dígitos y NO trivial. Rechaza
 * repeticiones (0000, 1111…) y secuencias ascendentes/descendentes (1234, 4321,
 * 5678…). Lanza ErrorValidacion (→ 400) si no cumple.
 */
export function validarPin(pin: string): void {
  if (!/^\d{4}$/.test(pin)) {
    throw new ErrorValidacion('El PIN debe ser de exactamente 4 dígitos.');
  }
  const d = pin.split('').map(Number);
  const todosIguales = d.every((n) => n === d[0]);
  const ascendente = d.every((n, i) => i === 0 || n === d[i - 1]! + 1);
  const descendente = d.every((n, i) => i === 0 || n === d[i - 1]! - 1);
  if (todosIguales || ascendente || descendente) {
    throw new ErrorValidacion(
      'El PIN es demasiado predecible: evita repeticiones (0000) y secuencias (1234, 4321).',
    );
  }
}

const SELECT_EMPLEADO = {
  id: true,
  numero: true,
  nombre: true,
  sedeId: true,
  salarioFijo: true,
  turnoId: true,
  activo: true,
  fotoReferencia: true,
} as const;

interface EmpleadoFila {
  id: string;
  numero: string;
  nombre: string;
  sedeId: string;
  salarioFijo: { toString(): string };
  turnoId: string | null;
  activo: boolean;
  fotoReferencia: string | null;
}

/**
 * DTO público del empleado. NUNCA expone `pinHash` ni `qrToken` (secretos): el
 * QR solo se devuelve por los endpoints de admin (`GET/POST /empleados/:id/qr`).
 * El dinero va como `number`. `tieneFoto` indica si hay foto de referencia
 * (preparada para el reconocimiento facial futuro), sin exponer su contenido.
 */
function aEmpleadoDto(e: EmpleadoFila) {
  return {
    id: e.id,
    numero: e.numero,
    nombre: e.nombre,
    sedeId: e.sedeId,
    salarioFijo: Number(e.salarioFijo),
    turnoId: e.turnoId,
    activo: e.activo,
    tieneFoto: e.fotoReferencia != null,
  };
}

export interface DatosEmpleado {
  numero: string;
  nombre: string;
  sedeId: string;
  salarioFijo: number;
  turnoId?: string | null;
  pin: string;
}

/**
 * Da de alta un empleado. El PIN se valida (anti-trivial) y se guarda HASHEADO
 * (argon2), nunca en claro. El `qrToken` se autogenera. Devuelve el empleado y,
 * por única vez, el `qrToken` recién creado (para imprimir su QR al instante).
 */
export async function crearEmpleado(datos: DatosEmpleado) {
  validarPin(datos.pin);
  const pinHash = await hashearContrasena(datos.pin);
  const qrToken = generarQrToken();
  try {
    const empleado = await prisma.empleado.create({
      data: {
        numero: datos.numero,
        nombre: datos.nombre,
        sedeId: datos.sedeId,
        salarioFijo: datos.salarioFijo,
        ...(datos.turnoId ? { turnoId: datos.turnoId } : {}),
        pinHash,
        qrToken,
      },
      select: SELECT_EMPLEADO,
    });
    return { ...aEmpleadoDto(empleado), qrToken };
  } catch (error) {
    if (esErrorPrisma(error, 'P2002')) {
      throw new ErrorConflicto('Ya existe un empleado con ese número.');
    }
    if (esErrorPrisma(error, 'P2003')) {
      throw new ErrorValidacion('La sede o el turno indicados no existen.');
    }
    throw error;
  }
}

export interface DatosEditarEmpleado {
  numero?: string;
  nombre?: string;
  sedeId?: string;
  salarioFijo?: number;
  turnoId?: string | null;
  activo?: boolean;
}

/** Edita un empleado (parcial) e incluye la baja/alta lógica (`activo`). */
export async function editarEmpleado(id: string, datos: DatosEditarEmpleado) {
  const data = {
    ...(datos.numero !== undefined ? { numero: datos.numero } : {}),
    ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
    ...(datos.sedeId !== undefined ? { sedeId: datos.sedeId } : {}),
    ...(datos.salarioFijo !== undefined ? { salarioFijo: datos.salarioFijo } : {}),
    ...(datos.turnoId !== undefined ? { turnoId: datos.turnoId } : {}),
    ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
  };
  try {
    const empleado = await prisma.empleado.update({ where: { id }, data, select: SELECT_EMPLEADO });
    return aEmpleadoDto(empleado);
  } catch (error) {
    if (esErrorPrisma(error, 'P2025')) {
      throw new ErrorNoEncontrado('El empleado indicado no existe.');
    }
    if (esErrorPrisma(error, 'P2002')) {
      throw new ErrorConflicto('Ya existe un empleado con ese número.');
    }
    if (esErrorPrisma(error, 'P2003')) {
      throw new ErrorValidacion('La sede o el turno indicados no existen.');
    }
    throw error;
  }
}

/**
 * Lista empleados. Por defecto solo activos (para los selectores: cobro y el
 * cierre de caja); con `incluirInactivos`, todos (para la gestión). `sedeId`
 * filtra por sede (lo usa el selector de `cerradoPor` del cierre).
 */
export function listarEmpleados(filtros?: { incluirInactivos?: boolean; sedeId?: string }) {
  return prisma.empleado
    .findMany({
      where: {
        ...(filtros?.incluirInactivos ? {} : { activo: true }),
        ...(filtros?.sedeId ? { sedeId: filtros.sedeId } : {}),
      },
      orderBy: { numero: 'asc' },
      select: SELECT_EMPLEADO,
    })
    .then((lista) => lista.map(aEmpleadoDto));
}

/** Devuelve el `qrToken` actual (para reimprimir el QR sin rotarlo). Solo admin. */
export async function obtenerQrToken(id: string) {
  const empleado = await prisma.empleado.findUnique({ where: { id }, select: { qrToken: true } });
  if (!empleado) {
    throw new ErrorNoEncontrado('El empleado indicado no existe.');
  }
  return { qrToken: empleado.qrToken };
}

/** Rota el `qrToken`: genera uno nuevo y revoca el anterior (deja de resolver). */
export async function regenerarQrToken(id: string) {
  try {
    const empleado = await prisma.empleado.update({
      where: { id },
      data: { qrToken: generarQrToken() },
      select: { qrToken: true },
    });
    return { qrToken: empleado.qrToken };
  } catch (error) {
    if (esErrorPrisma(error, 'P2025')) {
      throw new ErrorNoEncontrado('El empleado indicado no existe.');
    }
    throw error;
  }
}

/** Resetea el PIN: lo valida (anti-trivial) y lo re-hashea; el anterior deja de valer. */
export async function resetearPin(id: string, pin: string): Promise<void> {
  validarPin(pin);
  const pinHash = await hashearContrasena(pin);
  try {
    await prisma.empleado.update({ where: { id }, data: { pinHash } });
  } catch (error) {
    if (esErrorPrisma(error, 'P2025')) {
      throw new ErrorNoEncontrado('El empleado indicado no existe.');
    }
    throw error;
  }
}
