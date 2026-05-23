/**
 * Pantalla de inicio (placeholder).
 * Muestra el nombre y rol del usuario autenticado y un botón de cerrar sesión.
 * Se reemplazará por el dashboard de finanzas en la Fase 3.
 */

import { useAuth } from './core/auth/ContextoAuth';
import { LayoutPrincipal } from './core/ui/LayoutPrincipal';
import styles from './PantallaInicio.module.css';

const ETIQUETA_ROL: Record<string, string> = {
  empleado: 'Empleado',
  supervisor: 'Supervisor',
  administrador: 'Administrador',
};

export function PantallaInicio() {
  const { usuario } = useAuth();

  if (!usuario) return null;

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        <div className={styles.bienvenida}>
          <div className={styles.avatar}>
            {usuario.nombre.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className={styles.saludo}>Bienvenido, {usuario.nombre}</h1>
            <p className={styles.detalle}>
              Sesión activa como{' '}
              <strong>{ETIQUETA_ROL[usuario.rol] ?? usuario.rol}</strong>
            </p>
            <p className={styles.email}>{usuario.email}</p>
          </div>
        </div>

        <div className={styles.tarjetasModulos}>
          <div className={styles.tarjeta}>
            <div className={styles.iconoModulo}>💰</div>
            <h2 className={styles.tituloModulo}>Finanzas</h2>
            <p className={styles.descripcionModulo}>
              Cuentas por pagar, gastos y dashboard de ganancias.
            </p>
            <span className={styles.proximamente}>Próximamente</span>
          </div>

          <div className={styles.tarjeta}>
            <div className={styles.iconoModulo}>⏱</div>
            <h2 className={styles.tituloModulo}>Asistencia</h2>
            <p className={styles.descripcionModulo}>
              Fichaje, jornadas y cobro anticipado de horas extra.
            </p>
            <span className={styles.proximamente}>Próximamente</span>
          </div>
        </div>
      </div>
    </LayoutPrincipal>
  );
}
