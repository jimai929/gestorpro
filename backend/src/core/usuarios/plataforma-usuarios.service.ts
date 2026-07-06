import { randomBytes } from 'node:crypto';
import { prisma } from '../prisma.js';
import { ErrorNoEncontrado, ErrorValidacion } from '../errors.js';
import { hashearContrasena } from '../auth/contrasena.js';
import { auditoriaPlataformaRepo } from '../../shared/repositories/auditoria-plataforma.repository.js';

/**
 * Gestión de cuentas de acceso a NIVEL PLATAFORMA (super-admin). A diferencia del
 * módulo de tenant (usuarios.service), estas operaciones tocan campos GLOBALES del
 * `Usuario` (activo, passwordHash) y por eso NO pueden ejecutarlas los admins de un
 * tenant: afectarían al usuario en TODAS sus empresas. Es la vía por la que se
 * gestionan las cuentas MULTI-EMPRESA (que el módulo de tenant rechaza con 409).
 *
 * `usuario`, `sesion_refresco` y `auditoria_plataforma` están FUERA de RLS (allowlist),
 * así que se opera con un `prisma.$transaction` PLANO (sin txEmpresa/GUC), igual que el
 * cambio de contraseña del super-admin (B5) y el reset del admin de empresa. La
 * auditoría va a `AuditoriaPlataforma` (NO a la `Auditoria` de tenant), sin empresa
 * afectada (operación global): el objetivo va en `detalle`.
 */

/** Vista mínima GLOBAL de un usuario tras una operación de plataforma (sin rol per-tenant). */
export interface UsuarioPlataforma {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
}

/** Temporal generada server-side (mismo mecanismo que empresa.service.generarContrasenaTemporal). */
function generarContrasenaTemporal(): string {
  return randomBytes(18).toString('base64url');
}

/**
 * Carga el usuario objetivo aplicando los guards comunes de plataforma:
 * - `objetivoId === superAdminId` → 400 (evita el auto-lockout de la propia cuenta).
 * - inexistente → 404.
 * - cuenta de PLATAFORMA (esSuperAdmin) → 400: otro super-admin no se gestiona por
 *   aquí (su rotación/estado va por mantenimiento/seed, mismo criterio que B1/B5).
 * Devuelve el usuario y su id normalizado a minúsculas (el patrón de ruta admite hex
 * en mayúsculas; Postgres resuelve el uuid case-insensitive).
 */
async function cargarObjetivo(usuarioObjetivoId: string, superAdminId: string, accionAuto: string) {
  const objetivoId = usuarioObjetivoId.toLowerCase();
  if (objetivoId === superAdminId.toLowerCase()) {
    throw new ErrorValidacion(accionAuto);
  }
  const objetivo = await prisma.usuario.findUnique({ where: { id: objetivoId } });
  if (!objetivo) {
    throw new ErrorNoEncontrado('Usuario no encontrado.');
  }
  if (objetivo.esSuperAdmin) {
    throw new ErrorValidacion('Las cuentas de plataforma no se gestionan por este endpoint.');
  }
  return { objetivo, objetivoId };
}

/**
 * Baja / reactivación GLOBAL de un usuario (Usuario.activo). Funciona sobre cuentas
 * MULTI-EMPRESA (a diferencia del endpoint de tenant, que las rechaza con 409). Solo
 * toca `Usuario.activo`: NO modifica membresías ni `Usuario.rol`. Desactivar EXPULSA
 * todas las sesiones del objetivo; el access token vivo expira en ≤15 min (tradeoff I5).
 * Idempotente sin ruido (updateMany condicional; pedir el estado que ya tiene → no-op
 * sin asiento).
 */
export async function cambiarEstadoUsuarioPlataforma(
  usuarioObjetivoId: string,
  superAdminId: string,
  activo: boolean,
): Promise<UsuarioPlataforma> {
  const { objetivo, objetivoId } = await cargarObjetivo(
    usuarioObjetivoId,
    superAdminId,
    'No puedes cambiar el estado de tu propia cuenta de plataforma.',
  );

  const fila = (): UsuarioPlataforma => ({
    id: objetivo.id,
    nombre: objetivo.nombre,
    email: objetivo.email,
    activo,
  });

  await prisma.$transaction(async (tx) => {
    // Idempotencia ATÓMICA: solo "gana" si estaba en el estado contrario. Pedir el
    // estado que ya tiene → count 0 → 200 con la fila, sin asiento duplicado.
    const cambio = await tx.usuario.updateMany({
      where: { id: objetivoId, activo: !activo },
      data: { activo },
    });
    if (cambio.count === 0) {
      return; // ya estaba así: no-op
    }
    if (!activo) {
      await tx.sesionRefresco.deleteMany({ where: { usuarioId: objetivoId } });
    }
    await auditoriaPlataformaRepo.registrar(
      {
        actorUsuarioId: superAdminId,
        accion: activo ? 'reactivar_usuario' : 'desactivar_usuario',
        // Operación GLOBAL (sin empresa): `empresaAfectadaId` se OMITE (null). El
        // objetivo va en `detalle`; jamás una contraseña.
        detalle: { usuarioObjetivoId: objetivoId, activo },
      },
      tx,
    );
  });
  return fila();
}

/**
 * RESTABLECE la contraseña GLOBAL de un usuario a una TEMPORAL (born-true): el usuario
 * deberá rotarla en su primer login. Funciona sobre cuentas MULTI-EMPRESA. Solo toca
 * `Usuario.passwordHash` + `debeCambiarContrasena`: NO modifica membresías ni
 * `Usuario.rol`. Revoca TODAS las sesiones del objetivo. La temporal se devuelve EN
 * CLARO una sola vez (respuesta); JAMÁS se persiste ni audita en claro (solo su hash).
 */
export async function restablecerContrasenaPlataforma(
  usuarioObjetivoId: string,
  superAdminId: string,
): Promise<{ contrasenaTemporal: string; debeCambiarContrasena: true }> {
  const { objetivoId } = await cargarObjetivo(
    usuarioObjetivoId,
    superAdminId,
    'Tu propia contraseña se cambia por autoservicio, no por este endpoint.',
  );

  // argon2 FUERA de la transacción (es costoso; no hay que tener la tx abierta).
  const contrasenaTemporal = generarContrasenaTemporal();
  const passwordHash = await hashearContrasena(contrasenaTemporal);

  await prisma.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: objetivoId },
      // Temporal born-true (mismo mecanismo que el alta / el reset de admin de empresa).
      data: { passwordHash, debeCambiarContrasena: true },
    });
    // Expulsa TODAS las sesiones vivas: tras el reset solo entra quien tenga la temporal.
    await tx.sesionRefresco.deleteMany({ where: { usuarioId: objetivoId } });
    await auditoriaPlataformaRepo.registrar(
      {
        actorUsuarioId: superAdminId,
        accion: 'restablecer_contrasena_usuario',
        // `detalle` SIN contraseña: jamás en claro. Solo referencia al objetivo.
        detalle: { usuarioObjetivoId: objetivoId },
      },
      tx,
    );
  });

  return { contrasenaTemporal, debeCambiarContrasena: true };
}
