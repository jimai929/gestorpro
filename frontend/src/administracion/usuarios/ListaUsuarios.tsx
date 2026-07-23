/**
 * Tabla del listado de usuarios del tenant. Presentacional: recibe datos/estado
 * por props (el fetch lo hace PantallaUsuarios). Maneja carga, error visible y vacío.
 *
 * La fila del PROPIO usuario no ofrece "Restablecer": el backend lo rechaza (400,
 * la propia cuenta va por el autoservicio de cambiar contraseña, que exige la actual).
 */

import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { Boton } from '../../core/ui/Boton';
import { ROLES_ASIGNABLES, esRolAsignable, type RolAsignable, type UsuarioListado } from './tipos';
import styles from './ListaUsuarios.module.css';

interface PropiedadesLista {
  usuarios: UsuarioListado[] | null;
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
  /** Abre el diálogo de restablecer contraseña para ese usuario. */
  onRestablecer: (usuario: UsuarioListado) => void;
  /** Baja / reactivación lógica de la cuenta. El padre llama al backend y recarga. */
  onAlternarActivo: (usuario: UsuarioListado) => void;
  /**
   * Cambia el rol de la MEMBRESÍA del usuario (M3b). El padre llama al backend y recarga.
   * Solo se ofrece el control si `puedeCambiarRol` y la fila NO es la propia.
   */
  onCambiarRol?: (usuario: UsuarioListado, rol: RolAsignable) => void;
  /** ¿El usuario de la sesión es administrador? Sin esto, la columna Rol es solo texto. */
  puedeCambiarRol?: boolean;
  /** Usuario cuyo cambio de estado está en curso (deshabilita sus acciones). */
  actualizandoId?: string | null;
  /** Id del usuario de la sesión (su propia fila no ofrece acciones). */
  idActual: string | null;
}

export function ListaUsuarios({
  usuarios,
  cargando,
  error,
  onReintentar,
  onRestablecer,
  onAlternarActivo,
  onCambiarRol,
  puedeCambiarRol = false,
  actualizandoId = null,
  idActual,
}: PropiedadesLista) {
  const { t } = useTraduccion();

  // Etiqueta segura del rol: traducida si es uno de los tres conocidos; si el backend
  // enviara un valor raro, se muestra EN CRUDO (nunca se mapea silenciosamente a un rol).
  const etiquetaRol = (rol: string) => (esRolAsignable(rol) ? t(`rol.${rol}`) : rol);

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
        <div className={styles.contenedorTabla}>
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
                <td>
                  {/* Cambio de rol (M3b): solo para un admin de la sesión, sobre filas
                      AJENAS y con un rol conocido. La propia fila y los valores raros
                      se muestran como texto (nunca un select que oculte el valor real).
                      El propio rol NO se puede cambiar (evita la auto-degradación; el
                      backend lo refuerza con 400). */}
                  {puedeCambiarRol && u.id !== idActual && esRolAsignable(u.rol) ? (
                    <select
                      className={styles.selectRol}
                      aria-label={t('adm.usu.cambiarRol')}
                      value={u.rol}
                      onChange={(e) => onCambiarRol?.(u, e.target.value as RolAsignable)}
                      // Con CUALQUIER mutación en vuelo se congela toda la tabla (mismo
                      // criterio que el resto de acciones: un solo slot de estado).
                      disabled={actualizandoId !== null}
                    >
                      {ROLES_ASIGNABLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`rol.${r}`)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span title={u.id === idActual ? t('adm.usu.rolPropioAyuda') : undefined}>
                      {etiquetaRol(u.rol)}
                    </span>
                  )}
                </td>
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
                    <>
                      {/* Cuenta desactivada: restablecerle la contraseña daría 204 pero
                         el login la seguiría rechazando — sería un "éxito" engañoso. */}
                      <button
                        type="button"
                        className={styles.botonAccion}
                        onClick={() => onRestablecer(u)}
                        // Con CUALQUIER actualización en vuelo se congela toda la tabla
                        // (mismo criterio que ListaEmpresas): un solo slot de estado
                        // actualizandoId/errorAccion no soporta mutaciones concurrentes.
                        disabled={!u.activo || actualizandoId !== null}
                        title={u.activo ? undefined : t('adm.usu.inactivoAyuda')}
                      >
                        {t('adm.usu.restablecer')}
                      </button>
                      {/* Baja / reactivación lógica (nunca se borra la cuenta). */}
                      <button
                        type="button"
                        className={`${styles.botonAccion} ${u.activo ? styles.botonPeligro : ''}`}
                        onClick={() => onAlternarActivo(u)}
                        disabled={actualizandoId !== null}
                      >
                        {u.activo ? t('adm.usu.desactivar') : t('adm.usu.reactivar')}
                      </button>
                    </>
                  ) : (
                    /* La propia cuenta: contraseña por el menú de la barra; la baja
                       propia está prohibida (el tenant no se queda sin admin). */
                    <span className={styles.sinDato} title={t('adm.usu.propiaAyuda')}>
                      {t('adm.usu.propia')}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
