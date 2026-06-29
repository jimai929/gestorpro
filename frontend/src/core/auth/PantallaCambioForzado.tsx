/**
 * Pantalla de cambio de contraseña OBLIGATORIO (primer login con contraseña temporal).
 *
 * La monta `RutaProtegida` en vez del app cuando el usuario tiene
 * `debeCambiarContrasena=true`: el usuario NO puede cancelar ni escapar a la app, debe
 * cambiarla. Reutiliza `DialogoCambiarContrasena` en modo `forzado` (sin cancelar/cerrar).
 *
 * Tras el éxito (contrato 1 del backend): el cambio revoca todas las sesiones, así que se
 * cierra la sesión local y `RutaProtegida` redirige a /login para reingresar — NUNCA se
 * reutiliza el token viejo (que aún trae el flag y daría un 403 en bucle).
 */

import { useAuth } from './ContextoAuth';
import { DialogoCambiarContrasena } from './DialogoCambiarContrasena';

export function PantallaCambioForzado() {
  const { cerrarSesion } = useAuth();
  return <DialogoCambiarContrasena forzado onExito={() => void cerrarSesion()} />;
}
