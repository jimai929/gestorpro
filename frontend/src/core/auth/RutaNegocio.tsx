/**
 * Guard de rutas de NEGOCIO (tenant) — el inverso de <RutaSoloPlataforma>.
 *
 * B4: el super-admin es una cuenta de PLATAFORMA; no opera dentro de ningún tenant.
 * Si intenta abrir una ruta de negocio (dashboard, ventas, gastos, asistencia,
 * empleados, cuentas por pagar, usuarios…) se le redirige a `/plataforma`. Se anida
 * DENTRO de <RutaProtegida>, así que al llegar aquí la sesión ya está autenticada.
 *
 * Es solo EXPERIENCIA de UI: la frontera real es el backend (autenticar rechaza un
 * token super-admin con contexto de tenant; su token siempre trae empresaId=null, y
 * las rutas de tenant fallan cerradas). No se debe confiar en este guard para autorizar.
 */

import { Navigate, Outlet } from 'react-router';
import { useAuth } from './ContextoAuth';

export function RutaNegocio() {
  const { usuario } = useAuth();

  // Super-admin: su lugar es la plataforma; no entra a las áreas de negocio del tenant.
  if (usuario?.esSuperAdmin) {
    return <Navigate to="/plataforma" replace />;
  }

  return <Outlet />;
}
