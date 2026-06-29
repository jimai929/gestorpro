/**
 * Guard de rutas — redirige a /login si el usuario no tiene sesión activa.
 *
 * Mientras se rehidrata la sesión (cargando === true) muestra un indicador
 * de carga en lugar de redirigir, para evitar un flash de redirección falso.
 */

import { Navigate, Outlet } from 'react-router';
import { useAuth } from './ContextoAuth';
import { PantallaCambioForzado } from './PantallaCambioForzado';
import { Cargando } from '../ui/Cargando';

/**
 * Envuelve rutas que requieren autenticación.
 * Usar como elemento padre en la configuración del router:
 *
 * ```tsx
 * { element: <RutaProtegida />, children: [...rutasPrivadas] }
 * ```
 */
export function RutaProtegida() {
  const { estaAutenticado, cargando, usuario } = useAuth();

  if (cargando) {
    return <Cargando />;
  }

  if (!estaAutenticado) {
    return <Navigate to="/login" replace />;
  }

  // Contraseña temporal: se BLOQUEA todo el app y se obliga a cambiarla antes de entrar
  // (no escapable). El backend además bloquea con 403 cada endpoint; esto es la cara de UI.
  if (usuario?.debeCambiarContrasena) {
    return <PantallaCambioForzado />;
  }

  return <Outlet />;
}
