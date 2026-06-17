/**
 * Badge de color para el estado de una cuenta por pagar.
 * Estados: debido (azul), vencida (rojo), parcial (ámbar), pagado (verde).
 */

import type { EstadoCuenta } from './tipos';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import styles from './BadgeEstado.module.css';

interface PropiedadesBadge {
  estado: EstadoCuenta;
}

export function BadgeEstado({ estado }: PropiedadesBadge) {
  const { t } = useTraduccion();
  return (
    <span className={`${styles.badge} ${styles[estado]}`}>
      {t(`fin.estadoCuenta.${estado}`)}
    </span>
  );
}
