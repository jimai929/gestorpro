/**
 * Layout base para pantallas autenticadas.
 * Incluye la barra de navegación superior con el nombre del usuario y el botón de cerrar sesión.
 */

import { ReactNode } from 'react';
import { useAuth } from '../auth/ContextoAuth';
import styles from './LayoutPrincipal.module.css';

interface PropiedadesLayout {
  children: ReactNode;
}

const ETIQUETA_ROL: Record<string, string> = {
  empleado: 'Empleado',
  supervisor: 'Supervisor',
  administrador: 'Administrador',
};

export function LayoutPrincipal({ children }: PropiedadesLayout) {
  const { usuario, cerrarSesion } = useAuth();

  const manejarCerrarSesion = () => {
    void cerrarSesion();
  };

  return (
    <div className={styles.contenedor}>
      {/* Barra de navegación superior */}
      <header className={styles.barra}>
        <div className={styles.marca}>
          <span className={styles.logoMini}>GP</span>
          <span className={styles.nombreApp}>GestorPro</span>
        </div>

        <div className={styles.acciones}>
          {usuario && (
            <div className={styles.infoUsuario}>
              <span className={styles.nombreUsuario}>{usuario.nombre}</span>
              <span className={styles.badgeRol}>
                {ETIQUETA_ROL[usuario.rol] ?? usuario.rol}
              </span>
            </div>
          )}
          <button className={styles.botonSalir} onClick={manejarCerrarSesion}>
            Cerrar sesión
          </button>
        </div>
      </header>

      {/* Contenido principal */}
      <main className={styles.principal}>{children}</main>
    </div>
  );
}
