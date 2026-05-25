/**
 * Pantalla de inicio (placeholder).
 * Muestra el nombre y rol del usuario autenticado y un botón de cerrar sesión.
 * Se reemplazará por el dashboard de finanzas en la Fase 3.
 */

import { useAuth } from './core/auth/ContextoAuth';
import { LayoutPrincipal } from './core/ui/LayoutPrincipal';
import { Link } from 'react-router';
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
            <div className={styles.enlacesModulo}>
              <Link to="/cuentas-por-pagar" className={styles.enlaceModulo}>
                Cuentas por pagar →
              </Link>
              <Link to="/gastos" className={styles.enlaceModulo}>
                Gastos →
              </Link>
              <Link to="/dashboard" className={styles.enlaceModulo}>
                Dashboard →
              </Link>
            </div>
          </div>

          <div className={styles.tarjeta}>
            <div className={styles.iconoModulo}>⏱</div>
            <h2 className={styles.tituloModulo}>Asistencia</h2>
            <p className={styles.descripcionModulo}>
              Fichaje, jornadas y cobro anticipado de horas extra.
            </p>
            <div className={styles.enlacesModulo}>
              <Link to="/asistencia/revision" className={styles.enlaceModulo}>
                Cola de revisión →
              </Link>
              <Link to="/asistencia/jornadas" className={styles.enlaceModulo}>
                Jornadas →
              </Link>
              <Link to="/asistencia/cobros" className={styles.enlaceModulo}>
                Cobros →
              </Link>
              <Link
                to="/kiosco"
                className={styles.enlaceModulo}
                target="_blank"
                rel="noopener noreferrer"
              >
                Kiosco (nuevo tab) →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </LayoutPrincipal>
  );
}
