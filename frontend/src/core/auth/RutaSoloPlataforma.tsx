/**
 * Guard de rutas de PLATAFORMA — solo accesible para cuentas super-admin.
 *
 * Se anida DENTRO de <RutaProtegida>, así que cuando se llega aquí la sesión ya
 * está rehidratada y autenticada: este guard solo decide acceso por `esSuperAdmin`.
 *
 * IMPORTANTE: es solo EXPERIENCIA de UI. La frontera real de seguridad es el
 * backend (preHandler `soloPlataforma` → 404 para quien no es super-admin). No se
 * debe confiar en este guard para autorizar nada.
 */

import { Navigate, Outlet } from 'react-router';
import { useAuth } from './ContextoAuth';

/**
 * Envuelve rutas que requieren ser super-admin de plataforma. Usar como elemento
 * padre dentro de las rutas protegidas:
 *
 * ```tsx
 * { element: <RutaSoloPlataforma />, children: [...rutasPlataforma] }
 * ```
 */
export function RutaSoloPlataforma() {
  const { usuario } = useAuth();

  // No super-admin (o sin usuario): se redirige al inicio. No revelamos la
  // pantalla de plataforma; el backend además responde 404 a sus endpoints.
  if (!usuario?.esSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
