/**
 * Guard de rutas — redirige a /login si el usuario no tiene sesión activa.
 *
 * Mientras se rehidrata la sesión (cargando === true) muestra un indicador
 * de carga en lugar de redirigir, para evitar un flash de redirección falso.
 */

import { Navigate, Outlet } from 'react-router';
import { useAuth } from './ContextoAuth';
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
  const { estaAutenticado, cargando } = useAuth();

  if (cargando) {
    return <Cargando />;
  }

  if (!estaAutenticado) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
