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
      } catch {
        // El refresh token expiró o es inválido: sesión muerta.
        fijarAccessToken(null);
        eliminarRefreshToken();
        setUsuario(null);
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

  /** Rehidratar sesión al arrancar si existe un refresh token guardado. */
  useEffect(() => {
    const rehidratar = async () => {
      const refreshToken = obtenerRefreshTokenGuardado();
      if (!refreshToken) {
        setCargando(false);
        return;
      }

      try {
        const { accessToken } = await refrescarTokenApi(refreshToken);
        fijarAccessToken(accessToken);
        // Obtener los datos del usuario llamando a GET /auth/me con el nuevo access token
        const usuarioActual = await api.get<Usuario>('/auth/me');
        setUsuario(usuarioActual);
      } catch {
        // El refresh token expiró o es inválido — limpiar todo
        eliminarRefreshToken();
        fijarAccessToken(null);
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
