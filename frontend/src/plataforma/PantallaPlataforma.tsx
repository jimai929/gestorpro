/**
 * Pantalla de PLATAFORMA (solo super-admin): alta de empresas (tenants).
 * Se auto-envuelve en <LayoutPrincipal>, igual que el resto de pantallas.
 * El acceso lo controla <RutaSoloPlataforma> (UI) y el backend (soloPlataforma).
 */

import { LayoutPrincipal } from '../core/ui/LayoutPrincipal';
import { useTraduccion } from '../core/i18n/ContextoIdioma';
import { FormularioCrearEmpresa } from './FormularioCrearEmpresa';
import styles from './PantallaPlataforma.module.css';

export function PantallaPlataforma() {
  const { t } = useTraduccion();

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        <header className={styles.encabezado}>
          <h1 className={styles.titulo}>{t('plataforma.titulo')}</h1>
          <p className={styles.subtitulo}>{t('plataforma.subtitulo')}</p>
        </header>

        <div className={styles.tarjeta}>
          <FormularioCrearEmpresa />
        </div>
      </div>
    </LayoutPrincipal>
  );
}
