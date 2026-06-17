/**
 * Pantalla principal del módulo de gastos.
 *
 * Muestra:
 * - Barra de navegación entre módulos de finanzas.
 * - Formulario para registrar un nuevo gasto (con regla de coherencia de empleado).
 * - Filtros de período (desde / hasta) y lista de gastos.
 *
 * Rutas de API que utiliza:
 *   GET  /categorias-gasto  → para el formulario
 *   GET  /sedes             → para el formulario
 *   POST /gastos            → registrar gasto
 *   GET  /gastos?desde&hasta → listar por período
 */

import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { FormularioGasto } from './FormularioGasto';
import { obtenerGastos, obtenerEmpleados } from './servicioGastos';
import { formatearDinero, formatearFecha, primerDiaDelMes, fechaHoy } from './utilidades';
import type { Gasto } from './tipos';
import styles from './PantallaGastos.module.css';

export function PantallaGastos() {
  const { t } = useTraduccion();
  // Lista de gastos
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Filtros de período
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(fechaHoy());

  // Estado de UI
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  // Mapa empleadoId → "número - nombre" para mostrar el empleado del gasto
  // (el backend solo devuelve empleadoId). Carga no crítica: si falla, se
  // muestra el id crudo como respaldo.
  const [empleadosPorId, setEmpleadosPorId] = useState<Record<string, string>>({});

  useEffect(() => {
    let activo = true;
    void obtenerEmpleados()
      .then((lista) => {
        if (activo) {
          setEmpleadosPorId(
            Object.fromEntries(lista.map((e) => [e.id, `${e.numero} - ${e.nombre}`])),
          );
        }
      })
      .catch(() => {
        /* no crítico: la celda cae al empleadoId crudo */
      });
    return () => {
      activo = false;
    };
  }, []);

  /** Carga (o recarga) la lista de gastos del período. */
  const cargarGastos = useCallback(async () => {
    if (!desde || !hasta) return;
    setCargando(true);
    setErrorCarga(null);
    try {
      const lista = await obtenerGastos({ desde, hasta });
      setGastos(lista);
    } catch (err) {
      setErrorCarga(
        err instanceof Error ? err.message : t('fin.gasto.errCargar'),
      );
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, t]);

  // Cargar al montar
  useEffect(() => {
    void cargarGastos();
  }, [cargarGastos]);

  /** Tras registrar un gasto, cerrar el formulario y refrescar la lista. */
  const manejarGastoRegistrado = () => {
    setMostrarFormulario(false);
    void cargarGastos();
  };

  // Total del período
  const totalPeriodo = gastos.reduce((acc, g) => acc + g.monto, 0);

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        {/* Barra de navegación de finanzas */}
        <nav className={styles.navFinanzas} aria-label={t('fin.ariaNavFinanzas')}>
          <NavLink
            to="/cuentas-por-pagar"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            {t('nav.cuentasPorPagar')}
          </NavLink>
          <NavLink
            to="/proveedores"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            {t('fin.navProveedores')}
          </NavLink>
          <NavLink
            to="/gastos"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            {t('nav.gastos')}
          </NavLink>
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            {t('nav.dashboard')}
          </NavLink>
        </nav>

        {/* Encabezado */}
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>{t('nav.gastos')}</h1>
            <p className={styles.subtitulo}>{t('fin.gasto.subtitulo')}</p>
          </div>
          <Boton onClick={() => setMostrarFormulario((prev) => !prev)}>
            {mostrarFormulario ? t('fin.cerrarFormulario') : t('fin.gasto.btnRegistrar')}
          </Boton>
        </div>

        {/* Formulario de nuevo gasto */}
        {mostrarFormulario && (
          <FormularioGasto onRegistrado={manejarGastoRegistrado} />
        )}

        {/* Filtros de período */}
        <div className={styles.filtros}>
          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="filtro-desde">
              {t('comun.desde')}
            </label>
            <input
              id="filtro-desde"
              type="date"
              className={styles.inputFiltro}
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </div>

          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="filtro-hasta">
              {t('comun.hasta')}
            </label>
            <input
              id="filtro-hasta"
              type="date"
              className={styles.inputFiltro}
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>

          <Boton
            variante="secundario"
            onClick={() => { void cargarGastos(); }}
            disabled={!desde || !hasta || cargando}
          >
            {t('comun.filtrar')}
          </Boton>
        </div>

        {/* Tabla de gastos */}
        <div className={styles.tarjeta}>
          {errorCarga && (
            <div className={styles.errorCarga}>
              <span>{errorCarga}</span>
              <Boton variante="secundario" onClick={() => { void cargarGastos(); }}>
                {t('fin.reintentar')}
              </Boton>
            </div>
          )}

          {!errorCarga && cargando && (
            <p className={styles.estadoCarga}>{t('fin.gasto.cargandoLista')}</p>
          )}

          {!errorCarga && !cargando && gastos.length === 0 && (
            <p className={styles.estadoVacio}>
              {t('fin.gasto.vacio')}
            </p>
          )}

          {!errorCarga && !cargando && gastos.length > 0 && (
            <>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>{t('fin.gasto.thCategoria')}</th>
                    <th>{t('fin.gasto.thDescripcion')}</th>
                    <th>{t('fin.gasto.thMonto')}</th>
                    <th>{t('fin.gasto.thFecha')}</th>
                    <th>{t('fin.gasto.thEmpleado')}</th>
                    <th>{t('fin.gasto.thTipoPago')}</th>
                  </tr>
                </thead>
                <tbody>
                  {gastos.map((gasto) => (
                    <tr key={gasto.id}>
                      <td>{gasto.categoria.nombre}</td>
                      <td>{gasto.descripcion ?? '—'}</td>
                      <td className={styles.monto}>
                        {formatearDinero(gasto.monto)}
                      </td>
                      <td>{formatearFecha(gasto.fechaOperacion)}</td>
                      <td className={styles.celdaEmpleado}>
                        {gasto.categoria.esPagoEmpleado && gasto.empleadoId ? (
                          <span className={styles.badgeEmpleado}>
                            {empleadosPorId[gasto.empleadoId] ?? gasto.empleadoId}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className={styles.celdaEmpleado}>
                        {gasto.tipoPago ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Resumen total del período */}
              <div className={styles.resumen}>
                <span className={styles.resumenEtiqueta}>
                  {t('fin.gasto.totalPeriodo', {
                    n: gastos.length,
                    unidad: t(gastos.length === 1 ? 'fin.gasto.unidadSingular' : 'fin.gasto.unidadPlural'),
                  })}
                </span>
                <span className={styles.resumenMonto}>
                  {formatearDinero(totalPeriodo)}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </LayoutPrincipal>
  );
}
