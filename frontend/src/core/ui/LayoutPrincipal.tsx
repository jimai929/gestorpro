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
  const [cambiandoEmpresa, setCambiandoEmpresa] = useState(false);

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

  // Usuario con MÁS de una membresía activa: la etiqueta de empresa se vuelve un
  // selector. `?? []` cubre un `usuario` guardado antes de este deploy (sin el campo).
  const membresias = usuario?.membresias ?? [];
  const puedeCambiarDeEmpresa = !usuario?.esSuperAdmin && membresias.length > 1;

  const manejarCambioDeEmpresa = async (empresaId: string) => {
    if (!usuario || empresaId === usuario.empresaId) return;
    setCambiandoEmpresa(true);
    setErrorVolver(null);
    try {
      await cambiarEmpresa(empresaId);
      // La pantalla actual puede no existir/denegarse bajo el rol de la otra empresa:
      // se navega al inicio (mismo criterio que el "Entrar" de plataforma).
      navigate('/');
    } catch (err) {
      // El <select> sigue mostrando la empresa REAL (usuario.empresaId no cambió).
      setErrorVolver(err instanceof Error ? err.message : t('plataforma.errEntrar'));
    } finally {
      setCambiandoEmpresa(false);
    }
  };

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
              {puedeCambiarDeEmpresa ? (
                /* Multi-membresía: la etiqueta es un selector (cambiar-empresa). */
                <select
                  className={styles.selectorEmpresa}
                  aria-label={t('cuenta.cambiarEmpresa')}
                  value={usuario.empresaId ?? ''}
                  onChange={(e) => void manejarCambioDeEmpresa(e.target.value)}
                  disabled={cambiandoEmpresa}
                >
                  {membresias.map((m) => (
                    <option key={m.empresaId} value={m.empresaId}>
                      {m.empresaNombre}
                    </option>
                  ))}
                </select>
              ) : (
                etiquetaEmpresa && (
                  <span className={styles.empresaActual}>{etiquetaEmpresa}</span>
                )
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
