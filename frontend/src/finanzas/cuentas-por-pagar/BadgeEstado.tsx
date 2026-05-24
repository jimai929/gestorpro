/**
 * Badge de color para el estado de una cuenta por pagar.
 * Estados: debido (azul), vencida (rojo), parcial (ámbar), pagado (verde).
 */

import type { EstadoCuenta } from './tipos';
import { ETIQUETA_ESTADO } from './utilidades';
import styles from './BadgeEstado.module.css';

interface PropiedadesBadge {
  estado: EstadoCuenta;
}

export function BadgeEstado({ estado }: PropiedadesBadge) {
  return (
    <span className={`${styles.badge} ${styles[estado]}`}>
      {ETIQUETA_ESTADO[estado]}
    </span>
  );
}
