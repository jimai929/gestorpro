import { txEmpresa } from '../tenant/contexto.js';
import { ErrorConflicto, ErrorNoEncontrado } from '../errors.js';
import { hashearContrasena } from '../auth/contrasena.js';
import { auditoriaRepo } from '../../shared/repositories/auditoria.repository.js';
import { Rol } from '../../generated/prisma/enums.js';
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
  activo: boolean;
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
 * - `usuarioId` del asiento de auditoría = el super-admin REAL (del token, nunca
 *   del body). El asiento lleva `empresaId` EXPLÍCITO (= la empresa creada): bajo
 *   bypass el GUC de tenant no está fijado, y el DEFAULT de auditoria daría NULL.
 * - `empresa`/`usuario`/`membresia` están EXCLUIDAS de RLS (allowlist), así que se
 *   escriben aunque el GUC de tenant no esté fijado.
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
        await auditoriaRepo.registrar(
          {
            entidad: 'empresa',
            entidadId: empresa.id,
            accion: 'crear_empresa',
            usuarioId: superAdminId,
            empresaId: empresa.id,
            detalle: { nombre: empresa.nombre, slug: empresa.slug, adminEmail: admin.email },
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

/** Respuesta de PATCH /empresas/:id (baja/reactivación lógica del tenant). */
export interface EmpresaEstado {
  id: string;
  nombre: string;
  slug: string;
  activo: boolean;
}

/**
 * Cambia el ESTADO (baja/reactivación LÓGICA vía `Empresa.activo`) de un tenant.
 * Operación de PLATAFORMA (solo super-admin, guard `soloPlataforma` en la ruta).
 * Nunca se borra la empresa: retención legal, todos sus datos la referencian.
 *
 * Efecto de la baja (I5 acotado a empresas):
 * - `resolverContextoActivo` ya rechaza empresas inactivas en login/refresh/
 *   cambiar-empresa (fail-closed preexistente): sin tocar nada más, la baja
 *   surtiría efecto al siguiente refresh (≤15 min).
 * - Aquí ADEMÁS se EXPULSAN las sesiones de refresco de todos los usuarios con
 *   membresía en la empresa (misma tx): el refresh muere al instante y solo queda
 *   el access token residual (≤15 min, tradeoff I5 documentado). Las sesiones de
 *   soporte del super-admin NO se tocan: su refresh cae solo a plataforma
 *   (resolverContextoActivo honra la preferida SOLO si sigue activa).
 * - Reactivar NO toca sesiones (los usuarios simplemente vuelven a poder entrar).
 *
 * Reglas:
 * - Idempotencia ATÓMICA (mismo patrón que cambiarEstadoUsuario): updateMany
 *   condicional dentro de la tx; pedir el estado actual → 200 sin asiento duplicado.
 * - Asiento `desactivar_empresa`/`reactivar_empresa` con `usuarioId` = super-admin
 *   REAL del token y `empresaId` EXPLÍCITO (bajo bypass el GUC no está fijado y
 *   `auditoria.empresa_id` es NOT NULL — mismo criterio que `crearEmpresa`).
 */
export async function cambiarEstadoEmpresa(
  empresaId: string,
  superAdminId: string,
  activo: boolean,
): Promise<EmpresaEstado> {
  const empresa = await prisma.empresa.findUnique({ where: { id: empresaId } });
  if (!empresa) {
    throw new ErrorNoEncontrado('Empresa no encontrada.');
  }

  await txEmpresa(
    async (tx) => {
      // Idempotencia ATÓMICA: solo "gana" si estaba en el estado contrario; dos
      // PATCH concurrentes al mismo estado producen UN solo asiento.
      const cambio = await tx.empresa.updateMany({
        where: { id: empresaId, activo: !activo },
        data: { activo },
      });
      if (cambio.count === 0) {
        return; // ya estaba así: no-op
      }
      if (!activo) {
        // Baja = fuera YA: se expulsan las sesiones de refresco de los usuarios del
        // tenant (por MEMBRESÍA, no por empresaIdActiva: cubre también las sesiones
        // que nunca cambiaron de empresa). El login/refresh ya los rechaza fail-closed.
        await tx.sesionRefresco.deleteMany({
          where: { usuario: { membresias: { some: { empresaId } } } },
        });
      }
      await auditoriaRepo.registrar(
        {
          entidad: 'empresa',
          entidadId: empresaId,
          accion: activo ? 'reactivar_empresa' : 'desactivar_empresa',
          usuarioId: superAdminId,
          empresaId, // EXPLÍCITO: bajo bypass el GUC de tenant no está fijado
          detalle: { activo },
        },
        tx,
      );
    },
    { bypassPlataforma: true },
  );
  return { id: empresa.id, nombre: empresa.nombre, slug: empresa.slug, activo };
}

/**
 * Lista todas las empresas (tenants) para el super-admin, con el correo del primer admin
 * de cada una (la membresía `predeterminada` de rol `administrador` que crea `crearEmpresa`).
 * Orden: más reciente primero.
 *
 * NO usa txEmpresa/bypass: `empresa`, `membresia` y `usuario` están EXCLUIDAS de RLS, así
 * que `gestorpro_app` las lee y hace el join directamente. El aislamiento de este listado
 * cross-tenant lo garantiza el guard de RUTA `soloPlataforma` (solo super-admin), NO la RLS.
 * (El bypass de `crearEmpresa` era para ESCRIBIR en `auditoria`, que sí tiene RLS.)
 */
export async function listarEmpresas(): Promise<EmpresaListada[]> {
  const empresas = await prisma.empresa.findMany({
    orderBy: { creadoEn: 'desc' },
    select: {
      id: true,
      nombre: true,
      slug: true,
      activo: true,
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
    activo: e.activo,
    creadoEn: e.creadoEn.toISOString(),
    adminEmail: e.membresias[0]?.usuario.email ?? null,
  }));
}
