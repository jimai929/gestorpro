import { randomBytes } from 'node:crypto';
import { txEmpresa, txBootstrapDispositivo } from '../../core/tenant/contexto.js';
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
  const token = generarToken();
  const tokenHash = await hashearContrasena(token); // argon2 FUERA de la tx
  const kiosco = await txEmpresa(async (tx) => {
    // Bajo RLS (contexto del admin), la sede de OTRA empresa no es visible → 422.
    const sede = await tx.sede.findUnique({ where: { id: datos.sedeId } });
    if (!sede) {
      throw new ErrorValidacion('La sede indicada no existe.');
    }
    return tx.kiosco.create({
      data: { nombre: datos.nombre, sedeId: datos.sedeId, tokenHash },
      select: CAMPOS_PUBLICOS,
    });
  });
  return { ...kiosco, token };
}

/**
 * Lista los kioscos de la EMPRESA ACTUAL para la pantalla de gestión.
 *
 * A diferencia del catálogo PÚBLICO de dispositivo (`GET /kioscos`, cross-tenant por
 * el bootstrap del kiosco), este corre bajo `txEmpresa`: la RLS de `kiosco` (que se
 * apoya en `sede.empresa_id`) lo acota al tenant del usuario autenticado. NUNCA
 * expone `tokenHash` (usa `CAMPOS_PUBLICOS` + el nombre de la sede).
 */
export async function listarKioscos() {
  return txEmpresa((tx) =>
    tx.kiosco.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' },
      select: { ...CAMPOS_PUBLICOS, sede: { select: { nombre: true } } },
    }),
  );
}

/**
 * Regenera el token de un kiosco (rotación, o provisión de un kiosco antiguo sin
 * token). Invalida el token anterior. Devuelve el nuevo token en claro una vez.
 */
export async function regenerarTokenKiosco(id: string) {
  const token = generarToken();
  const tokenHash = await hashearContrasena(token); // argon2 FUERA de la tx
  await txEmpresa(async (tx) => {
    // Bajo RLS, un kiosco de otra empresa no es visible → 404.
    const kiosco = await tx.kiosco.findUnique({ where: { id }, select: { id: true } });
    if (!kiosco) {
      throw new ErrorNoEncontrado('Kiosco no encontrado.');
    }
    await tx.kiosco.update({ where: { id }, data: { tokenHash } });
  });
  return { id, token };
}

/**
 * Bootstrap de fichaje: verifica el token de dispositivo y RESUELVE la empresa del
 * kiosco (vía su sede). El dispositivo no tiene JWT, así que para leer su propia
 * fila —protegida por RLS— se usa `txBootstrapDispositivo` (bypass acotado a ESA
 * lectura). El fichaje en sí corre DESPUÉS bajo RLS normal con el empresaId devuelto.
 * Lanza `ErrorAutenticacion` (→ 401) si el kiosco no existe, está inactivo, no tiene
 * token, o el token no coincide. No revela cuál de los casos fue. La verificación
 * argon2 se hace FUERA de la tx de bootstrap (no la retiene).
 */
export async function resolverContextoKiosco(
  kioscoId: string,
  token: string | undefined,
): Promise<{ empresaId: string }> {
  const kiosco = await txBootstrapDispositivo((tx) =>
    tx.kiosco.findUnique({
      where: { id: kioscoId },
      select: {
        activo: true,
        tokenHash: true,
        // empresa.estado en el MISMO select (cero consultas extra): el token de
        // dispositivo no tiene TTL, así que sin este check un tenant suspendido o
        // cancelado seguiría ACEPTANDO fichajes para siempre — I5 cubre también este canal.
        sede: { select: { empresaId: true, empresa: { select: { estado: true } } } },
      },
    }),
  );
  if (
    !kiosco ||
    !kiosco.activo ||
    // B3: solo una empresa ACTIVA acepta fichajes (suspendida y cancelada revocan igual).
    kiosco.sede.empresa?.estado !== 'activa' ||
    !kiosco.tokenHash ||
    !token ||
    !(await verificarContrasena(kiosco.tokenHash, token))
  ) {
    throw new ErrorAutenticacion('Kiosco no autorizado.');
  }
  return { empresaId: kiosco.sede.empresaId };
}
