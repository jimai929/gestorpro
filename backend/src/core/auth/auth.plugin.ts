import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ErrorAutorizacion } from '../errors.js';
import { prisma } from '../prisma.js';
import { actualizarContextoTenant } from '../tenant/contexto.js';
import type { PayloadAccess } from './auth.tipos.js';
import type { Rol } from '../../generated/prisma/enums.js';

// El payload que firmamos y lo que queda en request.user tras verificar.
declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: PayloadAccess;
    user: PayloadAccess;
  }
}

// Decoradores que este plugin agrega a la instancia de Fastify.
declare module 'fastify' {
  interface FastifyInstance {
    /** preHandler: verifica el access token y puebla request.user. */
    autenticar: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** Crea un guard que exige que el usuario tenga uno de los roles dados. */
    autorizar: (
      ...roles: Rol[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    /** preHandler: exige super-admin de plataforma. Responde 404 si no lo es. */
    soloPlataforma: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Rutas EXENTAS del bloqueo por `debeCambiarContrasena` (allowlist EXPLÍCITA). Sin el
 * propio cambio de contraseña el usuario quedaría ENCERRADO (no podría rotar su clave →
 * deadlock); las de sesión/identidad se eximen por el mismo motivo. Cualquier OTRA ruta
 * autenticada queda bloqueada por defecto. `/auth/logout` y `/auth/refresh` ni siquiera
 * pasan por `autenticar`, pero se listan para que la intención quede explícita.
 */
const RUTAS_EXENTAS_CAMBIO = new Set<string>([
  '/auth/cambiar-contrasena',
  '/auth/me',
  '/auth/logout',
  '/auth/refresh',
]);

/**
 * Contrato de error del bloqueo por contraseña temporal. El `codigo` es ESTABLE: el
 * front (Commit 3) lo usa para redirigir al cambio forzado. NO cambiar sin coordinar.
 */
const ERROR_DEBE_CAMBIAR = {
  codigo: 'DEBE_CAMBIAR_CONTRASENA',
  mensaje: 'Debes cambiar tu contraseña temporal antes de continuar.',
} as const;

async function pluginAuth(app: FastifyInstance): Promise<void> {
  const secreto = process.env.JWT_ACCESS_SECRET;
  if (!secreto) {
    throw new Error('Falta JWT_ACCESS_SECRET en el entorno.');
  }

  await app.register(fastifyJwt, { secret: secreto });

  // Verifica el access token de la cabecera Authorization: Bearer <token>.
  // Si es inválido o falta, corta con 401. Si es válido, deja request.user.
  app.decorate(
    'autenticar',
    async function (request: FastifyRequest, reply: FastifyReply) {
      try {
        await request.jwtVerify();
      } catch {
        await reply.code(401).send({ mensaje: 'No autenticado.' });
        return;
      }
      // B4 — SUPER-ADMIN NUNCA EN CONTEXTO DE TENANT (cierre central). Un access token
      // con esSuperAdmin=true Y empresaId!=null NO debería existir tras B4 (cambiarEmpresa
      // lo rechaza y resolverContextoActivo resuelve a null para el super-admin), PERO un
      // token RESIDUAL firmado ANTES del despliegue podría llevarlo. Se rechaza aquí con
      // 403 —"las cuentas de plataforma no operan dentro de una empresa"— SIN esperar su
      // TTL: el super-admin solo opera la plataforma y jamás porta contexto de negocio.
      // Va ANTES de poblar la ALS: ese contexto de tenant nunca llega a fijarse.
      if (request.user.esSuperAdmin === true && request.user.empresaId !== null) {
        await reply
          .code(403)
          .send({ mensaje: 'Las cuentas de plataforma no operan dentro de una empresa.' });
        return;
      }
      // Tras verificar, transportar el contexto de tenant del TOKEN (nunca del
      // body) al store que `onRequest` (iniciarContextoTenant) ya creó para esta
      // request: se MUTA, no se re-entra, para no perder el contexto bajo
      // concurrencia. txEmpresa lo lee al abrir cada transacción y fija el GUC de
      // RLS. Rutas SIN `autenticar` quedan con el store vacío → fail-closed.
      actualizarContextoTenant({
        empresaId: request.user.empresaId,
        esSuperAdmin: request.user.esSuperAdmin,
      });

      // I5 — REVOCACIÓN INMEDIATA (decisión #5, cerrada 2026-07-03): el access token
      // deja de valer en cuanto la empresa se da de baja o el super-admin pierde el
      // flag, sin esperar su TTL (≤15 min). Coste: una consulta por PK por request
      // (dos si el token reclama super-admin); `empresa` y `usuario` están fuera de
      // RLS, así que el cliente plano las lee sin contexto. Alcance HONESTO: el
      // `activo` de un usuario NORMAL no se chequea por request — su baja ya expulsa
      // todas sus sesiones y el residuo ≤15 min es el tradeoff documentado; I5 cubre
      // los dos casos donde el residuo era inaceptable (tenant entero / poder de
      // plataforma). Fail-closed: empresa o cuenta inexistentes cuentan como
      // revocadas. El 401 dispara el refresh-on-401 del cliente: el usuario normal
      // cae al login (sus sesiones ya no existen) y el super-admin de soporte vuelve
      // solo a plataforma (resolverContextoActivo deja de honrar la preferida).
      const { empresaId, esSuperAdmin, sub } = request.user;
      try {
        if (empresaId !== null) {
          const empresa = await prisma.empresa.findUnique({
            where: { id: empresaId },
            select: { activo: true },
          });
          if (!empresa?.activo) {
            await reply.code(401).send({ mensaje: 'No autenticado.' });
            return;
          }
        }
        if (esSuperAdmin === true) {
          const cuenta = await prisma.usuario.findUnique({
            where: { id: sub },
            select: { esSuperAdmin: true, activo: true },
          });
          if (!cuenta?.esSuperAdmin || !cuenta.activo) {
            await reply.code(401).send({ mensaje: 'No autenticado.' });
            return;
          }
        }
      } catch (error) {
        // Un hipo de la BD aquí escaparía al error handler POR DEFECTO de Fastify,
        // que responde 500 con el mensaje CRUDO de Prisma (host/puerto internos) en
        // TODA ruta autenticada. Se sanea: error genérico, detalle solo al log.
        request.log.error(error, 'fallo de BD en el check I5 de autenticar');
        await reply.code(500).send({ mensaje: 'Error interno.' });
        return;
      }

      // Cambio de contraseña FORZADO (Commit 2): si la cuenta tiene una contraseña
      // TEMPORAL (debeCambiarContrasena) y la ruta NO está en la allowlist, se bloquea
      // TODO con 403 hasta rotarla. Vive aquí —el paso común de TODA ruta autenticada—
      // para lograr DEFAULT-BLOCK: cualquier endpoint nuevo queda cubierto sin registrarlo;
      // la única salida es la allowlist /auth/* de autoservicio. Un token viejo SIN el
      // campo cuenta como `false` (?? false) → no se bloquea (sin lock-out en el despliegue).
      const ruta = request.url.split('?')[0] ?? request.url;
      if ((request.user.debeCambiarContrasena ?? false) && !RUTAS_EXENTAS_CAMBIO.has(ruta)) {
        await reply.code(403).send(ERROR_DEBE_CAMBIAR);
        return;
      }
    },
  );

  // Guard de autorización por rol. Se usa SIEMPRE después de `autenticar`.
  app.decorate('autorizar', function (...roles: Rol[]) {
    return async function (request: FastifyRequest, reply: FastifyReply) {
      const usuario = request.user;
      // B4: NO hay bypass de super-admin. El super-admin NUNCA porta un contexto de
      // tenant (autenticar rechaza esSuperAdmin+empresaId!=null; su token siempre trae
      // empresaId=null), así que cae aquí como cualquier otro y su rol `empleado` no
      // abre rutas de tenant → fail-closed. Sus operaciones de plataforma van por
      // `soloPlataforma`, no por `autorizar`.
      if (!usuario || !roles.includes(usuario.rol)) {
        await reply.code(403).send({ mensaje: new ErrorAutorizacion().message });
      }
    };
  });

  // Guard de PLATAFORMA: exige esSuperAdmin (del token). Responde 404 (no 403) para
  // NO revelar la EXISTENCIA de los endpoints de plataforma a quien no es super-admin
  // (anti-enumeración, mismo criterio que el aislamiento cross-tenant). Se usa SIEMPRE
  // después de `autenticar`.
  app.decorate(
    'soloPlataforma',
    async function (request: FastifyRequest, reply: FastifyReply) {
      if (!request.user?.esSuperAdmin) {
        await reply.code(404).send({ mensaje: 'No encontrado.' });
        return;
      }
    },
  );
}

/**
 * Plugin de autenticación. Envuelto con fastify-plugin para que sus decoradores
 * (`autenticar`, `autorizar`, `app.jwt`) queden disponibles en toda la app, no
 * solo en un contexto encapsulado.
 */
export const authPlugin = fp(pluginAuth, { name: 'auth' });
