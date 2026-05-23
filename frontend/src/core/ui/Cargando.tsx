/**
 * Indicador de carga a pantalla completa.
 * Se muestra mientras se rehidrata la sesión al arrancar.
 */

import styles from './Cargando.module.css';

export function Cargando() {
  return (
    <div className={styles.contenedor} role="status" aria-label="Cargando…">
      <div className={styles.spinner} />
      <p className={styles.texto}>Cargando…</p>
    </div>
  );
}
