import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../prisma.js';
import { ErrorAutenticacion, ErrorValidacion } from '../errors.js';
import { hashearContrasena, verificarContrasena } from './contrasena.js';
import { txEmpresa } from '../tenant/contexto.js';
import { auditoriaRepo } from '../../shared/repositories/auditoria.repository.js';
import { Rol } from '../../generated/prisma/enums.js';
import type {
  PayloadAccess,
  ResultadoLogin,
  UsuarioPublico,
} from './auth.tipos.js';

const DIAS_REFRESH = Number(process.env.REFRESH_TOKEN_TTL_DIAS ?? 30);

/** Firma un access token a partir de su payload. La inyecta el plugin de auth. */
export type FirmadorAccess = (payload: PayloadAccess) => string;

/** Hash determinista del refresh token: lo que se guarda, nunca el token en claro. */
function hashearToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Contexto de tenant activo de una sesión: empresa activa + rol EFECTIVO en ella.
 * SIEMPRE se resuelve en el servidor a partir de las membresías del usuario;
 * nunca llega del cliente (misma regla que `usuarioId`).
 */
interface ContextoActivo {
  empresaId: string | null;
  rol: Rol;
}

/**
 * Resuelve la empresa activa y el rol efectivo de un usuario, en el servidor:
 * - Prefiere `preferidaEmpresaId` si el usuario tiene membresía ahí (lo usa el
 *   refresh para conservar la empresa activa de la sesión); si no, la membresía
 *   marcada `predeterminada` (orden: predeterminada primero, luego la más antigua).
 * - Super-admin sin membresía válida: `empresaId = null`, `rol = empleado`
 *   (mínimo privilegio; su poder viene de `esSuperAdmin`, no del rol).
 * - Usuario normal sin membresía válida: NO puede operar → `ErrorAutenticacion`.
 * Valida que la empresa activa esté `activo`: a un tenant dado de baja no se entra.
 */
async function resolverContextoActivo(
  usuario: { id: string; esSuperAdmin: boolean },
  preferidaEmpresaId?: string | null,
): Promise<ContextoActivo> {
  const membresias = await prisma.membresia.findMany({
    where: { usuarioId: usuario.id },
    orderBy: [{ predeterminada: 'desc' }, { creadoEn: 'asc' }],
  });

  const activa =
    (preferidaEmpresaId != null
      ? membresias.find((m) => m.empresaId === preferidaEmpresaId)
      : undefined) ?? membresias[0];

  const sinTenant = (): ContextoActivo => {
    if (usuario.esSuperAdmin) return { empresaId: null, rol: Rol.empleado };
    throw new ErrorAutenticacion();
  };

  if (!activa) return sinTenant();

  const empresa = await prisma.empresa.findUnique({
    where: { id: activa.empresaId },
  });
  // Empresa inexistente o dada de baja (`activo=false`): no se entra a ese tenant.
  if (!empresa || !empresa.activo) return sinTenant();

  return { empresaId: activa.empresaId, rol: activa.rol };
}

function aUsuarioPublico(
  usuario: {
    id: string;
    nombre: string;
    email: string;
    esSuperAdmin: boolean;
    debeCambiarContrasena: boolean;
  },
  contexto: ContextoActivo,
): UsuarioPublico {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: contexto.rol,
    empresaId: contexto.empresaId,
    esSuperAdmin: usuario.esSuperAdmin,
    debeCambiarContrasena: usuario.debeCambiarContrasena,
  };
}

/**
 * Servicio de autenticación. Concentra la verificación de credenciales y la
 * gestión de sesiones de refresco. El firmado del access token se inyecta
 * desde el plugin (que es quien tiene el secreto y la instancia de @fastify/jwt).
 */
export function crearServicioAuth(firmarAccess: FirmadorAccess) {
  return {
    /** Verifica email + contraseña y emite access + refresh token. */
    async iniciarSesion(
      email: string,
      contrasena: string,
    ): Promise<ResultadoLogin> {
      const usuario = await prisma.usuario.findUnique({ where: { email } });
      if (!usuario || !usuario.activo) {
        throw new ErrorAutenticacion();
      }

      const coincide = await verificarContrasena(
        usuario.passwordHash,
        contrasena,
      );
      if (!coincide) {
        throw new ErrorAutenticacion();
      }

      // Empresa activa y rol efectivo SIEMPRE del servidor (membresías).
      const contexto = await resolverContextoActivo(usuario);

      const accessToken = firmarAccess({
        sub: usuario.id,
        rol: contexto.rol,
        empresaId: contexto.empresaId,
        esSuperAdmin: usuario.esSuperAdmin,
        debeCambiarContrasena: usuario.debeCambiarContrasena,
      });

      // Refresh token opaco: aleatorio, se guarda hasheado y es revocable. Guarda
      // la empresa activa para conservarla entre refrescos (cambiar-empresa: Fase 4c).
      const refreshToken = randomBytes(48).toString('base64url');
      const expiraEn = new Date(
        Date.now() + DIAS_REFRESH * 24 * 60 * 60 * 1000,
      );
      await prisma.sesionRefresco.create({
        data: {
          usuarioId: usuario.id,
          empresaIdActiva: contexto.empresaId,
          tokenHash: hashearToken(refreshToken),
          expiraEn,
        },
      });

      return {
        accessToken,
        refreshToken,
        usuario: aUsuarioPublico(usuario, contexto),
      };
    },

    /** Emite un nuevo access token a partir de un refresh token válido. */
    async refrescarAcceso(
      refreshToken: string,
    ): Promise<{ accessToken: string }> {
      const sesion = await prisma.sesionRefresco.findUnique({
        where: { tokenHash: hashearToken(refreshToken) },
        include: { usuario: true },
      });
      if (
        !sesion ||
        sesion.expiraEn.getTime() < Date.now() ||
        !sesion.usuario.activo
      ) {
        throw new ErrorAutenticacion('Sesión inválida o expirada.');
      }

      // Re-resuelve el contexto conservando la empresa activa de la sesión si el
      // usuario aún tiene membresía ahí; re-lee el rol (refleja cambios) y valida
      // `activo`. Si perdió todas las membresías (revocación), un usuario normal
      // deja de poder refrescar — la revocación surte efecto al siguiente refresh.
      const contexto = await resolverContextoActivo(
        sesion.usuario,
        sesion.empresaIdActiva,
      );

      const accessToken = firmarAccess({
        sub: sesion.usuario.id,
        rol: contexto.rol,
        empresaId: contexto.empresaId,
        esSuperAdmin: sesion.usuario.esSuperAdmin,
        debeCambiarContrasena: sesion.usuario.debeCambiarContrasena,
      });
      return { accessToken };
    },

    /** Invalida el refresh token borrando su sesión. Idempotente. */
    async cerrarSesion(refreshToken: string): Promise<void> {
      await prisma.sesionRefresco.deleteMany({
        where: { tokenHash: hashearToken(refreshToken) },
      });
    },
  };
}

/**
 * Autoservicio: el usuario autenticado cambia su PROPIA contraseña. El
 * `usuarioId` SIEMPRE viene del token (request.user.sub), NUNCA del body: es
 * contexto de seguridad, igual que en el resto de la app.
 *
 * Reglas:
 * - Verifica `contrasenaActual` contra el hash guardado (argon2). Si falla —usuario
 *   inexistente, inactivo o contraseña incorrecta— lanza un error GENÉRICO
 *   (`ErrorAutenticacion`, 401) que NO distingue entre esos casos.
 * - `contrasenaNueva` debe diferir de la actual. La fortaleza (longitud mínima) la
 *   valida el schema de la ruta, igual que al crear la cuenta: aquí no se re-implementa.
 * - Actualiza el hash, REVOCA todas las sesiones de refresco del usuario y deja un
 *   asiento de auditoría `cambiar_contrasena`, todo en la MISMA transacción (todo o
 *   nada). NUNCA se registra ninguna contraseña en claro.
 *
 * No toca `empresaId`, membresías, `rol` ni `esSuperAdmin`.
 */
export async function cambiarContrasena(
  usuarioId: string,
  contrasenaActual: string,
  contrasenaNueva: string,
): Promise<void> {
  const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
  // Error GENÉRICO: no revelar si el usuario existe ni si la contraseña fue la causa.
  if (!usuario || !usuario.activo) {
    throw new ErrorAutenticacion();
  }
  const coincide = await verificarContrasena(usuario.passwordHash, contrasenaActual);
  if (!coincide) {
    throw new ErrorAutenticacion();
  }
  // La nueva no puede ser igual a la actual (verificada arriba): evita "cambios" nulos.
  if (contrasenaNueva === contrasenaActual) {
    throw new ErrorValidacion('La nueva contraseña debe ser distinta de la actual.');
  }

  // argon2 FUERA de la transacción (es costoso; no hay que tener la tx abierta).
  const nuevoHash = await hashearContrasena(contrasenaNueva);
  await txEmpresa(async (tx) => {
    await tx.usuario.update({
      where: { id: usuarioId },
      // Al rotar la contraseña se limpia la obligación de cambiarla (primer login resuelto).
      data: { passwordHash: nuevoHash, debeCambiarContrasena: false },
    });
    // Revoca TODAS las sesiones de refresco del usuario: cambiar la contraseña expulsa
    // cualquier sesión viva (p. ej. un refresh token robado), no solo la actual. La tabla
    // sesion_refresco está fuera de RLS de tenant (como usuario), así que el deleteMany
    // por usuarioId funciona bajo el GUC de la tx.
    await tx.sesionRefresco.deleteMany({ where: { usuarioId } });
    await auditoriaRepo.registrar(
      {
        entidad: 'usuario',
        entidadId: usuarioId,
        accion: 'cambiar_contrasena',
        usuarioId,
        // empresa_id lo rellena el DEFAULT desde el GUC de tenant (txEmpresa, del
        // token). `detalle` se OMITE a propósito: jamás se guarda contraseña alguna.
      },
      tx,
    );
  });
}
