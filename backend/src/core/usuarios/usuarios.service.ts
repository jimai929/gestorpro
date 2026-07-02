import { prisma } from '../prisma.js';
import { txEmpresa } from '../tenant/contexto.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorValidacion } from '../errors.js';
import { hashearContrasena } from '../auth/contrasena.js';
import { auditoriaRepo } from '../../shared/repositories/auditoria.repository.js';
import type { Rol } from '../../generated/prisma/enums.js';

function esErrorPrisma(error: unknown, codigo: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === codigo
  );
}

/** Roles que un admin de tenant PUEDE asignar (lista blanca; nunca de plataforma). */
export type RolAsignable = 'administrador' | 'empleado';

export interface DatosNuevoUsuario {
  nombre: string;
  email: string;
  password: string;
  rol: RolAsignable;
}

export interface UsuarioCreado {
  id: string;
  nombre: string;
  email: string;
  rol: RolAsignable;
}

/**
 * Crea un USUARIO dentro del tenant del admin que ejecuta la acción, con su membresía
 * (rol per-tenant) y un asiento de auditoría, TODO en una transacción. Misma forma que
 * `crearEmpresa` PERO sin `bypassPlataforma`: corre bajo RLS normal (contexto de tenant
 * del token).
 *
 * Reglas de seguridad (ver rutas):
 * - `empresaId` SIEMPRE del token (request.user.empresaId), NUNCA del body.
 * - `esSuperAdmin` no se toca: el nuevo usuario queda con el default `false`.
 * - `rol` viene ya restringido por el schema de la ruta a administrador|empleado.
 * - La contraseña se hashea con argon2 (reusado); NUNCA se guarda ni audita en claro.
 */
export async function crearUsuarioEnTenant(
  datos: DatosNuevoUsuario,
  empresaId: string,
  adminId: string,
): Promise<UsuarioCreado> {
  const rol: Rol = datos.rol;
  try {
    // FUENTE ÚNICA del tenant: se pasa `empresaId` (del token) como override a txEmpresa,
    // así el GUC de RLS, el empresa_id por DEFAULT de la auditoría y el de la membresía
    // derivan TODOS del mismo valor (la función no depende de que la ALS esté poblada).
    return await txEmpresa(
      async (tx) => {
        const passwordHash = await hashearContrasena(datos.password);
        const usuario = await tx.usuario.create({
          data: {
            nombre: datos.nombre,
            email: datos.email,
            rol,
            passwordHash,
            // Contraseña temporal fijada por el admin: el nuevo usuario debe rotarla al entrar.
            debeCambiarContrasena: true,
            // esSuperAdmin NO se toca: queda en su default `false`.
          },
        });
        await tx.membresia.create({
          data: {
            usuarioId: usuario.id,
            empresaId, // ← del token, NUNCA del body
            rol,
            predeterminada: true,
          },
        });
        await auditoriaRepo.registrar(
          {
            entidad: 'usuario',
            entidadId: usuario.id,
            accion: 'crear_usuario',
            usuarioId: adminId,
            // empresa_id OMITIDO → lo rellena el DEFAULT desde el GUC, que aquí es el
            // `empresaId` del override. `detalle` SIN contraseña: jamás en claro.
            detalle: { email: usuario.email, rol },
          },
          tx,
        );
        return { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: datos.rol };
      },
      { empresaId },
    );
  } catch (error) {
    // El email es UNIQUE GLOBAL: si ya existe (en CUALQUIER tenant) → P2002. Conflicto
    // genérico que NO revela a qué tenant pertenece (anti-enumeración).
    if (esErrorPrisma(error, 'P2002')) {
      throw new ErrorConflicto('El email ya está en uso.');
    }
    throw error;
  }
}

/**
 * Fila del listado de usuarios del tenant. `rol` es el de la MEMBRESÍA en ESTA empresa
 * (per-tenant), NUNCA el `Usuario.rol` global legado. `creadoEn` en ISO.
 */
export interface UsuarioListado {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
  activo: boolean;
  debeCambiarContrasena: boolean;
  creadoEn: string;
}

/**
 * Lista los usuarios del tenant (los que tienen MEMBRESÍA en la empresa del token).
 * La ejecuta un administrador del tenant; el super-admin la obtiene ENTRANDO a la
 * empresa vía cambiar-empresa (dos niveles, igual que restablecer-contrasena).
 *
 * Reglas de seguridad:
 * - `empresaId` SIEMPRE del token (ver ruta), NUNCA de query/body: un admin solo ve
 *   su propia empresa. `usuario`/`membresia` están fuera de RLS y se leen con el
 *   cliente plano; el aislamiento de este listado lo garantiza el guard de RUTA +
 *   el filtro por `empresaId` del token (mismo criterio que `listarEmpresas`).
 * - Las cuentas de PLATAFORMA (esSuperAdmin) son INVISIBLES dentro del tenant aunque
 *   (estado corrupto, invariante §4.2) tuvieran membresía: mismo criterio que el 404
 *   anti-enumeración de restablecer-contrasena.
 * - No expone hash ni secreto alguno; `debeCambiarContrasena` sí viaja (la UI marca
 *   "contraseña temporal pendiente" para soporte).
 */
export async function listarUsuariosDelTenant(empresaId: string): Promise<UsuarioListado[]> {
  const membresias = await prisma.membresia.findMany({
    where: { empresaId, usuario: { esSuperAdmin: false } },
    orderBy: { usuario: { nombre: 'asc' } },
    select: {
      rol: true,
      usuario: {
        select: {
          id: true,
          nombre: true,
          email: true,
          activo: true,
          debeCambiarContrasena: true,
          creadoEn: true,
        },
      },
    },
  });
  return membresias.map((m) => ({
    id: m.usuario.id,
    nombre: m.usuario.nombre,
    email: m.usuario.email,
    rol: m.rol,
    activo: m.usuario.activo,
    debeCambiarContrasena: m.usuario.debeCambiarContrasena,
    creadoEn: m.usuario.creadoEn.toISOString(),
  }));
}

/**
 * RESTABLECE la contraseña de un usuario del tenant (soporte): fija una contraseña
 * TEMPORAL (born-true, mismo mecanismo que el alta), revoca TODAS sus sesiones y
 * audita — todo en una transacción. La ejecuta un administrador del tenant; el
 * super-admin la obtiene ENTRANDO a la empresa vía cambiar-empresa (dos niveles:
 * `autorizar` lo deja pasar solo dentro de un tenant).
 *
 * Reglas de seguridad:
 * - `empresaId` y `adminId` SIEMPRE del token (ver ruta), NUNCA del body.
 * - Denegación con 404 ÚNICO e indistinguible (usuario inexistente = de otro tenant
 *   = cuenta de plataforma): no revela la existencia de cuentas ajenas.
 * - El objetivo NO puede ser una cuenta de plataforma (esSuperAdmin): su rotación va
 *   por mantenimiento (mismo criterio que el guard B1 de cambiar-contrasena).
 * - El admin NO puede restablecerse a SÍ MISMO: para la propia cuenta existe
 *   /auth/cambiar-contrasena, que exige la contraseña actual — permitir el
 *   auto-restablecimiento dejaría que una sesión robada tome la cuenta sin conocerla.
 * - La contraseña temporal jamás se guarda ni audita en claro; el usuario deberá
 *   rotarla en su primer login (debeCambiarContrasena=true → default-block).
 */
export async function restablecerContrasena(
  usuarioObjetivoId: string,
  empresaId: string,
  adminId: string,
  contrasenaTemporal: string,
): Promise<void> {
  // Normaliza el uuid del path a minúsculas ANTES de compararlo: el patrón de la ruta
  // admite hex en MAYÚSCULAS, pero el `id`/`sub` que emite Postgres es minúsculas. Sin
  // esto, un admin que enviara su PROPIO id en mayúsculas evadiría el guard `===` de
  // auto-restablecimiento (comparación de string sensible a mayúsculas) mientras Prisma/
  // Postgres resuelven el uuid case-insensitive a su propia fila → tomaría su cuenta sin
  // conocer la contraseña actual. Se usa el valor normalizado en TODO el resto.
  const objetivoId = usuarioObjetivoId.toLowerCase();
  if (objetivoId === adminId.toLowerCase()) {
    throw new ErrorValidacion(
      'Para tu propia cuenta usa el cambio de contraseña (requiere la actual).',
    );
  }

  // Mensaje ÚNICO para todo camino de denegación (anti-enumeración). `usuario` y
  // `membresia` están fuera de RLS: se leen con el cliente plano, sin contexto.
  const noEncontrado = () => new ErrorNoEncontrado('Usuario no encontrado.');

  const objetivo = await prisma.usuario.findUnique({ where: { id: objetivoId } });
  if (!objetivo || objetivo.esSuperAdmin) {
    throw noEncontrado();
  }
  const membresia = await prisma.membresia.findUnique({
    where: { usuarioId_empresaId: { usuarioId: objetivoId, empresaId } },
  });
  if (!membresia) {
    throw noEncontrado();
  }

  // argon2 FUERA de la transacción (es costoso; no hay que tener la tx abierta).
  const passwordHash = await hashearContrasena(contrasenaTemporal);
  await txEmpresa(
    async (tx) => {
      await tx.usuario.update({
        where: { id: objetivoId },
        // Contraseña temporal (born-true, como el alta): debe rotarla al entrar.
        data: { passwordHash, debeCambiarContrasena: true },
      });
      // Expulsa TODAS las sesiones vivas del objetivo (p. ej. la de quien perdió el
      // acceso o un token robado): tras el reset solo entra quien tenga la temporal.
      await tx.sesionRefresco.deleteMany({ where: { usuarioId: objetivoId } });
      await auditoriaRepo.registrar(
        {
          entidad: 'usuario',
          entidadId: objetivoId,
          accion: 'restablecer_contrasena',
          usuarioId: adminId,
          // empresa_id lo rellena el DEFAULT desde el GUC (override de txEmpresa).
          // `detalle` se OMITE a propósito: jamás se guarda contraseña alguna.
        },
        tx,
      );
    },
    // FUENTE ÚNICA del tenant (mismo patrón que crearUsuarioEnTenant): el GUC de la
    // auditoría deriva del empresaId del token, sin depender de la ALS.
    { empresaId },
  );
}
