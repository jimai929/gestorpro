import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '../prisma.js';
import { ErrorAutenticacion } from '../errors.js';
import { verificarContrasena } from './contrasena.js';
import type { Rol } from '../../generated/prisma/enums.js';
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

function aUsuarioPublico(usuario: {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
}): UsuarioPublico {
  return {
    id: usuario.id,
    nombre: usuario.nombre,
    email: usuario.email,
    rol: usuario.rol,
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

      const accessToken = firmarAccess({ sub: usuario.id, rol: usuario.rol });

      // Refresh token opaco: aleatorio, se guarda hasheado y es revocable.
      const refreshToken = randomBytes(48).toString('base64url');
      const expiraEn = new Date(
        Date.now() + DIAS_REFRESH * 24 * 60 * 60 * 1000,
      );
      await prisma.sesionRefresco.create({
        data: {
          usuarioId: usuario.id,
          tokenHash: hashearToken(refreshToken),
          expiraEn,
        },
      });

      return { accessToken, refreshToken, usuario: aUsuarioPublico(usuario) };
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

      const accessToken = firmarAccess({
        sub: sesion.usuario.id,
        rol: sesion.usuario.rol,
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
