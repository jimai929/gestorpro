import { randomBytes } from 'node:crypto';
import { prisma } from '../../core/prisma.js';
import {
  ErrorAutenticacion,
  ErrorNoEncontrado,
  ErrorValidacion,
} from '../../core/errors.js';
import { hashearContrasena, verificarContrasena } from '../../core/auth/contrasena.js';

export interface DatosKiosco {
  nombre: string;
  sedeId: string;
}

/** Campos del kiosco que se devuelven al cliente: NUNCA incluye `tokenHash`. */
const CAMPOS_PUBLICOS = {
  id: true,
  nombre: true,
  sedeId: true,
  activo: true,
  creadoEn: true,
} as const;

/**
 * Genera un token de dispositivo de alta entropía (32 bytes). Al ser un secreto
 * aleatorio largo, se hashea con argon2 igual que las contraseñas; el token en
 * claro solo existe en memoria el tiempo de devolverlo y no se vuelve a mostrar.
 */
function generarToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Da de alta un kiosco en una sede existente y genera su token de dispositivo.
 * Devuelve el token EN CLARO una sola vez (solo se guarda su hash): el llamador
 * debe entregarlo al dispositivo, porque no se puede recuperar después.
 */
export async function crearKiosco(datos: DatosKiosco) {
  const sede = await prisma.sede.findUnique({ where: { id: datos.sedeId } });
  if (!sede) {
    throw new ErrorValidacion('La sede indicada no existe.');
  }
  const token = generarToken();
  const kiosco = await prisma.kiosco.create({
    data: {
      nombre: datos.nombre,
      sedeId: datos.sedeId,
      tokenHash: await hashearContrasena(token),
    },
    select: CAMPOS_PUBLICOS,
  });
  return { ...kiosco, token };
}

/**
 * Regenera el token de un kiosco (rotación, o provisión de un kiosco antiguo sin
 * token). Invalida el token anterior. Devuelve el nuevo token en claro una vez.
 */
export async function regenerarTokenKiosco(id: string) {
  const kiosco = await prisma.kiosco.findUnique({ where: { id }, select: { id: true } });
  if (!kiosco) {
    throw new ErrorNoEncontrado('Kiosco no encontrado.');
  }
  const token = generarToken();
  await prisma.kiosco.update({
    where: { id },
    data: { tokenHash: await hashearContrasena(token) },
  });
  return { id, token };
}

/**
 * Verifica el token de dispositivo de un kiosco para autorizar un fichaje. Lanza
 * `ErrorAutenticacion` (→ 401) si el kiosco no existe, está inactivo, no tiene
 * token configurado, o el token no coincide. No revela cuál de los casos fue.
 */
export async function verificarTokenKiosco(
  kioscoId: string,
  token: string | undefined,
): Promise<void> {
  const kiosco = await prisma.kiosco.findUnique({
    where: { id: kioscoId },
    select: { activo: true, tokenHash: true },
  });
  if (
    !kiosco ||
    !kiosco.activo ||
    !kiosco.tokenHash ||
    !token ||
    !(await verificarContrasena(kiosco.tokenHash, token))
  ) {
    throw new ErrorAutenticacion('Kiosco no autorizado.');
  }
}
