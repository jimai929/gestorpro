import { randomBytes } from 'node:crypto';
import { txEmpresa } from '../tenant/contexto.js';
import { ErrorConflicto, ErrorNoEncontrado, ErrorValidacion } from '../errors.js';
import { hashearContrasena } from '../auth/contrasena.js';
import { auditoriaPlataformaRepo } from '../../shared/repositories/auditoria-plataforma.repository.js';
import { EstadoEmpresa, Rol } from '../../generated/prisma/enums.js';
import { prisma } from '../prisma.js';

function esErrorPrisma(error: unknown, codigo: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === codigo
  );
}

export interface DatosNuevaEmpresa {
  nombre: string;
  slug: string;
  adminNombre: string;
  adminEmail: string;
  adminPassword: string;
}

export interface EmpresaCreada {
  id: string;
  nombre: string;
  slug: string;
  adminId: string;
}

/**
 * Fila del listado de empresas (plataforma). `creadoEn` en ISO; `adminEmail` puede ser
 * null si (excepcionalmente) la empresa no tuviera admin predeterminado.
 */
export interface EmpresaListada {
  id: string;
  nombre: string;
  slug: string;
  /** B3: tres estados. La API de plataforma expone `estado`; el boolean `activo` es legacy interno. */
  estado: EstadoEmpresa;
  creadoEn: string;
  adminEmail: string | null;
}

/**
 * Crea un nuevo tenant (Empresa) con su PRIMER usuario administrador y la membresía
 * que los liga, TODO en una transacción (o todo, o nada). Operación de PLATAFORMA:
 * la ejecuta un super-admin vía bypass auditado (§4.4).
 *
 * Invariantes:
 * - La membresía admin es del NUEVO usuario del tenant, NO del super-admin (que
 *   conserva 0 membresías; su poder viene de esSuperAdmin).
 * - Auditoría de PLATAFORMA (`AuditoriaPlataforma`, NO la `Auditoria` de tenant): dos
 *   asientos (`crear_empresa` + `crear_admin_inicial`) con `actorUsuarioId` = el
 *   super-admin REAL (del token) y `empresaAfectadaId` = la empresa creada. Así la
 *   operación de plataforma no contamina la bitácora scoped por tenant.
 * - `empresa`/`usuario`/`membresia`/`auditoria_plataforma` están EXCLUIDAS de RLS
 *   (allowlist), así que se escriben aunque el GUC de tenant no esté fijado (bypass).
 */
export async function crearEmpresa(
  datos: DatosNuevaEmpresa,
  superAdminId: string,
): Promise<EmpresaCreada> {
  try {
    return await txEmpresa(
      async (tx) => {
        const empresa = await tx.empresa.create({
          data: { nombre: datos.nombre, slug: datos.slug },
        });
        const passwordHash = await hashearContrasena(datos.adminPassword);
        const admin = await tx.usuario.create({
          data: {
            nombre: datos.adminNombre,
            email: datos.adminEmail,
            rol: Rol.administrador,
            passwordHash,
            // Contraseña temporal fijada por el super-admin: el admin debe rotarla al entrar.
            debeCambiarContrasena: true,
          },
        });
        await tx.membresia.create({
          data: {
            usuarioId: admin.id,
            empresaId: empresa.id,
            rol: Rol.administrador,
            predeterminada: true,
          },
        });
        // Auditoría de PLATAFORMA (no de tenant): DOS asientos separados en la misma tx.
        // (1) crear_empresa, (2) crear_admin_inicial. El admin inicial tiene su PROPIO
        // asiento (antes iba plegado en el detalle de crear_empresa). Nunca contraseñas.
        await auditoriaPlataformaRepo.registrar(
          {
            actorUsuarioId: superAdminId,
            accion: 'crear_empresa',
            empresaAfectadaId: empresa.id,
            detalle: { nombre: empresa.nombre, slug: empresa.slug },
          },
          tx,
        );
        await auditoriaPlataformaRepo.registrar(
          {
            actorUsuarioId: superAdminId,
            accion: 'crear_admin_inicial',
            empresaAfectadaId: empresa.id,
            detalle: { adminId: admin.id, adminEmail: admin.email, rol: Rol.administrador },
          },
          tx,
        );
        return {
          id: empresa.id,
          nombre: empresa.nombre,
          slug: empresa.slug,
          adminId: admin.id,
        };
      },
      { bypassPlataforma: true },
    );
  } catch (error) {
    // slug de empresa o email de usuario ya en uso → conflicto (la tx ya hizo
    // rollback completo: no queda empresa ni usuario a medias).
    if (esErrorPrisma(error, 'P2002')) {
      throw new ErrorConflicto('El slug de la empresa o el email del admin ya están en uso.');
    }
    throw error;
  }
}

/** Respuesta de PATCH /empresas/:id (transición de estado del tenant). */
export interface EmpresaEstado {
  id: string;
  nombre: string;
  slug: string;
  estado: EstadoEmpresa;
}

/** Asiento de plataforma por estado destino (reactivar conserva su nombre histórico). */
const ACCION_POR_ESTADO: Record<EstadoEmpresa, string> = {
  activa: 'reactivar_empresa',
  suspendida: 'suspender_empresa',
  cancelada: 'cancelar_empresa',
};

/**
 * TRANSICIONA el estado de un tenant (B3, tres estados). Operación de PLATAFORMA
 * (solo super-admin, guard `soloPlataforma` en la ruta). Nunca se borra la empresa:
 * retención legal, todos sus datos la referencian.
 *
 * Máquina de estados (sin generalizar más de lo decidido):
 * - activa    → suspendida | cancelada
 * - suspendida → activa | cancelada
 * - cancelada → NADA: es TERMINAL. Cualquier transición pedida sobre una cancelada
 *   (incluida `activa`) → 409. No existe "recuperar una cancelada" en el flujo normal.
 * - destino === estado actual → no-op idempotente (200 sin asiento duplicado).
 *
 * Efecto de suspender/cancelar (fuera del negocio YA):
 * - `resolverContextoActivo`/I5 solo aceptan `estado=activa` (fail-closed): la salida
 *   surtiría efecto sola al siguiente refresh/request.
 * - Aquí ADEMÁS se EXPULSAN las sesiones de refresco de todos los usuarios con
 *   membresía en la empresa (misma tx): el refresh muere al instante y solo queda el
 *   access token residual (≤15 min, tradeoff I5 documentado).
 * - Reactivar NO toca sesiones (los usuarios simplemente vuelven a poder entrar).
 *
 * Reglas:
 * - La decisión se toma BAJO lock (`SELECT … FOR UPDATE` de la fila de la empresa):
 *   dos PATCH concurrentes quedan serializados — el segundo ve el estado ya cambiado
 *   y resuelve no-op/409, nunca un asiento duplicado ni un salto ilegal (sin TOCTOU).
 * - `activo` (espejo legacy) se mantiene sincronizado: true ⟺ estado='activa'.
 * - Asiento de PLATAFORMA `suspender_empresa`/`reactivar_empresa`/`cancelar_empresa`
 *   (`AuditoriaPlataforma`, NUNCA la `Auditoria` de tenant) con `actorUsuarioId` =
 *   super-admin REAL del token, `empresaAfectadaId` = la empresa y el detalle
 *   {estado, estadoAnterior}.
 */
export async function cambiarEstadoEmpresa(
  empresaId: string,
  superAdminId: string,
  destino: EstadoEmpresa,
): Promise<EmpresaEstado> {
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) {
    throw new ErrorNoEncontrado('Empresa no encontrada.');
  }

  await txEmpresa(
    async (tx) => {
      // Estado REAL bajo lock: el pre-read de arriba (404) puede quedar stale.
      const filas = await tx.$queryRaw<Array<{ estado: EstadoEmpresa }>>`
        SELECT estado FROM empresa WHERE id = ${empresaId}::uuid FOR UPDATE`;
      const actual = filas[0]?.estado;
      if (!actual) {
        throw new ErrorNoEncontrado('Empresa no encontrada.');
      }
      if (actual === destino) {
        return; // ya estaba así: no-op idempotente, sin asiento duplicado
      }
      if (actual === EstadoEmpresa.cancelada) {
        // TERMINAL: ninguna transición sale de cancelada por el flujo normal.
        throw new ErrorConflicto('La empresa está cancelada: es un estado terminal.');
      }
      await tx.empresa.update({
        where: { id: empresaId },
        // Espejo legacy sincronizado: `activo` sigue significando "está activa".
        data: { estado: destino, activo: destino === EstadoEmpresa.activa },
      });
      if (destino !== EstadoEmpresa.activa) {
        // Suspender/cancelar = fuera YA: se expulsan las sesiones de refresco de los
        // usuarios del tenant (por MEMBRESÍA, no por empresaIdActiva: cubre también las
        // sesiones que nunca cambiaron de empresa). Login/refresh ya rechazan fail-closed.
        await tx.sesionRefresco.deleteMany({
          where: { usuario: { membresias: { some: { empresaId } } } },
        });
      }
      await auditoriaPlataformaRepo.registrar(
        {
          actorUsuarioId: superAdminId,
          accion: ACCION_POR_ESTADO[destino],
          empresaAfectadaId: empresaId,
          detalle: { estado: destino, estadoAnterior: actual },
        },
        tx,
      );
    },
    { bypassPlataforma: true },
  );
  return { id: empresa.id, nombre: empresa.nombre, slug: empresa.slug, estado: destino };
}

/** Roles INTERNOS de empresa que la plataforma puede asignar en una membresía (misma lista blanca que el alta del tenant, M3a). */
export type RolMembresia = 'administrador' | 'supervisor' | 'empleado';

export interface MembresiaCreada {
  id: string;
  usuarioId: string;
  empresaId: string;
  email: string;
  rol: RolMembresia;
}

/**
 * Añade una MEMBRESÍA a un usuario EXISTENTE en otra empresa (multi-empresa).
 * Operación de PLATAFORMA (solo super-admin, guard `soloPlataforma` en la ruta):
 * es la ÚNICA vía que crea segundas membresías — las altas de tenant y de empresa
 * siempre crean usuario nuevo (email UNIQUE global).
 *
 * Reglas de seguridad e invariantes:
 * - El objetivo se identifica por EMAIL (comparación exacta, igual que el login);
 *   el super-admin es god-view, no aplica anti-enumeración de cuentas aquí.
 * - Una cuenta de plataforma (esSuperAdmin) JAMÁS recibe membresía (invariante
 *   §4.2): 400 explícito, no silencioso.
 * - Cuenta o empresa DESACTIVADA → 409 (reactivar primero): evita fabricar el
 *   estado-trampa "multi-membresía inactiva" cuya reactivación exigiría entrar
 *   empresa por empresa; espejo del 409 de restablecer-sobre-inactiva.
 * - `predeterminada` SIEMPRE false: la predeterminada del usuario no se toca (el
 *   selector y el fallback de login ya hacen usable la nueva empresa).
 * - TOCTOU: dentro de la tx se BLOQUEA la fila del usuario (`FOR UPDATE`) y se
 *   re-validan `activo`/`esSuperAdmin` bajo el lock. `cambiarEstadoUsuario` y
 *   `restablecerContrasena` toman el MISMO lock antes de contar membresías, así
 *   que "añadir membresía" y "baja/reset del usuario" quedan SERIALIZADOS: nunca
 *   una membresía creada en la ventana convierte una baja de tenant en lock-out
 *   cross-tenant. (Empresa desactivada en la ventana NO se bloquea: la membresía
 *   resultante es INERTE — login/cambiar-empresa/selector filtran empresas
 *   inactivas, fail-closed — y vuelve a ser útil si la empresa se reactiva.)
 * - Duplicada (ya tiene membresía en esa empresa) → 409 vía P2002 del
 *   `@@unique([usuarioId, empresaId])`, sin pre-check TOCTOU.
 * - Asiento de PLATAFORMA `crear_membresia` (`AuditoriaPlataforma`, no la de tenant)
 *   con `actorUsuarioId` = super-admin REAL del token y `empresaAfectadaId` = la empresa.
 */
export async function crearMembresia(
  empresaId: string,
  email: string,
  rol: RolMembresia,
  superAdminId: string,
): Promise<MembresiaCreada> {
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) {
    throw new ErrorNoEncontrado('Empresa no encontrada.');
  }
  // B3: solo una empresa ACTIVA admite membresías nuevas (suspendida: reactivar primero;
  // cancelada: terminal, jamás).
  if (empresa.estado !== EstadoEmpresa.activa) {
    throw new ErrorConflicto('La empresa no está activa: no admite membresías nuevas.');
  }
  const usuario = await prisma.usuario.findUnique({ where: { email } });
  if (!usuario) {
    throw new ErrorNoEncontrado('Usuario no encontrado.');
  }
  if (usuario.esSuperAdmin) {
    throw new ErrorValidacion('Una cuenta de plataforma no puede tener membresías.');
  }
  if (!usuario.activo) {
    throw new ErrorConflicto('La cuenta está desactivada: reactívala antes de añadir membresías.');
  }

  const rolMembresia: Rol = rol;
  try {
    return await txEmpresa(
      async (tx) => {
        // Lock de la fila del usuario: serializa contra cambiarEstadoUsuario y
        // restablecerContrasena (mismo lock) y ancla los re-checks de abajo.
        const filas = await tx.$queryRaw<Array<{ activo: boolean; es_super_admin: boolean }>>`
          SELECT activo, es_super_admin FROM usuario WHERE id = ${usuario.id}::uuid FOR UPDATE`;
        // Re-validación BAJO el lock (el pre-check de arriba pudo quedar stale).
        if (filas.length === 0 || filas[0]?.es_super_admin) {
          throw new ErrorNoEncontrado('Usuario no encontrado.');
        }
        if (!filas[0]?.activo) {
          throw new ErrorConflicto(
            'La cuenta está desactivada: reactívala antes de añadir membresías.',
          );
        }
        const membresia = await tx.membresia.create({
          data: {
            usuarioId: usuario.id,
            empresaId,
            rol: rolMembresia,
            predeterminada: false, // la predeterminada del usuario NO se toca
          },
        });
        await auditoriaPlataformaRepo.registrar(
          {
            actorUsuarioId: superAdminId,
            accion: 'crear_membresia',
            empresaAfectadaId: empresaId,
            detalle: { membresiaId: membresia.id, email: usuario.email, rol },
          },
          tx,
        );
        return { id: membresia.id, usuarioId: usuario.id, empresaId, email: usuario.email, rol };
      },
      // isolationLevel EXPLÍCITO (misma convención que registrarPago): el re-check
      // bajo `FOR UPDATE` que serializa contra la baja/reset del usuario descansa en
      // READ COMMITTED — bajo REPEATABLE READ (un `default_transaction_isolation`
      // bastaría) la tx que espera el lock leería un snapshot stale al despertar y el
      // TOCTOU se reabriría. El timeout holgado cubre la espera del lock bajo contención.
      { bypassPlataforma: true, tx: { isolationLevel: 'ReadCommitted', timeout: 15000 } },
    );
  } catch (error) {
    // @@unique([usuarioId, empresaId]): ya tiene membresía en esta empresa.
    if (esErrorPrisma(error, 'P2002')) {
      throw new ErrorConflicto('El usuario ya tiene membresía en esta empresa.');
    }
    throw error;
  }
}

/**
 * Lista todas las empresas (tenants) para el super-admin, con el correo del primer admin
 * de cada una (la membresía `predeterminada` de rol `administrador` que crea `crearEmpresa`).
 * Orden: más reciente primero.
 *
 * NO usa txEmpresa/bypass: `empresa`, `membresia` y `usuario` están EXCLUIDAS de RLS, así
 * que `gestorpro_app` las lee y hace el join directamente. El aislamiento de este listado
 * cross-tenant lo garantiza el guard de RUTA `soloPlataforma` (solo super-admin), NO la RLS.
 * (El bypass de `crearEmpresa` cubre las tablas de tenant que esa operación pudiera tocar;
 * la auditoría de plataforma va a `auditoria_plataforma`, fuera de RLS.)
 */
export async function listarEmpresas(): Promise<EmpresaListada[]> {
  const empresas = await prisma.empresa.findMany({
    orderBy: { creadoEn: 'desc' },
    select: {
      id: true,
      nombre: true,
      slug: true,
      estado: true,
      creadoEn: true,
      membresias: {
        where: { predeterminada: true, rol: Rol.administrador },
        select: { usuario: { select: { email: true } } },
        take: 1,
      },
    },
  });
  return empresas.map((e) => ({
    id: e.id,
    nombre: e.nombre,
    slug: e.slug,
    estado: e.estado,
    creadoEn: e.creadoEn.toISOString(),
    adminEmail: e.membresias[0]?.usuario.email ?? null,
  }));
}

/**
 * Genera una contraseña temporal FUERTE (URL-safe, ~24 chars, alta entropía). Se devuelve
 * UNA sola vez en la respuesta; JAMÁS se persiste en claro (solo su hash argon2). Mismo
 * patrón de generación que los tokens del proyecto (randomBytes + base64url).
 */
function generarContrasenaTemporal(): string {
  return randomBytes(18).toString('base64url');
}

/**
 * Resultado de restablecer al admin de una empresa. Superficie MÍNIMA: SOLO la temporal
 * (en CLARO, devuelta UNA vez, nunca persistida/auditada/logueada) y el flag de cambio
 * forzado. NO expone `usuarioId` ni `email` (identidad del objetivo): esos solo se
 * registran en `AuditoriaPlataforma.detalle`, no viajan en la respuesta.
 */
export interface AdminRestablecido {
  contrasenaTemporal: string;
  debeCambiarContrasena: true;
}

/**
 * RESTABLECE la contraseña del admin PRINCIPAL de una empresa (soporte de PLATAFORMA),
 * SIN que el super-admin entre al tenant (a diferencia de la vía de tenant
 * `restablecerContrasena`, que exige cambiar-empresa). Genera una contraseña temporal
 * FUERTE, la hashea (argon2), fuerza el cambio en el primer login
 * (`debeCambiarContrasena=true`) y REVOCA todas las sesiones del admin — todo en una tx.
 *
 * "Admin principal" = la membresía `predeterminada` de rol `administrador` (la MISMA que
 * muestra `listarEmpresas`). Es la vía de recuperación cuando el admin del cliente pierde
 * el acceso y no puede rotarla él mismo por `/auth/cambiar-contrasena`.
 *
 * Reglas de seguridad:
 * - `superAdminId` SIEMPRE del token (nunca del body). El objetivo lo RESUELVE el servidor
 *   (no se pasa usuarioId): la membresía predeterminada+administrador de la empresa.
 * - La contraseña temporal se GENERA en el servidor (no se acepta del body): más fuerte y
 *   sin exponerla en el request. Se devuelve EN CLARO en la respuesta UNA vez; NUNCA se
 *   persiste (solo el hash), ni se audita (`detalle` sin contraseña), ni se loguea.
 * - Respuesta de superficie MÍNIMA: SOLO `{ contrasenaTemporal, debeCambiarContrasena }`.
 *   NO devuelve `usuarioId` ni `email` — la identidad del admin objetivo solo se registra
 *   en `AuditoriaPlataforma.detalle`, nunca en la respuesta.
 * - Auditoría de PLATAFORMA `resetear_password_admin` (`AuditoriaPlataforma`), NO la de
 *   tenant. Actor = super-admin real del token; `empresaAfectadaId` = la empresa.
 * - Errores HONESTOS (super-admin god-view, no anti-enumeración de tenant): empresa
 *   inexistente → 404; empresa NO activa (B3: suspendida O cancelada) → 409 (un admin de
 *   una empresa no activa no puede entrar igualmente, fail-closed); empresa SIN admin predeterminado
 *   → 404; cuenta admin desactivada → 409 (si no, el 200 con temporal sería engañoso: el
 *   login la seguiría rechazando). Objetivo `esSuperAdmin` → 404 (invariante §4.2: una
 *   membresía admin nunca es de una cuenta de plataforma; defensa ante estado corrupto).
 * - MULTI-EMPRESA: NO se rechaza. La contraseña es global, pero la autoridad del
 *   super-admin ES cross-tenant (decisión de plataforma, ver B1) — a diferencia del admin
 *   de tenant, que sí recibe 409 en su propia vía.
 * - Las tablas tocadas (`usuario`, `sesion_refresco`, `auditoria_plataforma`) están TODAS
 *   fuera de RLS (allowlist), así que basta un `$transaction` normal (sin bypass ni GUC).
 * - TOCTOU: dentro de la tx se BLOQUEA la fila del admin (`SELECT … FOR UPDATE`) y se
 *   re-valida `activo` (paridad con `restablecerContrasena` de tenant), cerrando la ventana
 *   pre-check→tx: si otro operador lo desactivó en el intermedio, se aborta con 409 en vez
 *   de un 200 engañoso. El pre-check de `activo` de arriba queda como FAST-PATH.
 */
export async function restablecerAdminEmpresa(
  empresaId: string,
  superAdminId: string,
): Promise<AdminRestablecido> {
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) {
    throw new ErrorNoEncontrado('Empresa no encontrada.');
  }
  // B3: SOLO estado=activa admite el reset (suspendida → 409 "reactivar primero";
  // cancelada → 409 terminal: su admin no volverá a entrar por el flujo normal).
  if (empresa.estado !== EstadoEmpresa.activa) {
    throw new ErrorConflicto(
      'La empresa no está activa: no se puede restablecer su administrador.',
    );
  }
  // Admin PRINCIPAL: la MISMA membresía que expone listarEmpresas (predeterminada + admin).
  const membresia = await prisma.membresia.findFirst({
    where: { empresaId, predeterminada: true, rol: Rol.administrador },
    include: { usuario: true },
  });
  const admin = membresia?.usuario;
  // esSuperAdmin: estado corrupto (§4.2, una membresía admin no es de plataforma) → se
  // trata como "sin admin predeterminado" (mismo 404), nunca se restablece una cuenta de
  // plataforma por aquí.
  if (!admin || admin.esSuperAdmin) {
    throw new ErrorNoEncontrado('La empresa no tiene un administrador predeterminado.');
  }
  if (!admin.activo) {
    throw new ErrorConflicto(
      'La cuenta del administrador está desactivada: reactívala antes de restablecer.',
    );
  }

  // argon2 FUERA de la transacción (es costoso; no hay que tener la tx abierta).
  const contrasenaTemporal = generarContrasenaTemporal();
  const passwordHash = await hashearContrasena(contrasenaTemporal);

  await prisma.$transaction(async (tx) => {
    // Lock de la fila del admin (paridad con restablecerContrasena de tenant): re-valida
    // `activo` BAJO el lock, cerrando la ventana pre-check → tx. Si otro operador desactivó
    // al admin en el intermedio, se aborta con 409 en vez de dejar un 200 engañoso (una
    // temporal que el login rechazaría por cuenta inactiva). El conteo multi-empresa NO se
    // re-chequea: a diferencia del admin de tenant, el super-admin tiene autoridad
    // cross-tenant legítima (no hay escalada que cerrar aquí).
    const filas = await tx.$queryRaw<Array<{ activo: boolean }>>`
      SELECT activo FROM usuario WHERE id = ${admin.id}::uuid FOR UPDATE`;
    if (!filas[0]?.activo) {
      throw new ErrorConflicto(
        'La cuenta del administrador está desactivada: reactívala antes de restablecer.',
      );
    }
    await tx.usuario.update({
      where: { id: admin.id },
      // Temporal born-true (mismo mecanismo que el alta): debe rotarla en el primer login.
      data: { passwordHash, debeCambiarContrasena: true },
    });
    // Expulsa TODAS las sesiones vivas del admin: tras el reset solo entra quien tenga la
    // temporal (p. ej. quien perdió el acceso, o un token robado).
    await tx.sesionRefresco.deleteMany({ where: { usuarioId: admin.id } });
    await auditoriaPlataformaRepo.registrar(
      {
        actorUsuarioId: superAdminId,
        accion: 'resetear_password_admin',
        empresaAfectadaId: empresaId,
        // `detalle` SIN contraseña: jamás en claro. Solo referencia al objetivo.
        detalle: { usuarioId: admin.id, email: admin.email },
      },
      tx,
    );
  });

  // La temporal EN CLARO viaja SOLO aquí (respuesta), una vez. Nunca se persistió.
  // Superficie mínima: sin usuarioId ni email (esos solo van al asiento de auditoría).
  return { contrasenaTemporal, debeCambiarContrasena: true };
}
