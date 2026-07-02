/**
 * Tabla del listado de usuarios del tenant. Presentacional: recibe datos/estado
 * por props (el fetch lo hace PantallaUsuarios). Maneja carga, error visible y vacío.
 *
 * La fila del PROPIO usuario no ofrece "Restablecer": el backend lo rechaza (400,
 * la propia cuenta va por el autoservicio de cambiar contraseña, que exige la actual).
 */

import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { Boton } from '../../core/ui/Boton';
import type { UsuarioListado } from './tipos';
import styles from './ListaUsuarios.module.css';

interface PropiedadesLista {
  usuarios: UsuarioListado[] | null;
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
  /** Abre el diálogo de restablecer contraseña para ese usuario. */
  onRestablecer: (usuario: UsuarioListado) => void;
  /** Id del usuario de la sesión (su propia fila no ofrece "Restablecer"). */
  idActual: string | null;
}

export function ListaUsuarios({
  usuarios,
  cargando,
  error,
  onReintentar,
  onRestablecer,
  idActual,
}: PropiedadesLista) {
  const { t } = useTraduccion();

  return (
    <div className={styles.tarjeta}>
      {error && (
        <div className={styles.errorCarga} role="alert">
          <span>{error}</span>
          <Boton variante="secundario" onClick={onReintentar}>
            {t('adm.reintentar')}
          </Boton>
        </div>
      )}

      {cargando && !usuarios && <p className={styles.estadoCarga}>{t('adm.usu.cargandoLista')}</p>}

      {!error && !cargando && usuarios && usuarios.length === 0 && (
        <p className={styles.estadoVacio}>{t('adm.usu.vacio')}</p>
      )}

      {/* La tabla NO se gatea por `error` (mismo criterio que ListaEmpresas): si un
          refresh posterior falla, los datos ya cargados siguen visibles bajo el banner. */}
      {usuarios && usuarios.length > 0 && (
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>{t('adm.usu.thNombre')}</th>
              <th>{t('adm.usu.thEmail')}</th>
              <th>{t('adm.usu.thRol')}</th>
              <th>{t('adm.estado')}</th>
              <th>{t('adm.usu.thContrasena')}</th>
              <th>{t('adm.usu.thCreado')}</th>
              <th className={styles.colAccion}>{t('adm.usu.thAcciones')}</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className={u.activo ? undefined : styles.filaInactiva}>
                <td>{u.nombre}</td>
                <td className={styles.contacto}>{u.email}</td>
                <td>{t(`rol.${u.rol}`)}</td>
                <td>
                  <span className={u.activo ? styles.badgeActivo : styles.badgeInactivo}>
                    {u.activo ? t('adm.usu.activo') : t('adm.usu.inactivo')}
                  </span>
                </td>
                <td>
                  {u.debeCambiarContrasena ? (
                    <span className={styles.badgeTemporal}>{t('adm.usu.temporalPendiente')}</span>
                  ) : (
                    <span className={styles.sinDato}>—</span>
                  )}
                </td>
                <td className={styles.contacto}>{new Date(u.creadoEn).toLocaleDateString()}</td>
                <td className={styles.colAccion}>
                  {u.id !== idActual ? (
                    /* Cuenta desactivada: restablecerle la contraseña daría 204 pero el
                       login la seguiría rechazando — sería un "éxito" engañoso. */
                    <button
                      type="button"
                      className={styles.botonAccion}
                      onClick={() => onRestablecer(u)}
                      disabled={!u.activo}
                      title={u.activo ? undefined : t('adm.usu.inactivoAyuda')}
                    >
                      {t('adm.usu.restablecer')}
                    </button>
                  ) : (
                    /* La propia cuenta: se cambia desde el menú de la barra (con la actual). */
                    <span className={styles.sinDato} title={t('adm.usu.propiaAyuda')}>
                      {t('adm.usu.propia')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
