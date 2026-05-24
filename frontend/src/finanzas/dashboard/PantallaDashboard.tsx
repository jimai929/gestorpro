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
import { FormularioVenta } from './FormularioVenta';
import {
  obtenerSedes,
  obtenerGanancia,
  obtenerGastosPorCategoria,
  obtenerVentas,
} from './servicioDashboard';
import { formatearDinero, formatearFecha, primerDiaDelMes, fechaHoy } from './utilidades';
import type { Sede, ResumenGanancia, GastoPorCategoria, VentaDiaria } from './tipos';
import styles from './PantallaDashboard.module.css';

export function PantallaDashboard() {
  // Filtros
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(fechaHoy());
  const [sedeId, setSedeId] = useState('');

  // Datos del dashboard
  const [resumen, setResumen] = useState<ResumenGanancia | null>(null);
  const [categorias, setCategorias] = useState<GastoPorCategoria[]>([]);
  const [ventas, setVentas] = useState<VentaDiaria[]>([]);

  // Estados de carga
  const [cargandoDashboard, setCargandoDashboard] = useState(false);
  const [cargandoVentas, setCargandoVentas] = useState(false);
  const [errorDashboard, setErrorDashboard] = useState<string | null>(null);
  const [errorVentas, setErrorVentas] = useState<string | null>(null);

  // UI
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  // Cargar sedes al montar
  useEffect(() => {
    void obtenerSedes()
      .then(setSedes)
      .catch(() => {
        // Las sedes son opcionales para el filtro; no bloqueamos si fallan
      });
  }, []);

  /** Carga el resumen de ganancia y el desglose por categoría. */
  const cargarDashboard = useCallback(async () => {
    if (!desde || !hasta) return;
    setCargandoDashboard(true);
    setErrorDashboard(null);
    try {
      const filtros = { desde, hasta, ...(sedeId ? { sedeId } : {}) };
      const [resumenData, categoriasData] = await Promise.all([
        obtenerGanancia(filtros),
        obtenerGastosPorCategoria(filtros),
      ]);
      setResumen(resumenData);
      setCategorias(categoriasData);
    } catch (err) {
      setErrorDashboard(
        err instanceof Error ? err.message : 'Error al cargar el dashboard.',
      );
    } finally {
      setCargandoDashboard(false);
    }
  }, [desde, hasta, sedeId]);

  /** Carga la lista de ventas diarias del período. */
  const cargarVentas = useCallback(async () => {
    if (!desde || !hasta) return;
    setCargandoVentas(true);
    setErrorVentas(null);
    try {
      const filtros = { desde, hasta, ...(sedeId ? { sedeId } : {}) };
      const lista = await obtenerVentas(filtros);
      setVentas(lista);
    } catch (err) {
      setErrorVentas(
        err instanceof Error ? err.message : 'Error al cargar las ventas.',
      );
    } finally {
      setCargandoVentas(false);
    }
  }, [desde, hasta, sedeId]);

  // Cargar al montar y cuando cambian los filtros
  useEffect(() => {
    void cargarDashboard();
    void cargarVentas();
  }, [cargarDashboard, cargarVentas]);

  /** Tras registrar una venta, cerrar el formulario y refrescar todo. */
  const manejarVentaRegistrada = () => {
    setMostrarFormulario(false);
    void cargarDashboard();
    void cargarVentas();
  };

  // Calcular el total de gastos para los porcentajes de categorías
  const totalGastosCategorias = categorias.reduce((acc, c) => acc + c.total, 0);

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        {/* Barra de navegación de finanzas */}
        <nav className={styles.navFinanzas} aria-label="Módulos de finanzas">
          <NavLink
            to="/cuentas-por-pagar"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            Cuentas por pagar
          </NavLink>
          <NavLink
            to="/gastos"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            Gastos
          </NavLink>
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            Dashboard
          </NavLink>
        </nav>

        {/* Encabezado */}
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>Dashboard de ganancias</h1>
            <p className={styles.subtitulo}>
              Resumen financiero del período seleccionado
            </p>
          </div>
          <Boton onClick={() => setMostrarFormulario((prev) => !prev)}>
            {mostrarFormulario ? 'Cerrar formulario' : '+ Registrar cierre del día'}
          </Boton>
        </div>

        {/* Formulario de captura de venta diaria */}
        {mostrarFormulario && (
          <FormularioVenta onRegistrada={manejarVentaRegistrada} />
        )}

        {/* Filtros de período y sede */}
        <div className={styles.filtros}>
          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="filtro-desde">
              Desde
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
              Hasta
            </label>
            <input
              id="filtro-hasta"
              type="date"
              className={styles.inputFiltro}
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </div>

          {sedes.length > 0 && (
            <div className={styles.grupoFiltro}>
              <label className={styles.etiquetaFiltro} htmlFor="filtro-sede">
                Sede
              </label>
              <select
                id="filtro-sede"
                className={styles.inputFiltro}
                value={sedeId}
                onChange={(e) => setSedeId(e.target.value)}
              >
                <option value="">Todas las sedes</option>
                {sedes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          <Boton
            variante="secundario"
            onClick={() => {
              void cargarDashboard();
              void cargarVentas();
            }}
            disabled={!desde || !hasta || cargandoDashboard}
          >
            Filtrar
          </Boton>
        </div>

        {/* ── Tarjetas de resumen ── */}
        {errorDashboard && (
          <div className={styles.errorCarga}>
            <span>{errorDashboard}</span>
            <Boton variante="secundario" onClick={() => { void cargarDashboard(); }}>
              Reintentar
            </Boton>
          </div>
        )}

        {!errorDashboard && cargandoDashboard && (
          <p className={styles.estadoCarga}>Calculando ganancias…</p>
        )}

        {!errorDashboard && !cargandoDashboard && resumen && (
          <>
            <div className={styles.cuadriculaTarjetas}>
              {/* Ventas */}
              <div className={styles.tarjetaMetrica}>
                <span className={styles.etiquetaMetrica}>Ventas</span>
                <span className={styles.valorMetrica}>
                  {formatearDinero(resumen.ventas)}
                </span>
                <span className={styles.descripcionMetrica}>Total de cierres del período</span>
              </div>

              {/* Compras */}
              <div className={styles.tarjetaMetrica}>
                <span className={styles.etiquetaMetrica}>Compras</span>
                <span className={styles.valorMetrica}>
                  {formatearDinero(resumen.compras)}
                </span>
                <span className={styles.descripcionMetrica}>Devengado (fecha de factura)</span>
              </div>

              {/* Gastos */}
              <div className={styles.tarjetaMetrica}>
                <span className={styles.etiquetaMetrica}>Gastos</span>
                <span className={styles.valorMetrica}>
                  {formatearDinero(resumen.gastos)}
                </span>
                <span className={styles.descripcionMetrica}>Gastos operativos del período</span>
              </div>

              {/* Ganancia — destacada, verde/roja según signo */}
              <div
                className={[
                  styles.tarjetaMetrica,
                  styles.tarjetaGanancia,
                  resumen.ganancia >= 0 ? styles.gananciaPositiva : styles.gananciaNegativa,
                ].join(' ')}
              >
                <span className={styles.etiquetaMetricaGanancia}>Ganancia</span>
                <span className={styles.valorMetricaGanancia}>
                  {formatearDinero(resumen.ganancia)}
                </span>
                <span className={styles.descripcionMetrica}>
                  Ventas − compras − gastos
                </span>
              </div>
            </div>

            {/* ── Gastos por categoría ── */}
            {categorias.length > 0 && (
              <div className={styles.tarjeta}>
                <h2 className={styles.tituloSeccion}>Gastos por categoría</h2>
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
                            aria-label={`${porcentaje.toFixed(1)}% del total de gastos`}
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
                  No hay gastos registrados en el período seleccionado.
                </p>
              </div>
            )}
          </>
        )}

        {/* ── Lista de ventas del período ── */}
        <div className={styles.tarjeta}>
          <div className={styles.encabezadoSeccion}>
            <h2 className={styles.tituloSeccion}>Cierres de ventas del período</h2>
          </div>

          {errorVentas && (
            <div className={styles.errorCarga}>
              <span>{errorVentas}</span>
              <Boton variante="secundario" onClick={() => { void cargarVentas(); }}>
                Reintentar
              </Boton>
            </div>
          )}

          {!errorVentas && cargandoVentas && (
            <p className={styles.estadoCarga}>Cargando ventas…</p>
          )}

          {!errorVentas && !cargandoVentas && ventas.length === 0 && (
            <p className={styles.estadoVacio}>
              No hay cierres registrados en el período seleccionado.
            </p>
          )}

          {!errorVentas && !cargandoVentas && ventas.length > 0 && (
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Sede</th>
                  <th>Total</th>
                  <th>Tipo</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map((venta) => (
                  <tr key={venta.id}>
                    <td>{formatearFecha(venta.fechaOperacion)}</td>
                    <td>
                      {sedes.find((s) => s.id === venta.sedeId)?.nombre ?? venta.sedeId}
                    </td>
                    <td className={styles.monto}>{formatearDinero(venta.monto)}</td>
                    <td>
                      <span
                        className={
                          venta.tipo === 'normal'
                            ? styles.badgeNormal
                            : styles.badgeCorreccion
                        }
                      >
                        {venta.tipo === 'normal' ? 'Normal' : 'Corrección'}
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
