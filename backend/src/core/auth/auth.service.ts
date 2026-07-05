import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../prisma.js';
import { ErrorAutenticacion, ErrorAutorizacion, ErrorValidacion } from '../errors.js';
import { hashearContrasena, verificarContrasena } from './contrasena.js';
import { txEmpresa } from '../tenant/contexto.js';
import { auditoriaRepo } from '../../shared/repositories/auditoria.repository.js';
import { auditoriaPlataformaRepo } from '../../shared/repositories/auditoria-plataforma.repository.js';
import { Rol } from '../../generated/prisma/enums.js';
import type {
  MembresiaPublica,
  PayloadAccess,
  ResultadoCambioEmpresa,
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
  /** Nombre de la empresa activa (para el front); null si no hay empresa (super-admin). */
  empresaNombre: string | null;
  rol: Rol;
  /** Membresías en empresas ACTIVAS (selector del front). Super-admin: []. */
  membresias: MembresiaPublica[];
}

/**
 * Resuelve la empresa activa y el rol efectivo de un usuario, en el servidor:
 * - Solo cuentan las membresías de empresas ACTIVAS para el selector; la ELECCIÓN
 *   del contexto depende de `conFallback`:
 *   · LOGIN (`conFallback=true`): si la predeterminada cayó, se sigue con la
 *     SIGUIENTE activa — la baja de un tenant ya no bloquea al usuario de sus
 *     otras empresas (cierra el lockout de BUGS_PREEXISTENTES). El login es un
 *     acto EXPLÍCITO del usuario: conmutar aquí es visible y esperable.
 *   · REFRESH (`conFallback=false`): NADA de conmutación silenciosa. Si la empresa
 *     de la sesión cayó, el refresh FALLA (401) y el usuario re-loguea — un
 *     fallback aquí dejaría que el retry-on-401 del cliente RE-EJECUTARA una
 *     mutación en vuelo contra OTRA empresa (dinero al tenant equivocado,
 *     hallazgo del revisor). Fail-closed: fallo visible > conmutación invisible.
 * - Prefiere `preferidaEmpresaId` si el usuario tiene membresía ahí (lo usa el
 *   refresh para conservar la empresa de la sesión); si no, la membresía marcada
 *   `predeterminada` (orden: predeterminada primero, luego la más antigua).
 * - Super-admin: SIEMPRE `empresaId = null` (su lugar es la plataforma). B4 eliminó el
 *   "honrar la preferida" que dejaba entrar/sobrevivir la sesión de soporte a un tenant;
 *   sin membresía activa cae a `sinTenant()`. Su poder viene de `esSuperAdmin`, no del rol.
 * - Usuario normal sin contexto elegible: NO puede operar → `ErrorAutenticacion`.
 * Devuelve además las membresías activas (para el selector del front).
 */
async function resolverContextoActivo(
  usuario: { id: string; esSuperAdmin: boolean },
  preferidaEmpresaId?: string | null,
  conFallback = false,
): Promise<ContextoActivo> {
  const membresias = await prisma.membresia.findMany({
    where: { usuarioId: usuario.id },
    orderBy: [{ predeterminada: 'desc' }, { creadoEn: 'asc' }],
    // El estado y el nombre de la empresa vienen en el MISMO include: se elimina la
    // segunda consulta que hacía falta antes para validar `activo`.
    include: { empresa: { select: { nombre: true, activo: true } } },
  });

  // El selector solo muestra empresas ACTIVAS.
  const candidatas = membresias.filter((m) => m.empresa.activo);
  const publicas: MembresiaPublica[] = candidatas.map((m) => ({
    empresaId: m.empresaId,
    empresaNombre: m.empresa.nombre,
    rol: m.rol,
  }));

  let activa: (typeof membresias)[number] | undefined;
  if (conFallback) {
    // LOGIN: se elige entre las ACTIVAS (la preferida si sirve; si no, la primera).
    activa =
      (preferidaEmpresaId != null
        ? candidatas.find((m) => m.empresaId === preferidaEmpresaId)
        : undefined) ?? candidatas[0];
  } else {
    // REFRESH: la elegida es LA DE SIEMPRE (preferida de la sesión o predeterminada);
    // si SU empresa está inactiva NO se conmuta a otra — se cae a sinTenant (401 para
    // el usuario normal, que re-loguea y AHÍ sí obtiene el fallback, ya visible).
    const elegida =
      (preferidaEmpresaId != null
        ? membresias.find((m) => m.empresaId === preferidaEmpresaId)
        : undefined) ?? membresias[0];
    activa = elegida?.empresa.activo ? elegida : undefined;
  }

  const sinTenant = (): ContextoActivo => {
    if (usuario.esSuperAdmin) {
      return { empresaId: null, empresaNombre: null, rol: Rol.empleado, membresias: [] };
    }
    throw new ErrorAutenticacion();
  };

  if (!activa) {
    // B4: el super-admin NUNCA entra a un tenant. Ya NO se honra `preferidaEmpresaId`
    // para él (antes sobrevivía la "sesión de soporte" al refresh): sin membresía activa
    // cae SIEMPRE a `sinTenant()` → empresaId=null. Su lugar es la plataforma.
    return sinTenant();
  }

  return {
    empresaId: activa.empresaId,
    empresaNombre: activa.empresa.nombre,
    rol: activa.rol,
    membresias: publicas,
  };
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
    empresaNombre: contexto.empresaNombre,
    esSuperAdmin: usuario.esSuperAdmin,
    debeCambiarContrasena: usuario.debeCambiarContrasena,
    membresias: contexto.membresias,
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

      // Empresa activa y rol efectivo SIEMPRE del servidor (membresías). Con
      // fallback: el login es explícito, conmutar a otra empresa activa es visible.
      const contexto = await resolverContextoActivo(usuario, null, true);

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
      // `activo`. SIN fallback (a propósito): si la empresa de la sesión cayó, el
      // refresh FALLA en vez de conmutar en silencio a otra — el retry-on-401 del
      // cliente re-ejecutaría la petición en vuelo contra la empresa equivocada.
      // El usuario re-loguea y el LOGIN (con fallback) lo lleva a su otra empresa.
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

    /**
     * Cambia la EMPRESA ACTIVA de la sesión (Fase 4c, §3.5). Aquí `empresaIdDestino`
     * SÍ viene del body, pero como *petición de cambio de contexto sujeta a
     * autorización*: se verifica contra las membresías en la BD (o `esSuperAdmin`),
     * y el aislamiento sigue saliendo del TOKEN emitido, nunca de lo que pida el
     * cliente. `usuarioId` y `empresaIdAnterior` salen del token (request.user).
     *
     * Reglas (B4):
     * - Entrar a un tenant (destino != null) EXIGE membresía SIEMPRE. El super-admin
     *   NUNCA tiene membresía → 403: no puede entrar a ninguna empresa (queda en la
     *   plataforma). Usuario normal sin membresía en la destino → mismo 403.
     * - `null` (volver a plataforma) sigue siendo solo del super-admin (no-op cuando ya
     *   está en plataforma, que es su único estado tras B4); a un usuario normal se le veda.
     * - Denegación con mensaje ÚNICO (inexistente = inactiva = sin membresía): no
     *   revela la existencia de otros tenants (anti-enumeración, §6).
     * - Actualiza `empresaIdActiva` de TODAS las sesiones del usuario: la empresa
     *   activa es preferencia de USUARIO, no de dispositivo (el access token no
     *   identifica una sesión concreta: no lleva claim de sesión).
     * - Asiento `cambiar_empresa` bajo la empresa DESTINO (o la que se deja, al
     *   volver a plataforma), con el usuarioId real — rastro del §4.4 modo 1.
     */
    async cambiarEmpresa(
      usuarioId: string,
      empresaIdDestino: string | null,
      empresaIdAnterior: string | null,
    ): Promise<ResultadoCambioEmpresa> {
      const usuario = await prisma.usuario.findUnique({ where: { id: usuarioId } });
      if (!usuario || !usuario.activo) {
        throw new ErrorAutenticacion();
      }

      // Membresías ACTIVAS para el UsuarioPublico de la respuesta: el selector del
      // front debe seguir mostrando TODAS las empresas propias tras el cambio.
      // Super-admin: [] (invariante §4.2), sin consulta.
      const membresiasPublicas: MembresiaPublica[] = usuario.esSuperAdmin
        ? []
        : (
            await prisma.membresia.findMany({
              where: { usuarioId, empresa: { activo: true } },
              orderBy: [{ predeterminada: 'desc' }, { creadoEn: 'asc' }],
              include: { empresa: { select: { nombre: true } } },
            })
          ).map((m) => ({ empresaId: m.empresaId, empresaNombre: m.empresa.nombre, rol: m.rol }));

      let contexto: ContextoActivo;
      if (empresaIdDestino === null) {
        // "Volver a plataforma": solo super-admin (un usuario normal SIEMPRE opera
        // dentro de una empresa; sin tenant no tendría nada que ver ni hacer).
        if (!usuario.esSuperAdmin) {
          throw new ErrorAutorizacion('No tienes acceso a esa empresa.');
        }
        contexto = { empresaId: null, empresaNombre: null, rol: Rol.empleado, membresias: [] };
      } else {
        const membresia = await prisma.membresia.findUnique({
          where: { usuarioId_empresaId: { usuarioId, empresaId: empresaIdDestino } },
        });
        // B4: se EXIGE membresía SIEMPRE (se quitó la exención de super-admin). El
        // super-admin nunca tiene membresía → 403: no puede entrar a ningún tenant. Un
        // usuario normal sin membresía en la destino → mismo 403 (anti-enumeración).
        if (!membresia) {
          throw new ErrorAutorizacion('No tienes acceso a esa empresa.');
        }
        const empresa = await prisma.empresa.findUnique({
          where: { id: empresaIdDestino },
        });
        // Mismo mensaje que "sin membresía": no confirma si la empresa existe.
        if (!empresa || !empresa.activo) {
          throw new ErrorAutorizacion('No tienes acceso a esa empresa.');
        }
        contexto = {
          empresaId: empresa.id,
          empresaNombre: empresa.nombre,
          rol: membresia.rol,
          membresias: membresiasPublicas,
        };
      }

      // Empresa del asiento: la destino al entrar; la que se DEJA al volver a
      // plataforma. Ambas null (plataforma → plataforma) = no-op sin auditar.
      const empresaAsiento = contexto.empresaId ?? empresaIdAnterior;

      await txEmpresa(
        async (tx) => {
          await tx.sesionRefresco.updateMany({
            where: { usuarioId },
            data: { empresaIdActiva: contexto.empresaId },
          });
          if (empresaAsiento) {
            await auditoriaRepo.registrar(
              {
                entidad: 'empresa',
                entidadId: empresaAsiento,
                accion: 'cambiar_empresa',
                usuarioId,
                // Explícito (patrón crear_empresa): el GUC del override lo cubriría,
                // pero así el asiento no depende de cómo se abrió la transacción.
                empresaId: empresaAsiento,
                detalle: { desde: empresaIdAnterior, hacia: contexto.empresaId },
              },
              tx,
            );
          }
        },
        // GUC = empresa del asiento (validada arriba): la RLS de auditoria exige que
        // el GUC coincida con el empresa_id insertado. sesion_refresco está fuera de
        // RLS, así que el updateMany funciona con o sin GUC.
        { empresaId: empresaAsiento },
      );

      const accessToken = firmarAccess({
        sub: usuario.id,
        rol: contexto.rol,
        empresaId: contexto.empresaId,
        esSuperAdmin: usuario.esSuperAdmin,
        debeCambiarContrasena: usuario.debeCambiarContrasena,
      });
      return { accessToken, usuario: aUsuarioPublico(usuario, contexto) };
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
 * - B5: un super-admin (cuenta de PLATAFORMA, empresaId=null, sin tenant) audita en
 *   `AuditoriaPlataforma` (empresa_afectada_id null) con un `$transaction` normal —NO en
 *   la `Auditoria` de tenant, cuyo `empresa_id` NOT NULL saldría del GUC de tenant que
 *   aquí no está fijado (rompería). usuario/sesion_refresco/auditoria_plataforma están
 *   fuera de RLS, así que no necesitan contexto de tenant.
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

  if (usuario.esSuperAdmin) {
    // Cuenta de PLATAFORMA: bitácora de plataforma, sin contexto de tenant. Mismo efecto
    // (rota hash, limpia debeCambiarContrasena, expulsa TODAS las sesiones) en una sola tx.
    await prisma.$transaction(async (tx) => {
      await tx.usuario.update({
        where: { id: usuarioId },
        data: { passwordHash: nuevoHash, debeCambiarContrasena: false },
      });
      await tx.sesionRefresco.deleteMany({ where: { usuarioId } });
      await auditoriaPlataformaRepo.registrar(
        {
          actorUsuarioId: usuarioId,
          accion: 'cambiar_contrasena',
          // empresaAfectadaId se OMITE (null): es la propia cuenta de plataforma, sin
          // empresa objeto. `detalle` se OMITE: jamás se guarda contraseña alguna.
        },
        tx,
      );
    });
    return;
  }

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
