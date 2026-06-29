/**
 * Cliente HTTP centralizado hacia el backend de GestorPro.
 *
 * - La URL base viene de la variable de entorno VITE_API_URL (con default local).
 * - El access token se inyecta automáticamente en el header Authorization.
 * - El token se almacena en memoria (no en localStorage) por seguridad.
 */

const URL_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Error de una respuesta HTTP no-2xx. Conserva el `status` para que la UI distinga
 * casos (p. ej. 429 limitado vs 401/403). Extiende Error: `err.message` sigue funcionando.
 */
export class ErrorHttp extends Error {
  constructor(
    readonly status: number,
    mensaje: string,
  ) {
    super(mensaje);
    this.name = 'ErrorHttp';
  }
}

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

/**
 * Renueva el access token (lo fija en memoria) y devuelve el nuevo, o null si
 * la sesión ya no es renovable. Lo inyecta la capa de auth (no este módulo de
 * bajo nivel) vía `fijarManejadorRefresh`.
 */
type ManejadorRefresh = () => Promise<string | null>;

let manejadorRefresh: ManejadorRefresh | null = null;
/** Refresco en curso compartido: varias peticiones que reciben 401 a la vez renuevan UNA sola vez. */
let refrescoEnCurso: Promise<string | null> | null = null;

/** Registra (o limpia con null) el manejador de refresco del access token. */
export function fijarManejadorRefresh(fn: ManejadorRefresh | null): void {
  manejadorRefresh = fn;
}

/**
 * Manejador que la capa de auth registra para reaccionar a un 403 con codigo
 * DEBE_CAMBIAR_CONTRASENA (contraseña temporal): redirige al cambio forzado. Es el
 * FALLBACK pasivo de la intercepción activa del login; rama independiente del refresh-on-401.
 */
type ManejadorDebeCambiar = () => void;
let manejadorDebeCambiar: ManejadorDebeCambiar | null = null;

/** Registra (o limpia con null) el manejador de "debe cambiar contraseña". */
export function fijarManejadorDebeCambiar(fn: ManejadorDebeCambiar | null): void {
  manejadorDebeCambiar = fn;
}

/** Llama al manejador de refresco deduplicando llamadas concurrentes. */
function refrescarUnaVez(): Promise<string | null> {
  if (!refrescoEnCurso && manejadorRefresh) {
    refrescoEnCurso = manejadorRefresh().finally(() => {
      refrescoEnCurso = null;
    });
  }
  return refrescoEnCurso ?? Promise.resolve(null);
}

/** Opciones extendidas para las peticiones del cliente. */
export interface OpcionesPeticion extends RequestInit {
  omitirAuth?: boolean;
  /**
   * No intentar el refresh-on-401: el 401 se propaga tal cual como error. Para
   * endpoints AUTENTICADOS donde un 401 puede significar "credenciales incorrectas"
   * (no "token expirado") —p. ej. cambiar-contraseña verifica la contraseña actual—,
   * así no se reintenta la petición (que duplicaría el POST y el consumo del rate limit).
   */
  omitirRefresco?: boolean;
}

/**
 * Realiza una petición HTTP al backend.
 * Lanza un error con el mensaje del backend si la respuesta no es 2xx.
 */
export async function peticion<T>(
  ruta: string,
  opciones: OpcionesPeticion = {},
): Promise<T> {
  const {
    omitirAuth = false,
    omitirRefresco = false,
    headers: cabecerasExtra,
    ...restoOpciones
  } = opciones;

  // Se reconstruye en cada intento para releer el access token (cambia tras un refresco).
  const construirCabeceras = (): Record<string, string> => {
    const cabeceras: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(cabecerasExtra as Record<string, string>),
    };
    if (!omitirAuth && accessTokenEnMemoria) {
      cabeceras['Authorization'] = `Bearer ${accessTokenEnMemoria}`;
    }
    return cabeceras;
  };

  let respuesta = await fetch(`${URL_BASE}${ruta}`, {
    ...restoOpciones,
    headers: construirCabeceras(),
  });

  // Refresh-on-401: si el access token expiró, renovarlo UNA vez y reintentar.
  // Las rutas /auth/ de sesión (login/refresh/logout) usan `omitirAuth`, así que no
  // entran aquí (eso evita el bucle: un 401 del propio refresh no dispara otro). Un
  // endpoint /auth/ AUTENTICADO donde un 401 puede ser "credenciales incorrectas" (no
  // token expirado) —cambiar-contraseña— usa `omitirRefresco` para NO reintentar.
  if (respuesta.status === 401 && !omitirAuth && !omitirRefresco && manejadorRefresh) {
    const nuevoToken = await refrescarUnaVez();
    if (nuevoToken) {
      respuesta = await fetch(`${URL_BASE}${ruta}`, {
        ...restoOpciones,
        headers: construirCabeceras(),
      });
    }
  }

  if (!respuesta.ok) {
    let mensajeError = `Error ${respuesta.status}`;
    let codigo: string | undefined;
    try {
      const cuerpo = await respuesta.json() as {
        mensaje?: string;
        message?: string;
        error?: string;
        codigo?: string;
      };
      mensajeError = cuerpo.mensaje ?? cuerpo.message ?? cuerpo.error ?? mensajeError;
      codigo = cuerpo.codigo;
    } catch {
      // El cuerpo no es JSON — mantener el mensaje genérico
    }
    // Contraseña temporal: el backend bloquea con 403 + codigo DEBE_CAMBIAR_CONTRASENA. Rama
    // INDEPENDIENTE del refresh-on-401 (no se refresca el token): se avisa a la capa de auth
    // para redirigir al cambio forzado. El 429 (rate limit) NO entra aquí → no hay bucle.
    if (respuesta.status === 403 && codigo === 'DEBE_CAMBIAR_CONTRASENA') {
      manejadorDebeCambiar?.();
    }
    throw new ErrorHttp(respuesta.status, mensajeError);
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
