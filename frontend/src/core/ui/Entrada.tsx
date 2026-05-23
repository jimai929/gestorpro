/**
 * Componente base de campo de texto reutilizable.
 * Soporta etiqueta, mensaje de error y texto de ayuda.
 */

import { InputHTMLAttributes, useId } from 'react';
import styles from './Entrada.module.css';

interface PropiedadesEntrada extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta?: string;
  error?: string;
  ayuda?: string;
}

export function Entrada({ etiqueta, error, ayuda, className, ...resto }: PropiedadesEntrada) {
  const idBase = useId();
  const idEntrada = `${idBase}-entrada`;
  const idError = `${idBase}-error`;

  return (
    <div className={styles.grupo}>
      {etiqueta && (
        <label htmlFor={idEntrada} className={styles.etiqueta}>
          {etiqueta}
        </label>
      )}
      <input
        id={idEntrada}
        className={[styles.entrada, error ? styles.conError : '', className ?? '']
          .filter(Boolean)
          .join(' ')}
        aria-describedby={error ? idError : undefined}
        aria-invalid={error ? true : undefined}
        {...resto}
      />
      {error && (
        <span id={idError} className={styles.mensajeError} role="alert">
          {error}
        </span>
      )}
      {!error && ayuda && <span className={styles.ayuda}>{ayuda}</span>}
    </div>
  );
}
