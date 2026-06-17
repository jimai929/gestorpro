/**
 * Pantalla del dashboard de ganancias y captura de ventas diarias.
 *
 * Muestra:
 * - Barra de navegación entre módulos de finanzas (con el enlace a Dashboard).
 * - Selector de período (desde / hasta; por defecto el mes en curso) y
 *   filtro opcional por sede.
 * - Tarjetas de resumen: Ventas, Compras, Gastos y Ganancia del período.
 *   La ganancia se destaca y cambia de color (verde positivo, rojo negativo).
 * - Lista de gastos por categoría con el monto y porcentaje visual.
 * - Formulario para registrar el cierre diario (toggle) y lista de ventas recientes.
 *   Tras registrar, se refresca el dashboard y la lista de ventas.
 *
 * Rutas de API que utiliza:
 *   GET  /sedes                              → selector de sede
 *   GET  /dashboard/ganancia?desde&hasta     → tarjetas de resumen
 *   GET  /dashboard/gastos-por-categoria?..  → desglose por categoría
 *   POST /ventas                             → registrar cierre
 *   GET  /ventas?desde&hasta                 → lista de ventas del período
 */

import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { FormularioVenta } from './FormularioVenta';
import {
  obtenerSedes,
  obtenerGanancia,
  obtenerGastosPorCategoria,
  obtenerVentas,
  obtenerCajeras,
} from './servicioDashboard';
import { formatearDinero, formatearFecha, primerDiaDelMes, fechaHoy } from './utilidades';
import { TURNOS } from './tipos';
import type { Sede, ResumenGanancia, GastoPorCategoria, VentaDiaria, TurnoVenta } from './tipos';
import styles from './PantallaDashboard.module.css';

export function PantallaDashboard() {
  const { t } = useTraduccion();
  // Filtros
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [cajeras, setCajeras] = useState<string[]>([]);
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(fechaHoy());
  const [sedeId, setSedeId] = useState('');
  const [cajera, setCajera] = useState('');
  const [turno, setTurno] = useState<TurnoVenta | ''>('');

  // Datos del dashboard
  const [resumen, setResumen] = useState<ResumenGanancia | null>(null);
  const [categorias, setCategorias] = useState<GastoPorCategoria[]>([]);
  const [ventas, setVentas] = useState<VentaDiaria[]>([]);

  // Estados de carga
  const [cargandoDashboard, setCargandoDashboard] = useState(false);
  const [cargandoVentas, setCargandoVentas] = useState(false);
  const [errorDashboard, setErrorDashboard] = useState<string | null>(null);
  const [errorVentas, setErrorVentas] = useState<string | null>(null);
  // Estado propio del filtro de cajeras: distingue "cargando" de "falló" de
  // "cargó y está vacío", para no mostrar "Todas" como si todo estuviera bien
  // cuando en realidad el fetch falló.
  const [cargandoCajeras, setCargandoCajeras] = useState(true);
  const [errorCajeras, setErrorCajeras] = useState<string | null>(null);
  // Mismo criterio para las sedes del filtro: distinguir cargando / falló /
  // cargó-vacío, para no esconder el filtro ni mostrar el UUID crudo en la
  // columna Sede en silencio cuando el fetch falla.
  const [cargandoSedes, setCargandoSedes] = useState(true);
  const [errorSedes, setErrorSedes] = useState<string | null>(null);

  // UI
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  // Feedback de registro: aviso de éxito persistente + id de la fila a resaltar.
  const [avisoExito, setAvisoExito] = useState<string | null>(null);
  const [idResaltado, setIdResaltado] = useState<string | null>(null);

  /**
   * Carga los valores de cajera para el filtro. No se traga el error: si falla,
   * lo registra en `errorCajeras` para avisar (y permitir reintentar), en vez de
   * dejar el select vacío fingiendo que "Todas" es la lista completa.
   */
  const cargarCajeras = useCallback(() => {
    setCargandoCajeras(true);
    setErrorCajeras(null);
    void obtenerCajeras()
      .then(setCajeras)
      .catch(() => setErrorCajeras(t('fin.dash.errCajeras')))
      .finally(() => setCargandoCajeras(false));
  }, [t]);

  /**
   * Carga las sedes para el filtro. No se traga el error (dejaría el filtro
   * escondido y la columna Sede mostrando UUIDs como si todo estuviera bien);
   * lo registra en `errorSedes` para avisar y permitir reintentar.
   */
  const cargarSedes = useCallback(() => {
    setCargandoSedes(true);
    setErrorSedes(null);
    void obtenerSedes()
      .then(setSedes)
      .catch(() => setErrorSedes(t('fin.dash.errSedes')))
      .finally(() => setCargandoSedes(false));
  }, [t]);

  // Cargar sedes y valores de cajera (para los filtros) al montar.
  useEffect(() => {
    cargarSedes();
    cargarCajeras();
  }, [cargarSedes, cargarCajeras]);

  /** Carga el resumen de ganancia y el desglose por categoría. */
  const cargarDashboard = useCallback(async () => {
    if (!desde || !hasta) return;
    setCargandoDashboard(true);
    setErrorDashboard(null);
    try {
      const filtros = {
        desde,
        hasta,
        ...(sedeId ? { sedeId } : {}),
        ...(cajera ? { cajera } : {}),
        ...(turno ? { turno } : {}),
      };
      const [resumenData, categoriasData] = await Promise.all([
        obtenerGanancia(filtros),
        obtenerGastosPorCategoria(filtros),
      ]);
      setResumen(resumenData);
      setCategorias(categoriasData);
    } catch (err) {
      setErrorDashboard(
        err instanceof Error ? err.message : t('fin.dash.errDashboard'),
      );
    } finally {
      setCargandoDashboard(false);
    }
  }, [desde, hasta, sedeId, cajera, turno, t]);

  /** Carga la lista de ventas diarias del período. */
  const cargarVentas = useCallback(async () => {
    if (!desde || !hasta) return;
    setCargandoVentas(true);
    setErrorVentas(null);
    try {
      const filtros = {
        desde,
        hasta,
        ...(sedeId ? { sedeId } : {}),
        ...(cajera ? { cajera } : {}),
        ...(turno ? { turno } : {}),
      };
      const lista = await obtenerVentas(filtros);
      setVentas(lista);
    } catch (err) {
      setErrorVentas(
        err instanceof Error ? err.message : t('fin.dash.errVentas'),
      );
    } finally {
      setCargandoVentas(false);
    }
  }, [desde, hasta, sedeId, cajera, turno, t]);

  // Cargar al montar y cuando cambian los filtros
  useEffect(() => {
    void cargarDashboard();
    void cargarVentas();
  }, [cargarDashboard, cargarVentas]);

  // El aviso de éxito y el resaltado se desvanecen solos tras unos segundos.
  useEffect(() => {
    if (!avisoExito) return;
    const temporizador = setTimeout(() => {
      setAvisoExito(null);
      setIdResaltado(null);
    }, 6000);
    return () => clearTimeout(temporizador);
  }, [avisoExito]);

  /**
   * Tras registrar una venta: cerrar el formulario, dejar un aviso de éxito
   * visible en el dashboard (sobrevive al cierre del formulario), marcar la fila
   * nueva para resaltarla y refrescar el dashboard y la lista.
   */
  const manejarVentaRegistrada = (venta: VentaDiaria) => {
    setMostrarFormulario(false);
    setAvisoExito(
      t('fin.dash.avisoExito', {
        fecha: formatearFecha(venta.fechaOperacion),
        monto: formatearDinero(venta.monto),
      }),
    );
    setIdResaltado(venta.id);
    void cargarDashboard();
    void cargarVentas();
    void cargarCajeras();
  };

  // Calcular el total de gastos para los porcentajes de categorías
  const totalGastosCategorias = categorias.reduce((acc, c) => acc + c.total, 0);

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
            <h1 className={styles.tituloPagina}>{t('fin.dash.titulo')}</h1>
            <p className={styles.subtitulo}>
              {t('fin.dash.subtitulo')}
            </p>
          </div>
          <Boton onClick={() => setMostrarFormulario((prev) => !prev)}>
            {mostrarFormulario ? t('fin.cerrarFormulario') : t('fin.dash.btnRegistrar')}
          </Boton>
        </div>

        {/* Aviso de éxito: persiste tras cerrarse el formulario, con cierre manual */}
        {avisoExito && (
          <div className={styles.avisoExito} role="status">
            <span className={styles.avisoExitoTexto}>
              <span className={styles.avisoExitoIcono} aria-hidden="true">✓</span>
              {avisoExito}
            </span>
            <button
              type="button"
              className={styles.cerrarAviso}
              onClick={() => { setAvisoExito(null); setIdResaltado(null); }}
              aria-label={t('fin.dash.cerrarAviso')}
            >
              ✕
            </button>
          </div>
        )}

        {/* Formulario de captura de venta diaria */}
        {mostrarFormulario && (
          <FormularioVenta onRegistrada={manejarVentaRegistrada} />
        )}

        {/* Filtros de período y sede */}
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

          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="filtro-sede">
              {t('fin.dash.sede')}
            </label>
            <select
              id="filtro-sede"
              className={styles.inputFiltro}
              value={sedeId}
              onChange={(e) => setSedeId(e.target.value)}
              disabled={cargandoSedes || errorSedes !== null}
            >
              <option value="">
                {cargandoSedes
                  ? t('fin.dash.cargandoSedes')
                  : errorSedes
                    ? t('fin.noDisponible')
                    : t('fin.dash.todasSedes')}
              </option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
            {/* Falló la carga: avisar y ofrecer reintento. Sin sedes el filtro
                queda inservible y la columna Sede cae a "Sede no disponible". */}
            {errorSedes && (
              <span className={styles.ayudaFiltroError}>
                {errorSedes}{' '}
                <button
                  type="button"
                  className={styles.enlaceReintentar}
                  onClick={cargarSedes}
                >
                  {t('fin.reintentar')}
                </button>
              </span>
            )}
            {/* Cargó bien pero no hay ninguna sede todavía: estado vacío,
                simétrico con el del filtro de cajeras (no se oculta el grupo). */}
            {!cargandoSedes && !errorSedes && sedes.length === 0 && (
              <span className={styles.ayudaFiltro}>
                {t('fin.dash.sinSedes')}
              </span>
            )}
          </div>

          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="filtro-turno">
              {t('fin.dash.turno')}
            </label>
            <select
              id="filtro-turno"
              className={styles.inputFiltro}
              value={turno}
              onChange={(e) => setTurno(e.target.value as TurnoVenta | '')}
            >
              <option value="">{t('fin.dash.todosTurnos')}</option>
              {TURNOS.map((opcionTurno) => (
                <option key={opcionTurno.turno} value={opcionTurno.turno}>
                  {t(`fin.turno.${opcionTurno.turno}`)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="filtro-cajera">
              {t('fin.dash.cajera')}
            </label>
            <select
              id="filtro-cajera"
              className={styles.inputFiltro}
              value={cajera}
              onChange={(e) => setCajera(e.target.value)}
              disabled={cargandoCajeras || errorCajeras !== null}
            >
              <option value="">
                {cargandoCajeras
                  ? t('fin.dash.cargandoCajeras')
                  : errorCajeras
                    ? t('fin.noDisponible')
                    : t('fin.dash.todasCajeras')}
              </option>
              {cajeras.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            {/* Falló la carga: avisar y ofrecer reintento, no fingir "Todas". */}
            {errorCajeras && (
              <span className={styles.ayudaFiltroError}>
                {errorCajeras}{' '}
                <button
                  type="button"
                  className={styles.enlaceReintentar}
                  onClick={cargarCajeras}
                >
                  {t('fin.reintentar')}
                </button>
              </span>
            )}
            {/* Cargó bien pero no hay ninguna cajera en los cierres todavía. */}
            {!cargandoCajeras && !errorCajeras && cajeras.length === 0 && (
              <span className={styles.ayudaFiltro}>
                {t('fin.dash.sinCajeras')}
              </span>
            )}
          </div>

          <Boton
            variante="secundario"
            onClick={() => {
              void cargarDashboard();
              void cargarVentas();
            }}
            disabled={!desde || !hasta || cargandoDashboard}
          >
            {t('comun.filtrar')}
          </Boton>
        </div>

        {/* ── Tarjetas de resumen ── */}
        {errorDashboard && (
          <div className={styles.errorCarga}>
            <span>{errorDashboard}</span>
            <Boton variante="secundario" onClick={() => { void cargarDashboard(); }}>
              {t('fin.reintentar')}
            </Boton>
          </div>
        )}

        {!errorDashboard && cargandoDashboard && (
          <p className={styles.estadoCarga}>{t('fin.dash.calculando')}</p>
        )}

        {!errorDashboard && !cargandoDashboard && resumen && (
          <>
            {(cajera || turno) && (
              <p className={styles.notaFiltroVentas}>
                {t('fin.dash.notaFiltroA')}<strong>{t('fin.dash.cardVentas')}</strong>{t('fin.dash.notaFiltroB')}
              </p>
            )}
            <div className={styles.cuadriculaTarjetas}>
              {/* Ventas */}
              <div className={styles.tarjetaMetrica}>
                <span className={styles.etiquetaMetrica}>{t('fin.dash.cardVentas')}</span>
                <span className={styles.valorMetrica}>
                  {formatearDinero(resumen.ventas)}
                </span>
                <span className={styles.descripcionMetrica}>{t('fin.dash.descVentas')}</span>
              </div>

              {/* Compras */}
              <div className={styles.tarjetaMetrica}>
                <span className={styles.etiquetaMetrica}>{t('fin.dash.cardCompras')}</span>
                <span className={styles.valorMetrica}>
                  {formatearDinero(resumen.compras)}
                </span>
                <span className={styles.descripcionMetrica}>{t('fin.dash.descCompras')}</span>
              </div>

              {/* Gastos */}
              <div className={styles.tarjetaMetrica}>
                <span className={styles.etiquetaMetrica}>{t('fin.dash.cardGastos')}</span>
                <span className={styles.valorMetrica}>
                  {formatearDinero(resumen.gastos)}
                </span>
                <span className={styles.descripcionMetrica}>{t('fin.dash.descGastos')}</span>
              </div>

              {/* Ganancia — destacada, verde/roja según signo */}
              <div
                className={[
                  styles.tarjetaMetrica,
                  styles.tarjetaGanancia,
                  resumen.ganancia >= 0 ? styles.gananciaPositiva : styles.gananciaNegativa,
                ].join(' ')}
              >
                <span className={styles.etiquetaMetricaGanancia}>{t('fin.dash.cardGanancia')}</span>
                <span className={styles.valorMetricaGanancia}>
                  {formatearDinero(resumen.ganancia)}
                </span>
                <span className={styles.descripcionMetrica}>
                  {t('fin.dash.descGanancia')}
                </span>
              </div>
            </div>

            {/* ── Gastos por categoría ── */}
            {categorias.length > 0 && (
              <div className={styles.tarjeta}>
                <h2 className={styles.tituloSeccion}>{t('fin.dash.gastosPorCategoria')}</h2>
                <div className={styles.listaCategorias}>
                  {categorias.map((cat) => {
                    const porcentaje =
                      totalGastosCategorias > 0
                        ? (cat.total / totalGastosCategorias) * 100
                        : 0;
                    return (
                      <div key={cat.categoriaId} className={styles.filaCat}>
                        <div className={styles.infoCategoria}>
                          <span className={styles.nombreCategoria}>{cat.nombre}</span>
                          <span className={styles.montoCat}>
                            {formatearDinero(cat.total)}
                          </span>
                        </div>
                        <div className={styles.barraContenedor}>
                          <div
                            className={styles.barraRelleno}
                            style={{ width: `${porcentaje.toFixed(1)}%` }}
                            aria-label={t('fin.dash.ariaPorcentaje', { p: porcentaje.toFixed(1) })}
                          />
                        </div>
                        <span className={styles.porcentajeCat}>
                          {porcentaje.toFixed(1)}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {categorias.length === 0 && !cargandoDashboard && (
              <div className={styles.tarjeta}>
                <p className={styles.estadoVacio}>
                  {t('fin.gasto.vacio')}
                </p>
              </div>
            )}
          </>
        )}

        {/* ── Lista de ventas del período ── */}
        <div className={styles.tarjeta}>
          <div className={styles.encabezadoSeccion}>
            <h2 className={styles.tituloSeccion}>{t('fin.dash.cierresPeriodo')}</h2>
          </div>

          {errorVentas && (
            <div className={styles.errorCarga}>
              <span>{errorVentas}</span>
              <Boton variante="secundario" onClick={() => { void cargarVentas(); }}>
                {t('fin.reintentar')}
              </Boton>
            </div>
          )}

          {!errorVentas && cargandoVentas && (
            <p className={styles.estadoCarga}>{t('fin.dash.cargandoVentas')}</p>
          )}

          {!errorVentas && !cargandoVentas && ventas.length === 0 && (
            <p className={styles.estadoVacio}>
              {t('fin.dash.sinCierres')}
            </p>
          )}

          {!errorVentas && !cargandoVentas && ventas.length > 0 && (
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>{t('fin.dash.thFecha')}</th>
                  <th>{t('fin.dash.thSede')}</th>
                  <th>{t('fin.dash.thTurno')}</th>
                  <th>{t('fin.dash.thCajera')}</th>
                  <th>{t('fin.dash.thCerradoPor')}</th>
                  <th>{t('fin.dash.thTotalArqueo')}</th>
                  <th>{t('fin.dash.thTipo')}</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((venta) => (
                  <tr
                    key={venta.id}
                    className={venta.id === idResaltado ? styles.filaResaltada : undefined}
                  >
                    <td>{formatearFecha(venta.fechaOperacion)}</td>
                    <td>
                      {sedes.find((s) => s.id === venta.sedeId)?.nombre ?? t('fin.dash.sedeNoDisponible')}
                    </td>
                    <td>{t(`fin.turno.${venta.turno}`)}</td>
                    <td>{venta.cajera}</td>
                    <td>{venta.cerradoPor}</td>
                    <td>
                      <div className={styles.celdaTotal}>
                        <span className={styles.montoTotal}>{formatearDinero(venta.monto)}</span>
                        {venta.detalles.length > 0 && (
                          <span className={styles.desgloseArqueo}>
                            {venta.detalles
                              .map(
                                (d) =>
                                  `${t(`fin.arqueo.${d.tipoArqueo}`)}: ${formatearDinero(d.monto)}`,
                              )
                              .join(' · ')}
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span
                        className={
                          venta.tipo === 'normal'
                            ? styles.badgeNormal
                            : styles.badgeCorreccion
                        }
                      >
                        {venta.tipo === 'normal' ? t('fin.dash.tipoNormal') : t('fin.dash.tipoCorreccion')}
                      </span>
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
