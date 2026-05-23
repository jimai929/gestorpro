/**
 * Cliente HTTP centralizado hacia el backend de GestorPro.
 *
 * - La URL base viene de la variable de entorno VITE_API_URL (con default local).
 * - El access token se inyecta automáticamente en el header Authorization.
 * - El token se almacena en memoria (no en localStorage) por seguridad.
 */

const URL_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/** Token de acceso almacenado en memoria (no persiste entre recargas). */
let accessTokenEnMemoria: string | null = null;

/** Establece el access token en memoria. */
export function fijarAccessToken(token: string | null): void {
  accessTokenEnMemoria = token;
}

/** Devuelve el access token actual (puede ser null si no hay sesión). */
export function obtenerAccessToken(): string | null {
  return accessTokenEnMemoria;
}

/** Opciones extendidas para las peticiones del cliente. */
export interface OpcionesPeticion extends RequestInit {
  omitirAuth?: boolean;
}

/**
 * Realiza una petición HTTP al backend.
 * Lanza un error con el mensaje del backend si la respuesta no es 2xx.
 */
export async function peticion<T>(
  ruta: string,
  opciones: OpcionesPeticion = {},
): Promise<T> {
  const { omitirAuth = false, headers: cabecerasExtra, ...restoOpciones } = opciones;

  const cabeceras: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(cabecerasExtra as Record<string, string>),
  };

  if (!omitirAuth && accessTokenEnMemoria) {
    cabeceras['Authorization'] = `Bearer ${accessTokenEnMemoria}`;
  }

  const respuesta = await fetch(`${URL_BASE}${ruta}`, {
    ...restoOpciones,
    headers: cabeceras,
  });

  if (!respuesta.ok) {
    let mensajeError = `Error ${respuesta.status}`;
    try {
      const cuerpo = await respuesta.json() as { message?: string; error?: string };
      mensajeError = cuerpo.message ?? cuerpo.error ?? mensajeError;
    } catch {
      // El cuerpo no es JSON — mantener el mensaje genérico
    }
    throw new Error(mensajeError);
  }

  // 204 No Content — no intentar parsear JSON
  if (respuesta.status === 204) {
    return undefined as T;
  }

  return respuesta.json() as Promise<T>;
}

/** Atajos tipados por método HTTP */
export const api = {
  get: <T>(ruta: string, opciones?: OpcionesPeticion) =>
    peticion<T>(ruta, { method: 'GET', ...opciones }),

  post: <T>(ruta: string, cuerpo: unknown, opciones?: OpcionesPeticion) =>
    peticion<T>(ruta, { method: 'POST', body: JSON.stringify(cuerpo), ...opciones }),

  put: <T>(ruta: string, cuerpo: unknown, opciones?: OpcionesPeticion) =>
    peticion<T>(ruta, { method: 'PUT', body: JSON.stringify(cuerpo), ...opciones }),

  patch: <T>(ruta: string, cuerpo: unknown, opciones?: OpcionesPeticion) =>
    peticion<T>(ruta, { method: 'PATCH', body: JSON.stringify(cuerpo), ...opciones }),

  delete: <T>(ruta: string, opciones?: OpcionesPeticion) =>
    peticion<T>(ruta, { method: 'DELETE', ...opciones }),
};
