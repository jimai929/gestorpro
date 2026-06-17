/**
 * Layout base para pantallas autenticadas.
 * Incluye la barra de navegación superior con el nombre del usuario y el botón de cerrar sesión.
 */

import { ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/ContextoAuth';
import { useTraduccion } from '../i18n/ContextoIdioma';
import { SelectorIdioma } from '../i18n/SelectorIdioma';
import styles from './LayoutPrincipal.module.css';

interface PropiedadesLayout {
  children: ReactNode;
}

export function LayoutPrincipal({ children }: PropiedadesLayout) {
  const { usuario, cerrarSesion } = useAuth();
  const { t } = useTraduccion();

  const manejarCerrarSesion = () => {
    void cerrarSesion();
  };

  return (
    <div className={styles.contenedor}>
      {/* Barra de navegación superior */}
      <header className={styles.barra}>
        <Link to="/" className={styles.marca} aria-label="Ir al inicio">
          <span className={styles.logoMini}>GP</span>
          <span className={styles.nombreApp}>GestorPro</span>
        </Link>

        <div className={styles.acciones}>
          {usuario && (
            <div className={styles.infoUsuario}>
              <span className={styles.nombreUsuario}>{usuario.nombre}</span>
              <span className={styles.badgeRol}>
                {t(`rol.${usuario.rol}`)}
              </span>
            </div>
          )}
          <SelectorIdioma />
          <button className={styles.botonSalir} onClick={manejarCerrarSesion}>
            {t('comun.cerrarSesion')}
          </button>
        </div>
      </header>

      {/* Contenido principal */}
      <main className={styles.principal}>{children}</main>
    </div>
  );
}
