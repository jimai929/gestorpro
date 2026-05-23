/**
 * Componente base de botón reutilizable.
 * Variantes: primario (azul), secundario (gris), peligro (rojo).
 */

import { ButtonHTMLAttributes } from 'react';
import styles from './Boton.module.css';

export type VarianteBoton = 'primario' | 'secundario' | 'peligro';

interface PropiedadesBoton extends ButtonHTMLAttributes<HTMLButtonElement> {
  variante?: VarianteBoton;
  /** Si true, el botón ocupa todo el ancho disponible. */
  completo?: boolean;
  /** Muestra un indicador de carga y deshabilita el botón. */
  cargando?: boolean;
}

export function Boton({
  variante = 'primario',
  completo = false,
  cargando = false,
  children,
  className,
  disabled,
  ...resto
}: PropiedadesBoton) {
  const clases = [
    styles.boton,
    styles[variante],
    completo ? styles.completo : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button className={clases} disabled={disabled ?? cargando} {...resto}>
      {cargando ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
