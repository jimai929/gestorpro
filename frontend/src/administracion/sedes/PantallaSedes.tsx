/**
 * Pantalla de gestión de sedes (área de Administración).
 *
 * Lista todas las sedes (activas e inactivas), permite darlas de alta, editarlas
 * (nombre y modo de excepción del fichaje) y darlas de baja / reactivarlas. La
 * baja es LÓGICA (`activo`): nunca se borra, porque compras, gastos, empleados,
 * cajas, etc. la referencian. Las sedes inactivas dejan de aparecer en los
 * selectores de los formularios.
 *
 * Rutas de API: GET /sedes?incluirInactivas=true · POST /sedes · PUT /sedes/:id
 */

import { useState, useEffect, useCallback } from 'react';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { FormularioSede } from './FormularioSede';
import { obtenerSedes, editarSede } from './servicioSedes';
import { type Sede } from './tipos';
import styles from './PantallaSedes.module.css';

export function PantallaSedes() {
  const { t } = useTraduccion();

  // Tema oscuro: se monta mientras esta pantalla está viva y se restaura al salir.
  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', 'dark');
    return () => {
      if (previo === null) raiz.removeAttribute('data-theme');
      else raiz.setAttribute('data-theme', previo);
    };
  }, []);

  const [sedes, setSedes] = useState<Sede[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [mostrarFormNueva, setMostrarFormNueva] = useState(false);
  const [sedeEditar, setSedeEditar] = useState<Sede | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);
  // Aviso de guardado exitoso cuando la recarga posterior falló (ver manejarGuardado).
  const [avisoGuardado, setAvisoGuardado] = useState<string | null>(null);

  // Devuelve `true` si la recarga tuvo éxito, para que quien la dispara tras una
  // mutación distinga "la sede se guardó pero la lista no se pudo refrescar".
  const cargar = useCallback(async (): Promise<boolean> => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setSedes(await obtenerSedes({ incluirInactivas: true }));
      setAvisoGuardado(null); // la fila ya es visible: el aviso deja de hacer falta
      return true;
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : t('adm.sede.errCargar'));
      return false;
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const manejarGuardado = () => {
    // Capturar el modo ANTES de limpiar: tras el reset ya no se sabe si fue edición.
    const eraEdicion = sedeEditar !== null;
    setMostrarFormNueva(false);
    setSedeEditar(null);
    // Si la recarga falla, decir que el guardado SÍ se completó: sin este aviso el
    // admin daría el alta por fallida y la repetiría → sede duplicada (el POST ya corrió).
    void cargar().then((recargaOk) => {
      if (!recargaOk) {
        setAvisoGuardado(t(eraEdicion ? 'adm.sede.avisoEdicionOk' : 'adm.sede.avisoAltaOk'));
      }
    });
  };

  const abrirEdicion = (sede: Sede) => {
    setMostrarFormNueva(false);
    setSedeEditar(sede);
  };

  const alternarActivo = async (sede: Sede) => {
    setActualizandoId(sede.id);
    setErrorCarga(null);
    try {
      await editarSede(sede.id, { activo: !sede.activo });
      await cargar();
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : t('adm.sede.errActualizar'));
    } finally {
      setActualizandoId(null);
    }
  };

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        {/* Encabezado */}
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>{t('nav.sedes')}</h1>
            <p className={styles.subtitulo}>{t('adm.sede.subtitulo')}</p>
          </div>
          <Boton
            onClick={() => {
              setSedeEditar(null);
              setMostrarFormNueva((prev) => !prev);
            }}
          >
            {mostrarFormNueva ? t('adm.cerrarFormulario') : t('adm.sede.btnRegistrar')}
          </Boton>
        </div>

        {mostrarFormNueva && (
          <FormularioSede onGuardado={manejarGuardado} onCancelar={() => setMostrarFormNueva(false)} />
        )}

        {/* `key`: los campos solo se inicializan al montar; sin remonte, pasar de
            Editar A a Editar B dejaría los datos de A y Guardar los escribiría sobre B. */}
        {sedeEditar && (
          <FormularioSede
            key={sedeEditar.id}
            sede={sedeEditar}
            onGuardado={manejarGuardado}
            onCancelar={() => setSedeEditar(null)}
          />
        )}

        <div className={styles.tarjeta}>
          {avisoGuardado && <div className={styles.avisoInfo}>{avisoGuardado}</div>}
          {errorCarga && (
            <div className={styles.errorCarga}>
              <span>{errorCarga}</span>
              <Boton variante="secundario" onClick={() => { void cargar(); }}>
                {t('adm.reintentar')}
              </Boton>
            </div>
          )}

          {!errorCarga && cargando && <p className={styles.estadoCarga}>{t('adm.sede.cargandoLista')}</p>}

          {!errorCarga && !cargando && sedes.length === 0 && (
            <p className={styles.estadoVacio}>{t('adm.sede.vacio')}</p>
          )}

          {!errorCarga && !cargando && sedes.length > 0 && (
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>{t('adm.sede.thNombre')}</th>
                  <th>{t('adm.sede.thModo')}</th>
                  <th>{t('adm.estado')}</th>
                  <th className={styles.colAccion}></th>
                </tr>
              </thead>
              <tbody>
                {sedes.map((sede) => (
                  <tr key={sede.id} className={sede.activo ? undefined : styles.filaInactiva}>
                    <td>{sede.nombre}</td>
                    <td className={styles.contacto}>
                      {t(`adm.modo.${sede.modoExcepcion}`)}
                    </td>
                    <td>
                      <span className={sede.activo ? styles.badgeActivo : styles.badgeInactivo}>
                        {sede.activo ? t('adm.sede.activa') : t('adm.sede.inactiva')}
                      </span>
                    </td>
                    <td className={styles.colAccion}>
                      <button type="button" className={styles.botonAccion} onClick={() => abrirEdicion(sede)}>
                        {t('comun.editar')}
                      </button>
                      <button
                        type="button"
                        className={`${styles.botonAccion} ${sede.activo ? styles.botonPeligro : ''}`}
                        onClick={() => { void alternarActivo(sede); }}
                        disabled={actualizandoId === sede.id}
                      >
                        {sede.activo ? t('adm.sede.desactivar') : t('adm.sede.activar')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </LayoutPrincipal>
  );
}
