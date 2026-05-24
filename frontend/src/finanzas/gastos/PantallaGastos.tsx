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
import { FormularioGasto } from './FormularioGasto';
import { obtenerGastos } from './servicioGastos';
import { formatearDinero, formatearFecha, primerDiaDelMes, fechaHoy } from './utilidades';
import type { Gasto } from './tipos';
import styles from './PantallaGastos.module.css';

export function PantallaGastos() {
  // Lista de gastos
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Filtros de período
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(fechaHoy());

  // Estado de UI
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

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
        err instanceof Error ? err.message : 'Error al cargar los gastos.',
      );
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

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
            <h1 className={styles.tituloPagina}>Gastos</h1>
            <p className={styles.subtitulo}>Registro y consulta de gastos operativos</p>
          </div>
          <Boton onClick={() => setMostrarFormulario((prev) => !prev)}>
            {mostrarFormulario ? 'Cerrar formulario' : '+ Registrar gasto'}
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

          <Boton
            variante="secundario"
            onClick={() => { void cargarGastos(); }}
            disabled={!desde || !hasta || cargando}
          >
            Filtrar
          </Boton>
        </div>

        {/* Tabla de gastos */}
        <div className={styles.tarjeta}>
          {errorCarga && (
            <div className={styles.errorCarga}>
              <span>{errorCarga}</span>
              <Boton variante="secundario" onClick={() => { void cargarGastos(); }}>
                Reintentar
              </Boton>
            </div>
          )}

          {!errorCarga && cargando && (
            <p className={styles.estadoCarga}>Cargando gastos…</p>
          )}

          {!errorCarga && !cargando && gastos.length === 0 && (
            <p className={styles.estadoVacio}>
              No hay gastos registrados en el período seleccionado.
            </p>
          )}

          {!errorCarga && !cargando && gastos.length > 0 && (
            <>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th>Descripción</th>
                    <th>Monto</th>
                    <th>Fecha</th>
                    <th>Empleado</th>
                    <th>Tipo de pago</th>
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
                            {gasto.empleadoId}
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
                  Total del período ({gastos.length}{' '}
                  {gastos.length === 1 ? 'gasto' : 'gastos'}):
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
