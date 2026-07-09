/**
 * Pantalla de gestión de categorías de gasto (área de Finanzas).
 *
 * Cada empresa maneja su PROPIO catálogo de categorías (flexible, sin límite, sin
 * catálogo global). Lista todas (activas e inactivas), permite crear, renombrar y
 * dar de baja/alta lógica (`activo`). La baja NUNCA borra: los gastos históricos la
 * referencian; una categoría inactiva deja de aparecer en el select del formulario
 * de gasto.
 *
 * Permisos (UI de conveniencia; la frontera real es el backend `soloGestion`):
 * solo administrador/supervisor ven los controles de gestión; el resto ve el listado.
 */

import { useState, useEffect, useCallback } from 'react';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useAuth } from '../../core/auth/ContextoAuth';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { FormularioCategoria } from './FormularioCategoria';
import {
  obtenerCategoriasGasto,
  actualizarCategoria,
  desactivarCategoria,
} from './servicioGastos';
import { type CategoriaGasto } from './tipos';
import styles from './PantallaCategorias.module.css';

export function PantallaCategorias() {
  const { t } = useTraduccion();
  const { usuario } = useAuth();
  const puedeGestionar = usuario?.rol === 'administrador' || usuario?.rol === 'supervisor';

  // Tema oscuro: montado mientras esta pantalla vive; se restaura al salir.
  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', 'dark');
    return () => {
      if (previo === null) raiz.removeAttribute('data-theme');
      else raiz.setAttribute('data-theme', previo);
    };
  }, []);

  const [categorias, setCategorias] = useState<CategoriaGasto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [mostrarFormNueva, setMostrarFormNueva] = useState(false);
  const [categoriaEditar, setCategoriaEditar] = useState<CategoriaGasto | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setCategorias(await obtenerCategoriasGasto({ incluirInactivas: true }));
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : t('fin.categoria.errCargar'));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const manejarGuardado = () => {
    setMostrarFormNueva(false);
    setCategoriaEditar(null);
    void cargar();
  };

  const alternarActivo = async (categoria: CategoriaGasto) => {
    setActualizandoId(categoria.id);
    setErrorCarga(null);
    try {
      if (categoria.activo) await desactivarCategoria(categoria.id);
      else await actualizarCategoria(categoria.id, { activo: true });
      await cargar();
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : t('fin.categoria.errGuardar'));
    } finally {
      setActualizandoId(null);
    }
  };

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>{t('fin.navCategorias')}</h1>
            <p className={styles.subtitulo}>{t('fin.categoria.subtitulo')}</p>
          </div>
          {puedeGestionar && (
            <Boton
              onClick={() => {
                setCategoriaEditar(null);
                setMostrarFormNueva((prev) => !prev);
              }}
            >
              {mostrarFormNueva ? t('fin.categoria.cerrarForm') : t('fin.categoria.btnNueva')}
            </Boton>
          )}
        </div>

        {puedeGestionar && mostrarFormNueva && (
          <FormularioCategoria
            onGuardado={manejarGuardado}
            onCancelar={() => setMostrarFormNueva(false)}
          />
        )}

        {puedeGestionar && categoriaEditar && (
          <FormularioCategoria
            categoria={categoriaEditar}
            onGuardado={manejarGuardado}
            onCancelar={() => setCategoriaEditar(null)}
          />
        )}

        <div className={styles.tarjeta}>
          {errorCarga && (
            <div className={styles.errorCarga}>
              <span>{errorCarga}</span>
              <Boton variante="secundario" onClick={() => { void cargar(); }}>
                {t('fin.categoria.reintentar')}
              </Boton>
            </div>
          )}

          {!errorCarga && cargando && <p className={styles.estadoCarga}>{t('comun.cargando')}</p>}

          {!errorCarga && !cargando && categorias.length === 0 && (
            <p className={styles.estadoVacio}>{t('fin.categoria.vacio')}</p>
          )}

          {!errorCarga && !cargando && categorias.length > 0 && (
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>{t('fin.categoria.thNombre')}</th>
                  <th>{t('fin.categoria.thTipo')}</th>
                  <th>{t('fin.categoria.thEstado')}</th>
                  {puedeGestionar && <th className={styles.colAccion}></th>}
                </tr>
              </thead>
              <tbody>
                {categorias.map((categoria) => (
                  <tr key={categoria.id} className={categoria.activo ? undefined : styles.filaInactiva}>
                    <td>{categoria.nombre}</td>
                    <td>
                      <span className={styles.badgeTipo}>
                        {categoria.esPagoEmpleado
                          ? t('fin.categoria.tipoPagoEmpleado')
                          : t('fin.categoria.tipoNormal')}
                      </span>
                    </td>
                    <td>
                      <span className={categoria.activo ? styles.badgeActivo : styles.badgeInactivo}>
                        {categoria.activo ? t('fin.categoria.activa') : t('fin.categoria.inactiva')}
                      </span>
                    </td>
                    {puedeGestionar && (
                      <td className={styles.colAccion}>
                        <button
                          type="button"
                          className={styles.botonAccion}
                          onClick={() => {
                            setMostrarFormNueva(false);
                            setCategoriaEditar(categoria);
                          }}
                        >
                          {t('comun.editar')}
                        </button>
                        <button
                          type="button"
                          className={`${styles.botonAccion} ${categoria.activo ? styles.botonPeligro : ''}`}
                          onClick={() => { void alternarActivo(categoria); }}
                          disabled={actualizandoId === categoria.id}
                        >
                          {categoria.activo ? t('fin.categoria.desactivar') : t('fin.categoria.activar')}
                        </button>
                      </td>
                    )}
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
