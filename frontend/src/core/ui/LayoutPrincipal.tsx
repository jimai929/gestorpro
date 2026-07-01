/**
 * Layout base para pantallas autenticadas.
 * Incluye la barra de navegación superior con el nombre del usuario y el botón de cerrar sesión.
 */

import { ReactNode, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '../auth/ContextoAuth';
import { DialogoCambiarContrasena } from '../auth/DialogoCambiarContrasena';
import { useTraduccion } from '../i18n/ContextoIdioma';
import { SelectorIdioma } from '../i18n/SelectorIdioma';
import styles from './LayoutPrincipal.module.css';

interface PropiedadesLayout {
  children: ReactNode;
}

export function LayoutPrincipal({ children }: PropiedadesLayout) {
  const { usuario, cerrarSesion, cambiarEmpresa } = useAuth();
  const { t } = useTraduccion();
  const navigate = useNavigate();
  const [mostrarCambioContrasena, setMostrarCambioContrasena] = useState(false);
  const [volviendo, setVolviendo] = useState(false);
  const [errorVolver, setErrorVolver] = useState<string | null>(null);

  // Empresa activa a mostrar en la barra: si hay empresa activa se muestra su nombre
  // (también para el super-admin que ENTRÓ a una empresa); el super-admin sin empresa
  // muestra "Plataforma". Un usuario normal sin nombre no muestra nada (evita un
  // hueco vacío/undefined).
  const etiquetaEmpresa = usuario
    ? (usuario.empresaNombre ?? (usuario.esSuperAdmin ? t('plataforma.badge') : null))
    : null;

  // Super-admin DENTRO de una empresa: botón para soltar el contexto del tenant.
  const puedeVolverAPlataforma =
    usuario !== null && usuario.esSuperAdmin && usuario.empresaId !== null;

  const manejarVolverAPlataforma = async () => {
    setVolviendo(true);
    setErrorVolver(null);
    try {
      await cambiarEmpresa(null);
      // Sin empresa activa, la página de tenant actual solo daría 403/datos huérfanos:
      // se lleva al super-admin a su pantalla (simétrico al "Entrar", que navega a /).
      navigate('/plataforma');
    } catch (err) {
      setErrorVolver(err instanceof Error ? err.message : t('plataforma.errVolver'));
    } finally {
      setVolviendo(false);
    }
  };

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
          {puedeVolverAPlataforma && (
            <button
              type="button"
              className={styles.botonAccion}
              onClick={() => void manejarVolverAPlataforma()}
              disabled={volviendo}
            >
              {t('plataforma.volver')}
            </button>
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
      {/* Error del "volver a plataforma" VISIBLE (regla de mutaciones): bajo la barra. */}
      {errorVolver && (
        <p className={styles.errorBarra} role="alert">
          {errorVolver}
        </p>
      )}

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
