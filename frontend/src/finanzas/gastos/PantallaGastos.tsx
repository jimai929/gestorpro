/**
 * Pantalla principal del módulo de gastos.
 *
 * Muestra:
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
import { Link } from 'react-router';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useAuth } from '../../core/auth/ContextoAuth';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { FormularioGasto } from './FormularioGasto';
import { DialogoCorreccion } from '../correcciones';
import { obtenerGastos, obtenerEmpleados } from './servicioGastos';
import { formatearDinero, formatearFecha, primerDiaDelMes, fechaHoy } from './utilidades';
import type { Gasto } from './tipos';
import styles from './PantallaGastos.module.css';

export function PantallaGastos() {
  const { t } = useTraduccion();
  const { usuario } = useAuth();
  // Corregir dinero es una acción de GESTIÓN: el backend la limita a
  // supervisor/administrador (POST /correcciones). La UI se alinea con ese guard.
  const puedeCorregir = usuario?.rol === 'administrador' || usuario?.rol === 'supervisor';

  // Monta el tema oscuro mientras esta pantalla está visible; restaura el
  // valor previo al desmontar para no dejar dark residual en páginas claras.
  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', 'dark');
    return () => {
      if (previo === null) raiz.removeAttribute('data-theme');
      else raiz.setAttribute('data-theme', previo);
    };
  }, []);

  // Lista de gastos
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Filtros de período
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(fechaHoy());

  // Estado de UI
  const [mostrarFormulario, setMostrarFormulario] = useState(false);
  // Gasto que se está corrigiendo (null = diálogo cerrado) y aviso del resultado.
  const [gastoACorregir, setGastoACorregir] = useState<Gasto | null>(null);
  const [avisoCorreccion, setAvisoCorreccion] = useState<string | null>(null);

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
    setAvisoCorreccion(null);
    void cargarGastos();
  };

  /** Tras una corrección (201 confirmado): avisar, cerrar el diálogo y refrescar. */
  const manejarCorregido = () => {
    setGastoACorregir(null);
    setAvisoCorreccion(t('fin.corr.exitoCorregido'));
    void cargarGastos();
  };

  // Total del período: cuenta el monto VIGENTE (un gasto anulado suma 0; uno
  // corregido suma su importe corregido). Así el total refleja lo que de verdad
  // se gastó, igual que el dashboard, que suma los asientos en SQL.
  const totalPeriodo = gastos.reduce((acc, g) => acc + g.montoVigente, 0);

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
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
          {avisoCorreccion && <div className={styles.avisoInfo}>{avisoCorreccion}</div>}
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
                    <th>{t('fin.corr.thEstado')}</th>
                    {puedeCorregir && <th className={styles.colAccion}></th>}
                  </tr>
                </thead>
                <tbody>
                  {gastos.map((gasto) => (
                    <tr
                      key={gasto.id}
                      className={gasto.estado === 'anulado' ? styles.filaAnulada : undefined}
                    >
                      <td>{gasto.categoria.nombre}</td>
                      <td>{gasto.descripcion ?? '—'}</td>
                      <td className={styles.monto}>
                        {/* El original es inmutable: si se corrigió, se muestra tachado
                            junto al monto que vale hoy (nunca se sobrescribe). */}
                        {gasto.estado === 'vigente' ? (
                          formatearDinero(gasto.monto)
                        ) : (
                          <>
                            <span className={styles.montoAnterior}>
                              {formatearDinero(gasto.monto)}
                            </span>
                            <span className={styles.montoVigente}>
                              {formatearDinero(gasto.montoVigente)}
                            </span>
                          </>
                        )}
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
                      <td>
                        {gasto.estado === 'vigente' ? (
                          <span className={styles.badgeVigente}>{t('fin.corr.estadoVigente')}</span>
                        ) : (
                          <span
                            className={
                              gasto.estado === 'anulado' ? styles.badgeAnulado : styles.badgeCorregido
                            }
                            title={gasto.motivoCorreccion ?? undefined}
                          >
                            {t(
                              gasto.estado === 'anulado'
                                ? 'fin.corr.estadoAnulado'
                                : 'fin.corr.estadoCorregido',
                            )}
                          </span>
                        )}
                      </td>
                      {puedeCorregir && (
                        <td className={styles.colAccion}>
                          {/* Un movimiento admite UNA sola corrección: ya corregido → sin botón. */}
                          {gasto.estado === 'vigente' ? (
                            <button
                              type="button"
                              className={styles.botonAccion}
                              onClick={() => {
                                setAvisoCorreccion(null);
                                setGastoACorregir(gasto);
                              }}
                            >
                              {t('fin.corr.btnCorregir')}
                            </button>
                          ) : (
                            // Ya corregido/anulado: enlace a la auditoría de ESTE registro.
                            <Link
                              className={styles.enlaceAuditoria}
                              to={`/auditoria-financiera?entidad=gasto&registroId=${gasto.id}`}
                              title={gasto.motivoCorreccion ?? undefined}
                            >
                              {t('fin.corr.verAuditoria')}
                            </Link>
                          )}
                        </td>
                      )}
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

      {/* Diálogo de corrección (reverso + corrección). Solo supervisor/admin. */}
      {gastoACorregir && (
        <DialogoCorreccion
          entidad="gasto"
          movimientoId={gastoACorregir.id}
          descripcion={`${gastoACorregir.categoria.nombre} · ${formatearFecha(gastoACorregir.fechaOperacion)}`}
          montoOriginal={gastoACorregir.monto}
          onCerrar={() => setGastoACorregir(null)}
          onCorregido={manejarCorregido}
        />
      )}
    </LayoutPrincipal>
  );
}
