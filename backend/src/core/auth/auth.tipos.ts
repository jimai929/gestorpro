import type { Rol } from '../../generated/prisma/enums.js';

/** Datos del usuario que viajan al cliente. Sin hash ni secretos. */
export interface UsuarioPublico {
  id: string;
  nombre: string;
  email: string;
  rol: Rol;
}

/** Contenido firmado dentro del access token. No lleva datos sensibles. */
export interface PayloadAccess {
  sub: string;
  rol: Rol;
}

/** Resultado de un inicio de sesión correcto. */
export interface ResultadoLogin {
  accessToken: string;
  refreshToken: string;
  usuario: UsuarioPublico;
}
