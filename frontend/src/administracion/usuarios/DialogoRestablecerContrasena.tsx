/**
 * Diálogo modal para RESTABLECER la contraseña de un usuario del tenant (soporte).
 *
 * Llama a POST /usuarios/:id/restablecer-contrasena. El backend fija una contraseña
 * TEMPORAL (el usuario deberá cambiarla en su próximo ingreso) y REVOCA todas sus
 * sesiones. Tras el éxito muestra el aviso para comunicar la temporal; NO se cierra
 * ni avanza antes del 204 real, y el error queda visible en la UI.
 */

import { useState, type FormEvent } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { restablecerContrasenaApi } from './servicioUsuarios';
import type { UsuarioListado } from './tipos';
import styles from './DialogoRestablecerContrasena.module.css';

/** Longitud mínima de la temporal; igual que la regla del backend (schema). */
const LONGITUD_MINIMA = 8;

interface Propiedades {
  /** Usuario objetivo del restablecimiento. */
  usuario: UsuarioListado;
  /** Cierra el diálogo sin cambiar (antes del éxito). */
  onCerrar: () => void;
  /** Se invoca al cerrar TRAS un éxito; el padre refresca la lista. */
  onExito: () => void;
}

export function DialogoRestablecerContrasena({ usuario, onCerrar, onExito }: Propiedades) {
  const { t } = useTraduccion();
  const [temporal, setTemporal] = useState('');
  const [confirmar, setConfirmar] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  const manejarEnvio = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);

    // Validación en cliente (el backend la repite; feedback inmediato).
    if (temporal.length < LONGITUD_MINIMA) {
      setError(t('adm.usu.rc.errCorta'));
      return;
    }
    if (temporal !== confirmar) {
      setError(t('adm.usu.rc.errConfirmar'));
      return;
    }

    setGuardando(true);
    try {
      await restablecerContrasenaApi(usuario.id, temporal);
      // Solo tras el 204 real pasamos al estado de éxito (no antes).
      setExito(true);
    } catch (err) {
      // Muestra el mensaje real del backend (p. ej. 404 usuario no encontrado).
      setError(err instanceof Error ? err.message : t('adm.usu.rc.errGenerico'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      className={styles.fondo}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-restablecer-contrasena"
    >
      <div className={styles.dialogo}>
        {exito ? (
          <>
            {/* role=status: anuncia el éxito a lectores de pantalla. */}
            <div className={styles.exito} role="status">
              <h2 className={styles.titulo} id="titulo-restablecer-contrasena">
                {t('adm.usu.rc.exitoTitulo')}
              </h2>
              <p className={styles.mensaje}>
                {t('adm.usu.rc.exitoMensaje', { nombre: usuario.nombre })}
              </p>
            </div>
            <div className={styles.acciones}>
              <Boton type="button" autoFocus onClick={onExito}>
                {t('comun.cerrar')}
              </Boton>
            </div>
          </>
        ) : (
          <>
            <div className={styles.encabezado}>
              <h2 className={styles.titulo} id="titulo-restablecer-contrasena">
                {t('adm.usu.rc.titulo', { nombre: usuario.nombre })}
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

            <p className={styles.mensaje}>{t('adm.usu.rc.intro')}</p>

            <form className={styles.formulario} onSubmit={(e) => { void manejarEnvio(e); }}>
              <div className={styles.campos}>
                <Entrada
                  etiqueta={t('adm.usu.rc.nueva')}
                  type="password"
                  autoComplete="new-password"
                  value={temporal}
                  onChange={(e) => setTemporal(e.target.value)}
                  ayuda={t('adm.usu.contrasenaAyuda')}
                  disabled={guardando}
                  autoFocus
                />
                <Entrada
                  etiqueta={t('adm.usu.rc.confirmar')}
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
                <Boton type="submit" cargando={guardando} disabled={guardando || !temporal || !confirmar}>
                  {t('adm.usu.rc.restablecer')}
                </Boton>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
