/**
 * Selector de idioma de la UI. Un <select> compacto con los idiomas disponibles;
 * al cambiar, persiste la elección (vía el contexto) y re-renderiza la app.
 */

import { IDIOMAS, type Idioma } from './idiomas';
import { useTraduccion } from './ContextoIdioma';
import styles from './SelectorIdioma.module.css';

export function SelectorIdioma() {
  const { idioma, cambiarIdioma, t } = useTraduccion();

  return (
    <select
      className={styles.selector}
      value={idioma}
      onChange={(e) => cambiarIdioma(e.target.value as Idioma)}
      aria-label={t('comun.idioma')}
    >
      {IDIOMAS.map((opcion) => (
        <option key={opcion.codigo} value={opcion.codigo}>
          {opcion.etiqueta}
        </option>
      ))}
    </select>
  );
}
