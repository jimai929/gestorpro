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
 * Cambia el ESTADO (baja/reactivación LÓGICA vía `Usuario.activo`) de un usuario del
 * tenant. Nunca se borra la cuenta: fichajes, auditoría y snapshots la referencian.
 * La ejecuta un administrador del tenant; el super-admin la obtiene ENTRANDO a la
 * empresa vía cambiar-empresa (dos niveles, igual que restablecer-contrasena).
 *
 * Reglas de seguridad:
 * - `empresaId` y `adminId` SIEMPRE del token (ver ruta), NUNCA del body.
 * - Denegación con 404 ÚNICO e indistinguible (inexistente = de otro tenant =
 *   cuenta de plataforma): no revela la existencia de cuentas ajenas.
 * - `Usuario.activo` es GLOBAL: desactivar a un usuario con membresías en OTRAS
 *   empresas lo dejaría fuera de TODAS (mutación cross-tenant desde un solo
 *   tenant). Por eso una cuenta multi-empresa se RECHAZA con 409 en ambas
 *   direcciones: su baja se gestiona desde la plataforma. (Hoy ningún endpoint
 *   crea segundas membresías — email UNIQUE global y las altas siempre crean
 *   usuario nuevo — así que el 409 solo puede darse ante estado sembrado a mano.)
 * - El admin NO puede desactivarse a SÍ MISMO (400): evita el lock-out PROPIO. En el
 *   camino secuencial normal el tenant nunca queda sin admins (el actor es un admin
 *   activo), pero NO es una garantía absoluta: dos admins desactivándose MUTUAMENTE
 *   en concurrencia, un token residual I5 (≤15 min) o un super-admin desactivando al
 *   último admin pueden dejar 0 admins activos. Caso de disponibilidad, no de fuga,
 *   y RECUPERABLE: el super-admin entra vía cambiar-empresa y reactiva o crea un
 *   admin. Cerrarlo del todo exigiría SERIALIZABLE/locks — desproporcionado.
 * - Desactivar EXPULSA todas las sesiones del objetivo (`deleteMany`): el refresh
 *   muere al instante; el access token vivo expira en ≤15 min (tradeoff I5
 *   aceptado y documentado). Reactivar NO toca sesiones ni contraseña.
 * - Idempotente sin ruido: pedir el estado que ya tiene devuelve la fila actual
 *   SIN transacción ni asiento de auditoría duplicado.
 */
export async function cambiarEstadoUsuario(
  usuarioObjetivoId: string,
  empresaId: string,
  adminId: string,
  activo: boolean,
): Promise<UsuarioListado> {
  // Normaliza el uuid a minúsculas ANTES de comparar (mismo motivo que en
  // restablecerContrasena: el patrón de ruta admite hex en MAYÚSCULAS y Postgres
  // resuelve el uuid case-insensitive; un `===` sensible dejaría al admin
  // desactivarse a sí mismo enviando su propio id en mayúsculas).
  const objetivoId = usuarioObjetivoId.toLowerCase();
  if (objetivoId === adminId.toLowerCase()) {
    throw new ErrorValidacion('Tu propia cuenta no se puede desactivar ni reactivar desde aquí.');
  }

  // Mensaje ÚNICO para todo camino de denegación (anti-enumeración). `usuario` y
  // `membresia` están fuera de RLS: se leen con el cliente plano, sin contexto.
  const noEncontrado = () => new ErrorNoEncontrado('Usuario no encontrado.');

  const objetivo = await prisma.usuario.findUnique({ where: { id: objetivoId } });
  if (!objetivo || objetivo.esSuperAdmin) {
    throw noEncontrado();
  }
  const membresias = await prisma.membresia.findMany({ where: { usuarioId: objetivoId } });
  const membresiaAqui = membresias.find((m) => m.empresaId === empresaId);
  if (!membresiaAqui) {
    throw noEncontrado();
  }
  if (membresias.length > 1) {
    throw new ErrorConflicto(
      'La cuenta pertenece a más de una empresa: su estado se gestiona desde la plataforma.',
    );
  }
  // OJO (TOCTOU futuro): este conteo corre FUERA de la tx. Hoy es inexplotable —
  // ningún endpoint añade membresías a un usuario existente (email UNIQUE global,
  // las altas siempre crean usuario nuevo) — pero si algún día se implementa
  // "añadir membresía" (p. ej. el selector multi-empresa del backlog 4c), hay que
  // MOVER este check dentro de la transacción o re-validarlo ahí: si no, una
  // membresía creada en la ventana convertiría esta baja en lock-out cross-tenant.

  const fila = (): UsuarioListado => ({
    id: objetivo.id,
    nombre: objetivo.nombre,
    email: objetivo.email,
    rol: membresiaAqui.rol,
    activo,
    debeCambiarContrasena: objetivo.debeCambiarContrasena,
    creadoEn: objetivo.creadoEn.toISOString(),
  });

  await txEmpresa(
    async (tx) => {
      // Idempotencia ATÓMICA (no un check previo TOCTOU): el updateMany condicional
      // solo "gana" si la cuenta estaba en el estado contrario. Dos PATCH concurrentes
      // al mismo estado producen UN solo asiento; el otro es no-op sin ruido. Pedir el
      // estado que ya tiene → count 0 → 200 con la fila, sin asiento duplicado.
      const cambio = await tx.usuario.updateMany({
        where: { id: objetivoId, activo: !activo },
        data: { activo },
      });
      if (cambio.count === 0) {
        return; // ya estaba así: no-op
      }
      if (!activo) {
        // Baja = fuera YA: sin sesiones de refresco solo queda el access token
        // vivo (≤15 min); login/refresh/cambiar-empresa rechazan cuentas inactivas.
        await tx.sesionRefresco.deleteMany({ where: { usuarioId: objetivoId } });
      }
      await auditoriaRepo.registrar(
        {
          entidad: 'usuario',
          entidadId: objetivoId,
          accion: activo ? 'reactivar_usuario' : 'desactivar_usuario',
          usuarioId: adminId,
          // empresa_id lo rellena el DEFAULT desde el GUC (override de txEmpresa).
          detalle: { activo },
        },
        tx,
      );
    },
    // FUENTE ÚNICA del tenant (mismo patrón que el resto del módulo).
    { empresaId },
  );
  return fila();
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
 * - Cuenta DESACTIVADA → 409: restablecer no revive cuentas dadas de baja; hay que
 *   reactivarla primero (PATCH /usuarios/:id). Sin esto el 204 sería engañoso.
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
  // Cuenta DESACTIVADA: restablecerla daría un 204 engañoso (el login la seguiría
  // rechazando y "no revive cuentas dadas de baja" — DECISIONES). Se exige el orden
  // correcto: primero reactivar, después restablecer. Este 409 corre DESPUÉS del
  // check de membresía: solo lo ve un admin del propio tenant (sin fuga cross-tenant).
  if (!objetivo.activo) {
    throw new ErrorConflicto(
      'La cuenta está desactivada: reactívala antes de restablecer su contraseña.',
    );
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
