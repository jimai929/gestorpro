/**
 * Layout base para pantallas autenticadas.
 * Incluye la barra de navegación superior con el nombre del usuario y el botón de cerrar sesión.
 */

import { ReactNode, useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../auth/ContextoAuth';
import { DialogoCambiarContrasena } from '../auth/DialogoCambiarContrasena';
import { useTraduccion } from '../i18n/ContextoIdioma';
import { SelectorIdioma } from '../i18n/SelectorIdioma';
import styles from './LayoutPrincipal.module.css';

interface PropiedadesLayout {
  children: ReactNode;
}

export function LayoutPrincipal({ children }: PropiedadesLayout) {
  const { usuario, cerrarSesion } = useAuth();
  const { t } = useTraduccion();
  const [mostrarCambioContrasena, setMostrarCambioContrasena] = useState(false);

  // Empresa activa a mostrar en la barra: el super-admin (sin empresa) muestra
  // "Plataforma"; un usuario normal, el nombre de su empresa. Si no hay nombre (y no es
  // super-admin) no se muestra nada (evita un hueco vacío/undefined).
  const etiquetaEmpresa = usuario
    ? usuario.esSuperAdmin
      ? t('plataforma.badge')
      : usuario.empresaNombre
    : null;

  const manejarCerrarSesion = () => {
    void cerrarSesion();
  };

  // Tras cambiar la contraseña el backend ya revocó todas las sesiones: cerramos la
  // sesión local para que el usuario reingrese con su nueva contraseña (RutaProtegida
  // lo lleva a /login).
  const manejarExitoCambio = () => {
    setMostrarCambioContrasena(false);
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
              {etiquetaEmpresa && (
                <span className={styles.empresaActual}>{etiquetaEmpresa}</span>
              )}
              <span className={styles.nombreUsuario}>{usuario.nombre}</span>
              <span className={styles.badgeRol}>
                {t(`rol.${usuario.rol}`)}
              </span>
            </div>
          )}
          <SelectorIdioma />
          {usuario && (
            <button
              type="button"
              className={styles.botonAccion}
              onClick={() => setMostrarCambioContrasena(true)}
            >
              {t('cuenta.cambiarContrasena')}
            </button>
          )}
          <button className={styles.botonSalir} onClick={manejarCerrarSesion}>
            {t('comun.cerrarSesion')}
          </button>
        </div>
      </header>

      {/* Contenido principal */}
      <main className={styles.principal}>{children}</main>

      {mostrarCambioContrasena && (
        <DialogoCambiarContrasena
          onCerrar={() => setMostrarCambioContrasena(false)}
          onExito={manejarExitoCambio}
        />
      )}
    </div>
  );
}
