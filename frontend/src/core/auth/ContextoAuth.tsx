/**
 * Contexto de sesión de GestorPro.
 *
 * Estrategia de tokens:
 *  - access token  → en memoria (variable de módulo en cliente.ts). Se pierde al recargar.
 *  - refresh token → en localStorage. Persiste entre sesiones y recargas.
 *
 * Al montar el proveedor, si existe un refresh token guardado se intenta
 * rehidratar la sesión llamando a POST /auth/refresh.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  api,
  ErrorHttp,
  fijarAccessToken,
  fijarManejadorRefresh,
  fijarManejadorDebeCambiar,
  esperarRefrescoEnCurso,
} from '../api';
import {
  cambiarEmpresaApi,
  eliminarRefreshToken,
  guardarRefreshToken,
  loginApi,
  logoutApi,
  obtenerRefreshTokenGuardado,
  refrescarTokenApi,
} from './servicioAuth';
import type { Usuario } from './tipos';

// ── Tipos del contexto ─────────────────────────────────────────────────────

interface ValorContextoAuth {
  /** Usuario autenticado, o null si no hay sesión. */
  usuario: Usuario | null;
  /** true si hay sesión activa. */
  estaAutenticado: boolean;
  /** true mientras se rehidrata la sesión al arrancar. */
  cargando: boolean;
  /** Inicia sesión con email y contraseña. Lanza Error si las credenciales fallan. */
  iniciarSesion: (email: string, password: string) => Promise<void>;
  /** Cierra la sesión actual e invalida el refresh token. */
  cerrarSesion: () => Promise<void>;
  /**
   * Cambia la empresa activa de la sesión (membresía propia, o super-admin entrando a
   * un tenant; `null` = volver a plataforma). Reemplaza el access token y el usuario
   * en caliente — la sesión (refresh token) se conserva. Lanza Error si el backend
   * deniega el cambio (el llamador debe mostrarlo en UI).
   */
  cambiarEmpresa: (empresaId: string | null) => Promise<void>;
}

// ── Contexto ───────────────────────────────────────────────────────────────

const ContextoAuth = createContext<ValorContextoAuth | null>(null);

/**
 * true si /auth/refresh RECHAZÓ la sesión (401: refresh token inválido o
 * expirado). Solo en ese caso corresponde borrar el token guardado. Un fallo
 * de red, un fetch abortado por navegación, un 429 o un 5xx NO son rechazo:
 * el token puede seguir siendo válido y borrarlo desloguearía al usuario por
 * un problema transitorio (causa raíz de la pérdida de sesión en móvil con
 * red inestable y de los E2E flaky de rehidratación).
 */
function esSesionRechazada(err: unknown): boolean {
  return err instanceof ErrorHttp && err.status === 401;
}

// ── Proveedor ──────────────────────────────────────────────────────────────

export function ProveedorAuth({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

  // VERSIÓN de la sesión local: cada escritura INTENCIONAL (login, logout, cambio de
  // empresa) la incrementa. Las escrituras en segundo plano (el /me best-effort del
  // refresh) y las operaciones largas en vuelo (cambiar-empresa) capturan la versión
  // al empezar y SOLO aplican su resultado si nadie escribió en medio — sin esto, un
  // /me tardío pisaría al usuario recién cambiado de empresa, y un cambiar-empresa
  // que resolviera tras el logout RESUCITARÍA la sesión en la UI.
  const versionSesion = useRef(0);

  /**
   * Registrar el manejador de refresco que el cliente HTTP invoca ante un 401:
   * renueva el access token con el refresh guardado; si el refresh ya no vale,
   * deja la sesión cerrada (estado local + UI). Devuelve el nuevo token o null.
   */
  useEffect(() => {
    fijarManejadorRefresh(async () => {
      const refreshToken = obtenerRefreshTokenGuardado();
      if (!refreshToken) return null;
      try {
        const { accessToken } = await refrescarTokenApi(refreshToken);
        fijarAccessToken(accessToken);
        // El token renovado puede venir con OTRA empresa activa: cambiar-empresa
        // actualiza TODAS las sesiones del usuario, así que otra pestaña/dispositivo
        // pudo cambiarla. Se re-sincroniza `usuario` en segundo plano (sin retrasar el
        // reintento que espera este token) para que la UI nunca muestre datos de una
        // empresa bajo la etiqueta de otra. Best-effort: si /me falla se conserva el
        // usuario actual (la frontera de seguridad sigue siendo el backend). `omitirRefresco`
        // evita re-entrar en el refresh ante un 401 de /me (p. ej. cuenta desactivada).
        // GUARD de versión: si mientras el /me viajaba hubo un login/logout/cambio de
        // empresa, su resultado ya es de OTRA sesión y se descarta.
        const version = versionSesion.current;
        void api
          .get<Usuario>('/auth/me', { omitirRefresco: true })
          .then((usuarioActual) => {
            if (version === versionSesion.current) setUsuario(usuarioActual);
          })
          .catch(() => undefined);
        return accessToken;
      } catch (err) {
        if (esSesionRechazada(err)) {
          // El refresh token expiró o es inválido: sesión muerta. Es una
          // escritura intencional de sesión → bump de versión, para que un
          // cambiarEmpresa en vuelo NO resucite la sesión recién invalidada
          // (hallazgo del revisor: sin esto, su POST tardío pasaba el guard).
          versionSesion.current += 1;
          fijarAccessToken(null);
          eliminarRefreshToken();
          setUsuario(null);
        }
        // Fallo transitorio (red/abort/429/5xx): se CONSERVAN token y usuario.
        // La petición original fallará con su error visible y el próximo 401
        // volverá a intentar el refresco.
        return null;
      }
    });
    return () => fijarManejadorRefresh(null);
  }, []);

  /**
   * Manejador del 403 DEBE_CAMBIAR_CONTRASENA (fallback pasivo): marca al usuario para
   * que `RutaProtegida` muestre el cambio forzado. La ruta principal es la activa (login
   * devuelve debeCambiarContrasena), esto cubre el caso de un token aún con el flag.
   */
  useEffect(() => {
    fijarManejadorDebeCambiar(() => {
      // Idempotente: si ya está marcado (o no hay usuario), no se crea un objeto nuevo
      // → evita re-render redundante ante varios 403 en paralelo.
      setUsuario((u) => (u && !u.debeCambiarContrasena ? { ...u, debeCambiarContrasena: true } : u));
    });
    return () => fijarManejadorDebeCambiar(null);
  }, []);

  /**
   * Rehidratar sesión al arrancar si existe un refresh token guardado.
   * Ante un fallo TRANSITORIO (red caída un instante, fetch abortado por una
   * navegación encadenada) se reintenta hasta 3 veces con espera corta; si aun
   * así falla, el token se CONSERVA (la próxima carga volverá a intentarlo).
   * Solo un rechazo real del backend (401) borra la sesión guardada.
   */
  useEffect(() => {
    const rehidratar = async () => {
      const refreshToken = obtenerRefreshTokenGuardado();
      if (!refreshToken) {
        setCargando(false);
        return;
      }

      // Guard de versión: si durante los reintentos hubo un login/logout
      // intencional, este flujo ya es de OTRA sesión y no debe escribir NADA
      // de sesión (ni siquiera borrar el token, que ya sería el nuevo). El
      // `cargando` sí se cierra SIEMPRE: un login hecho desde /login mientras
      // esto reintentaba dejaría la pantalla de carga colgada para siempre.
      const version = versionSesion.current;
      try {
        for (let intento = 0; intento < 3; intento++) {
          try {
            const { accessToken } = await refrescarTokenApi(refreshToken);
            if (version !== versionSesion.current) return;
            fijarAccessToken(accessToken);
            // Obtener los datos del usuario llamando a GET /auth/me con el nuevo access token
            const usuarioActual = await api.get<Usuario>('/auth/me');
            if (version !== versionSesion.current) return;
            setUsuario(usuarioActual);
            return;
          } catch (err) {
            if (version !== versionSesion.current) return;
            if (esSesionRechazada(err)) {
              // El refresh token expiró o es inválido — limpiar todo
              eliminarRefreshToken();
              fijarAccessToken(null);
              return;
            }
            if (intento < 2) {
              await new Promise((resolver) => setTimeout(resolver, 400 * (intento + 1)));
              // Tras la espera puede haber ocurrido un login: no gastar otro
              // POST /auth/refresh con el token viejo (hallazgo del revisor).
              if (version !== versionSesion.current) return;
            }
          }
        }
      } finally {
        setCargando(false);
      }
    };

    void rehidratar();
  }, []);

  const iniciarSesion = useCallback(async (email: string, password: string) => {
    const respuesta = await loginApi({ email, password });
    versionSesion.current += 1; // escritura intencional: invalida resultados en vuelo
    fijarAccessToken(respuesta.accessToken);
    guardarRefreshToken(respuesta.refreshToken);
    setUsuario(respuesta.usuario);
  }, []);

  const cerrarSesion = useCallback(async () => {
    const refreshToken = obtenerRefreshTokenGuardado();
    // Limpiar estado local primero — incluso si el backend falla, el usuario queda deslogueado
    versionSesion.current += 1; // un cambiar-empresa o /me en vuelo NO resucitará la sesión
    fijarAccessToken(null);
    eliminarRefreshToken();
    setUsuario(null);

    if (refreshToken) {
      try {
        await logoutApi(refreshToken);
      } catch {
        // Si el backend falla al invalidar, ignoramos el error — el usuario ya fue desconectado localmente
      }
    }
  }, []);

  const cambiarEmpresa = useCallback(async (empresaId: string | null) => {
    // Carrera con el refresh-on-401 (anotada por el revisor). Cobertura REAL:
    // (1) un refresh EN VUELO al empezar → se espera aquí (sin disparar uno nuevo);
    // (2) un refresh que ARRANCA durante el POST → tras el POST se espera de nuevo y
    //     se RE-IMPONE el token del cambio, así la última escritura siempre es la del
    //     cambio. Residuo asumido: un refresh que arranque DESPUÉS de esa segunda
    //     espera ya lee la sesión con la empresa nueva (el backend la persistió antes
    //     de responder), así que emite un token equivalente — inofensivo.
    // La versión se captura EN LA ENTRADA (antes del primer await): un logout que
    // ocurra en CUALQUIER punto del vuelo —incluida la espera del refresco— debe
    // invalidar este cambio, no solo uno que ocurra después del POST.
    const version = versionSesion.current;
    await esperarRefrescoEnCurso();
    const respuesta = await cambiarEmpresaApi(empresaId);
    if (version !== versionSesion.current) {
      // Logout (u otro login) mientras el cambio viajaba: NO resucitar la sesión.
      return;
    }
    versionSesion.current += 1; // escritura intencional: descarta /me en vuelo
    fijarAccessToken(respuesta.accessToken);
    setUsuario(respuesta.usuario);
    await esperarRefrescoEnCurso();
    // Re-imposición idempotente (ver arriba): si nadie más escribió, el token del
    // cambio queda como el último aunque un refresh rezagado escribiera en medio.
    if (versionSesion.current === version + 1) {
      fijarAccessToken(respuesta.accessToken);
    }
  }, []);

  const valor: ValorContextoAuth = {
    usuario,
    estaAutenticado: usuario !== null,
    cargando,
    iniciarSesion,
    cerrarSesion,
    cambiarEmpresa,
  };

  return <ContextoAuth.Provider value={valor}>{children}</ContextoAuth.Provider>;
}

// ── Hook ───────────────────────────────────────────────────────────────────

/**
 * Hook para acceder al contexto de autenticación.
 * Lanza un error si se usa fuera de ProveedorAuth.
 */
export function useAuth(): ValorContextoAuth {
  const contexto = useContext(ContextoAuth);
  if (!contexto) {
    throw new Error('useAuth debe usarse dentro de <ProveedorAuth>');
  }
  return contexto;
}

/**
 * Variante TOLERANTE de useAuth: devuelve null si no hay proveedor en vez de lanzar.
 * Para componentes que solo AJUSTAN su UI según el usuario (p. ej. mostrar u ocultar
 * un enlace por rol) y cuyos tests los montan sueltos sin <ProveedorAuth>: sin
 * proveedor simplemente no muestran el extra. NO usarla donde la sesión sea
 * imprescindible — ahí va useAuth, que falla fuerte.
 */
export function useAuthOpcional(): ValorContextoAuth | null {
  return useContext(ContextoAuth);
}
