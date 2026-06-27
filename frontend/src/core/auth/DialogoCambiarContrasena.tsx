/**
 * Diálogo modal de autoservicio para cambiar la propia contraseña.
 *
 * Llama a POST /auth/cambiar-contrasena. Importante: el backend, al cambiar la
 * contraseña, REVOCA todas las sesiones de refresco del usuario. Por eso, tras el
 * éxito, este diálogo NO vuelve al formulario: muestra un aviso e invita a reiniciar
 * sesión; el componente padre cierra la sesión local al pulsar el botón (onExito).
 *
 * Sigue las reglas de mutaciones de la app: captura y muestra el error en la UI, no
 * "cierra" ni avanza hasta el 204 real, y deshabilita los campos mientras envía.
 */

import { useState, type FormEvent } from 'react';
import { Boton } from '../ui/Boton';
import { Entrada } from '../ui/Entrada';
import { useTraduccion } from '../i18n/ContextoIdioma';
import { cambiarContrasenaApi } from './servicioAuth';
import styles from './DialogoCambiarContrasena.module.css';

/** Longitud mínima de la nueva contraseña; igual que la regla del backend (schema). */
const LONGITUD_MINIMA = 8;

interface Propiedades {
  /** Cierra el diálogo sin cambiar (solo disponible antes del éxito). */
  onCerrar: () => void;
  /** Se invoca tras un cambio exitoso; el padre cierra la sesión local para reingresar. */
  onExito: () => void;
}

export function DialogoCambiarContrasena({ onCerrar, onExito }: Propiedades) {
  const { t } = useTraduccion();
  const [actual, setActual] = useState('');
  const [nueva, setNueva] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  const manejarEnvio = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);

    // Validación en cliente (el backend la repite; aquí evitamos un viaje inútil y
    // damos feedback inmediato). Se muestra el PRIMER problema encontrado.
    if (!actual) {
      setError(t('cuenta.cc.errActual'));
      return;
    }
    if (nueva.length < LONGITUD_MINIMA) {
      setError(t('cuenta.cc.errNuevaCorta'));
      return;
    }
    if (nueva === actual) {
      setError(t('cuenta.cc.errIgual'));
      return;
    }
    if (nueva !== confirmar) {
      setError(t('cuenta.cc.errConfirmar'));
      return;
    }

    setGuardando(true);
    try {
      await cambiarContrasenaApi(actual, nueva);
      // Solo tras el 204 real pasamos al estado de éxito (no antes).
      setExito(true);
    } catch (err) {
      // El mensaje del backend ya viene en español (convención del proyecto).
      setError(err instanceof Error ? err.message : t('cuenta.cc.errGenerico'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className={styles.fondo}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-cambiar-contrasena"
    >
      <div className={styles.dialogo}>
        {exito ? (
          <>
            {/* role=status: anuncia el éxito a lectores de pantalla (el <form> que tenía
                el foco se desmontó). El botón recibe autoFocus para no perder el teclado. */}
            <div className={styles.exito} role="status">
              <h2 className={styles.titulo} id="titulo-cambiar-contrasena">
                {t('cuenta.cc.exitoTitulo')}
              </h2>
              <p className={styles.mensaje}>{t('cuenta.cc.exitoMensaje')}</p>
            </div>
            <div className={styles.acciones}>
              <Boton type="button" autoFocus onClick={onExito}>
                {t('cuenta.cc.irLogin')}
              </Boton>
            </div>
          </>
        ) : (
          <>
            <div className={styles.encabezado}>
              <h2 className={styles.titulo} id="titulo-cambiar-contrasena">
                {t('cuenta.cambiarContrasena')}
              </h2>
              <button
                type="button"
                className={styles.botonCerrar}
                onClick={onCerrar}
                aria-label={t('comun.cerrar')}
                disabled={guardando}
              >
                ×
              </button>
            </div>

            <form className={styles.formulario} onSubmit={(e) => { void manejarEnvio(e); }}>
              <div className={styles.campos}>
                <Entrada
                  etiqueta={t('cuenta.cc.actual')}
                  type="password"
                  autoComplete="current-password"
                  value={actual}
                  onChange={(e) => setActual(e.target.value)}
                  disabled={guardando}
                  autoFocus
                />
                <Entrada
                  etiqueta={t('cuenta.cc.nueva')}
                  type="password"
                  autoComplete="new-password"
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  ayuda={t('cuenta.cc.ayudaNueva')}
                  disabled={guardando}
                />
                <Entrada
                  etiqueta={t('cuenta.cc.confirmar')}
                  type="password"
                  autoComplete="new-password"
                  value={confirmar}
                  onChange={(e) => setConfirmar(e.target.value)}
                  disabled={guardando}
                />
              </div>

              {error && <p className={styles.error} role="alert">{error}</p>}

              <div className={styles.acciones}>
                <Boton type="button" variante="secundario" onClick={onCerrar} disabled={guardando}>
                  {t('comun.cancelar')}
                </Boton>
                <Boton
                  type="submit"
                  cargando={guardando}
                  disabled={guardando || !actual || !nueva || !confirmar}
                >
                  {t('cuenta.cambiarContrasena')}
                </Boton>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
