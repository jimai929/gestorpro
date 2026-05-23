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
  useState,
} from 'react';
import { api, fijarAccessToken } from '../api';
import {
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
}

// ── Contexto ───────────────────────────────────────────────────────────────

const ContextoAuth = createContext<ValorContextoAuth | null>(null);

// ── Proveedor ──────────────────────────────────────────────────────────────

export function ProveedorAuth({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [cargando, setCargando] = useState(true);

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
    fijarAccessToken(respuesta.accessToken);
    guardarRefreshToken(respuesta.refreshToken);
    setUsuario(respuesta.usuario);
  }, []);

  const cerrarSesion = useCallback(async () => {
    const refreshToken = obtenerRefreshTokenGuardado();
    // Limpiar estado local primero — incluso si el backend falla, el usuario queda deslogueado
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

  const valor: ValorContextoAuth = {
    usuario,
    estaAutenticado: usuario !== null,
    cargando,
    iniciarSesion,
    cerrarSesion,
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
