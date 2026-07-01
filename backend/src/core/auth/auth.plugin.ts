import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ErrorAutorizacion } from '../errors.js';
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
      // Tras verificar, transportar el contexto de tenant del TOKEN (nunca del
      // body) al store que `onRequest` (iniciarContextoTenant) ya creó para esta
      // request: se MUTA, no se re-entra, para no perder el contexto bajo
      // concurrencia. txEmpresa lo lee al abrir cada transacción y fija el GUC de
      // RLS. Rutas SIN `autenticar` quedan con el store vacío → fail-closed.
      actualizarContextoTenant({
        empresaId: request.user.empresaId,
        esSuperAdmin: request.user.esSuperAdmin,
      });

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
      // Super-admin DENTRO de una empresa (entró vía cambiar-empresa, §4.4 modo 1):
      // pasa cualquier guard de rol — su poder viene de `esSuperAdmin`, no del rol
      // del token (que viaja como `empleado`, mínimo privilegio). Con empresaId=null
      // NO pasa: fuera de un tenant no opera rutas de tenant (fail-closed, igual que
      // la RLS); sus rutas propias van por `soloPlataforma`.
      if (usuario?.esSuperAdmin === true && usuario.empresaId != null) {
        return;
      }
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
