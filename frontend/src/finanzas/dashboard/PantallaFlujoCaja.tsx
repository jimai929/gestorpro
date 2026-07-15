/**
 * Flujo de caja operativo — ruta /finanzas/flujo-caja.
 *
 * Muestra los MOVIMIENTOS de dinero YA registrados (ventas, gastos, pagos) en un
 * período: cuánto entró, cuánto salió y el neto. NO es ganancia ni el saldo real de
 * banco/caja; no incluye compras a crédito impagas. El aviso de la cabecera lo deja
 * explícito. Los montos vigentes y estados los calcula el backend (mismo criterio de
 * corrección del resto del módulo); esta pantalla solo presenta y filtra.
 *
 * Los filtros (salvo el saldo inicial manual) viven en la URL. El saldo inicial es
 * una simulación LOCAL: no se guarda, no va a la URL, no se envía al backend.
 *
 * API: GET /finanzas/flujo-caja.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Printer, Download, ScrollText } from 'lucide-react';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { useAuth } from '../../core/auth/ContextoAuth';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { obtenerFlujoCaja } from './servicioDashboard';
import { descargarCsvFlujoCaja } from './csvFlujoCaja';
import { formatearDinero, formatearFecha, primerDiaDelMes, fechaHoy } from './utilidades';
import type {
  RespuestaFlujoCaja, MovimientoFlujo, TipoFlujo, EstadoFlujo, OrdenFlujo,
} from './flujo-caja-tipos';
import styles from './PantallaFlujoCaja.module.css';

const TAMANO_PAGINA = 25;
const TAMANO_EXPORT = 2000;
const TIPOS: Array<TipoFlujo | 'todos'> = ['todos', 'ingreso', 'gasto', 'pago_proveedor'];
const ESTADOS: Array<EstadoFlujo | 'todos'> = ['todos', 'vigente', 'corregido', 'anulado'];
const ORDENES: OrdenFlujo[] = ['fecha_desc', 'fecha_asc', 'monto_desc', 'monto_asc'];

export function PantallaFlujoCaja() {
  const { t } = useTraduccion();
  const { usuario } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', 'dark');
    return () => { if (previo === null) raiz.removeAttribute('data-theme'); else raiz.setAttribute('data-theme', previo); };
  }, []);
  useEffect(() => {
    const q = () => document.documentElement.removeAttribute('data-theme');
    const r = () => document.documentElement.setAttribute('data-theme', 'dark');
    window.addEventListener('beforeprint', q); window.addEventListener('afterprint', r);
    return () => { window.removeEventListener('beforeprint', q); window.removeEventListener('afterprint', r); };
  }, []);

  // Filtros derivados de la URL (fuente única). El rango arranca en el mes actual la
  // 1ª vez (si la URL no lo trae), pero SIEMPRE se consulta con desde/hasta explícitos.
  const desde = searchParams.get('desde') ?? primerDiaDelMes();
  const hasta = searchParams.get('hasta') ?? fechaHoy();
  const tipo = (searchParams.get('tipo') as TipoFlujo | null) ?? 'todos';
  const sedeId = searchParams.get('sedeId') ?? '';
  const proveedorId = searchParams.get('proveedorId') ?? '';
  const categoriaId = searchParams.get('categoriaId') ?? '';
  const estado = (searchParams.get('estado') as EstadoFlujo | null) ?? 'todos';
  const orden = (searchParams.get('orden') as OrdenFlujo | null) ?? 'fecha_desc';
  const pagina = Math.max(1, Number(searchParams.get('pagina') ?? '1') || 1);
  const [texto, setTexto] = useState(searchParams.get('texto') ?? '');

  // Saldo inicial manual: solo estado local (simulación).
  const [saldoInicial, setSaldoInicial] = useState('');

  const [datos, setDatos] = useState<RespuestaFlujoCaja | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generadoEn, setGeneradoEn] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const fijar = (cambios: Record<string, string | null>, conservarPagina = false) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(cambios)) { if (v === null || v === '') next.delete(k); else next.set(k, v); }
    if (!conservarPagina) next.delete('pagina');
    setSearchParams(next);
  };

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await obtenerFlujoCaja({
        desde, hasta, tipo,
        ...(sedeId ? { sedeId } : {}),
        ...(proveedorId ? { proveedorId } : {}),
        ...(categoriaId ? { categoriaId } : {}),
        estado,
        ...(searchParams.get('texto') ? { texto: searchParams.get('texto')! } : {}),
        orden, pagina, tamano: TAMANO_PAGINA,
      });
      setDatos(res);
      setGeneradoEn(new Date().toLocaleString('es-PA'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fin.flujo.errCargar'));
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, tipo, sedeId, proveedorId, categoriaId, estado, orden, pagina, searchParams, t]);

  useEffect(() => { void cargar(); }, [cargar]);

  const limpiar = () => { setTexto(''); setSearchParams(new URLSearchParams()); };
  const hayFiltros = tipo !== 'todos' || sedeId !== '' || proveedorId !== '' || categoriaId !== '' || estado !== 'todos' || texto.trim() !== '' || orden !== 'fecha_desc';

  const saldoNum = parseFloat(saldoInicial);
  const saldoValido = !isNaN(saldoNum);

  const exportarCsv = async () => {
    if (!datos) return;
    setExportando(true);
    try {
      // El CSV lleva el conjunto COMPLETO filtrado, no solo la página.
      const completo = await obtenerFlujoCaja({
        desde, hasta, tipo,
        ...(sedeId ? { sedeId } : {}),
        ...(proveedorId ? { proveedorId } : {}),
        ...(categoriaId ? { categoriaId } : {}),
        estado,
        ...(searchParams.get('texto') ? { texto: searchParams.get('texto')! } : {}),
        orden, pagina: 1, tamano: TAMANO_EXPORT,
      });
      descargarCsvFlujoCaja(completo, { desde, hasta }, saldoValido ? saldoNum : null, t);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fin.flujo.errCargar'));
    } finally {
      setExportando(false);
    }
  };

  const puedeVer = usuario?.rol === 'administrador' || usuario?.rol === 'supervisor';
  if (!puedeVer) {
    return (
      <LayoutPrincipal>
        <div className={styles.contenedor}><p className={styles.estadoVacio}>{t('fin.flujo.sinAcceso')}</p></div>
      </LayoutPrincipal>
    );
  }

  const r = datos?.resumen ?? null;
  const cat = datos?.filtrosDisponibles;
  // Escala de las barras del mini-gráfico (mayor entrada/salida diaria).
  const maxDia = datos ? Math.max(1, ...datos.porDia.map((d) => Math.max(d.ingresos, d.salidas))) : 1;

  /** Enlace al detalle de negocio de un movimiento (o a la auditoría si fue corregido). */
  const enlaceMovimiento = (m: MovimientoFlujo): string => {
    if (m.estado !== 'vigente') {
      const ent = m.entidad === 'venta' ? 'venta' : m.entidad === 'gasto' ? 'gasto' : 'pago';
      return `/auditoria-financiera?entidad=${ent}&registroId=${m.id}`;
    }
    if (m.tipo === 'pago_proveedor' && m.detalle.entidad === 'pago') return '/pagos';
    if (m.tipo === 'gasto') return '/gastos';
    return '/dashboard';
  };

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        {/* ── Encabezado ── */}
        <div className={`${styles.encabezado} ${styles.noImprimir}`}>
          <div>
            <h1 className={styles.tituloPagina}>{t('fin.flujo.titulo')}</h1>
            <p className={styles.subtitulo}>{t('fin.flujo.subtitulo')}</p>
          </div>
          {datos && (
            <div className={styles.acciones}>
              <Boton variante="secundario" onClick={() => window.print()}>
                <Printer size={16} strokeWidth={1.75} aria-hidden /> {t('fin.flujo.imprimir')}
              </Boton>
              <Boton variante="secundario" onClick={() => { void exportarCsv(); }} cargando={exportando}>
                <Download size={16} strokeWidth={1.75} aria-hidden /> {t('fin.flujo.exportarCsv')}
              </Boton>
            </div>
          )}
        </div>

        {/* Aviso de criterio: no es ganancia ni saldo bancario. */}
        <div className={styles.avisoCriterio} role="note">{t('fin.flujo.avisoCriterio')}</div>

        {/* Título de impresión. */}
        <div className={styles.tituloImpresion}>
          <h1>{t('fin.flujo.titulo')}</h1>
          <p>{t('fin.flujo.periodo')}: {formatearFecha(desde)} — {formatearFecha(hasta)}{generadoEn ? ` · ${generadoEn}` : ''}</p>
          <p>{t('fin.flujo.avisoCriterio')}</p>
        </div>

        {/* ── Filtros ── */}
        <div className={`${styles.filtros} ${styles.noImprimir}`}>
          <div className={styles.grupo}>
            <label className={styles.etiqueta} htmlFor="fc-desde">{t('comun.desde')}</label>
            <input id="fc-desde" type="date" className={styles.input} value={desde} onChange={(e) => fijar({ desde: e.target.value })} />
          </div>
          <div className={styles.grupo}>
            <label className={styles.etiqueta} htmlFor="fc-hasta">{t('comun.hasta')}</label>
            <input id="fc-hasta" type="date" className={styles.input} value={hasta} onChange={(e) => fijar({ hasta: e.target.value })} />
          </div>
          <div className={styles.grupo}>
            <label className={styles.etiqueta} htmlFor="fc-tipo">{t('fin.flujo.filtroTipo')}</label>
            <select id="fc-tipo" className={styles.input} value={tipo} onChange={(e) => fijar({ tipo: e.target.value === 'todos' ? null : e.target.value })}>
              {TIPOS.map((x) => (<option key={x} value={x}>{x === 'todos' ? t('fin.flujo.todosTipos') : t(`fin.flujo.tipo.${x}`)}</option>))}
            </select>
          </div>
          <div className={styles.grupo}>
            <label className={styles.etiqueta} htmlFor="fc-sede">{t('fin.dash.thSede')}</label>
            <select id="fc-sede" className={styles.input} value={sedeId} onChange={(e) => fijar({ sedeId: e.target.value || null })}>
              <option value="">{t('fin.flujo.todasSedes')}</option>
              {cat?.sedes.map((s) => (<option key={s.id} value={s.id}>{s.nombre}</option>))}
            </select>
          </div>
          <div className={styles.grupo}>
            <label className={styles.etiqueta} htmlFor="fc-prov">{t('fin.pagos.thProveedor')}</label>
            <select id="fc-prov" className={styles.input} value={proveedorId} onChange={(e) => fijar({ proveedorId: e.target.value || null })}>
              <option value="">{t('fin.flujo.todosProveedores')}</option>
              {cat?.proveedores.map((p) => (<option key={p.id} value={p.id}>{p.nombre}</option>))}
            </select>
          </div>
          <div className={styles.grupo}>
            <label className={styles.etiqueta} htmlFor="fc-cat">{t('fin.gasto.thCategoria')}</label>
            <select id="fc-cat" className={styles.input} value={categoriaId} onChange={(e) => fijar({ categoriaId: e.target.value || null })}>
              <option value="">{t('fin.flujo.todasCategorias')}</option>
              {cat?.categorias.map((c) => (<option key={c.id} value={c.id}>{c.nombre}</option>))}
            </select>
          </div>
          <div className={styles.grupo}>
            <label className={styles.etiqueta} htmlFor="fc-estado">{t('fin.corr.thEstado')}</label>
            <select id="fc-estado" className={styles.input} value={estado} onChange={(e) => fijar({ estado: e.target.value === 'todos' ? null : e.target.value })}>
              {ESTADOS.map((x) => (<option key={x} value={x}>{x === 'todos' ? t('fin.flujo.todosEstados') : t(`fin.corr.estado${x[0]!.toUpperCase()}${x.slice(1)}`)}</option>))}
            </select>
          </div>
          <div className={styles.grupo}>
            <label className={styles.etiqueta} htmlFor="fc-orden">{t('fin.ant.filtroOrden')}</label>
            <select id="fc-orden" className={styles.input} value={orden} onChange={(e) => fijar({ orden: e.target.value })}>
              {ORDENES.map((o) => (<option key={o} value={o}>{t(`fin.flujo.orden.${o}`)}</option>))}
            </select>
          </div>
          <form className={`${styles.grupo} ${styles.grupoBusqueda}`} onSubmit={(e) => { e.preventDefault(); fijar({ texto: texto.trim() || null }); }}>
            <label className={styles.etiqueta} htmlFor="fc-texto">{t('fin.flujo.buscar')}</label>
            <input id="fc-texto" type="search" className={styles.input} value={texto} placeholder={t('fin.flujo.buscarPlaceholder')}
              onChange={(e) => setTexto(e.target.value)} onBlur={() => fijar({ texto: texto.trim() || null })} />
          </form>
          <Boton variante="secundario" onClick={limpiar} disabled={!hayFiltros || cargando}>{t('fin.flujo.limpiar')}</Boton>
        </div>

        {error && (
          <div className={`${styles.errorCarga} ${styles.noImprimir}`} role="alert">
            <span>{error}</span>
            <Boton variante="secundario" onClick={() => { void cargar(); }}>{t('fin.reintentar')}</Boton>
          </div>
        )}
        {!error && cargando && !datos && (
          <p className={`${styles.estadoCarga} ${styles.noImprimir}`}>{t('fin.flujo.cargando')}</p>
        )}

        {r && datos && (
          <>
            {/* ── Resumen ── */}
            <div className={styles.resumen}>
              <div className={styles.tarjetaResumen}>
                <span className={styles.etiquetaResumen}>{t('fin.flujo.resIngresos')}</span>
                <span className={styles.valorEntrada}>{formatearDinero(r.totalIngresos)}</span>
              </div>
              <div className={styles.tarjetaResumen}>
                <span className={styles.etiquetaResumen}>{t('fin.flujo.resGastos')}</span>
                <span className={styles.valorSalida}>{formatearDinero(r.totalGastos)}</span>
              </div>
              <div className={styles.tarjetaResumen}>
                <span className={styles.etiquetaResumen}>{t('fin.flujo.resPagos')}</span>
                <span className={styles.valorSalida}>{formatearDinero(r.totalPagosProveedores)}</span>
              </div>
              <div className={styles.tarjetaResumen}>
                <span className={styles.etiquetaResumen}>{t('fin.flujo.resSalidas')}</span>
                <span className={styles.valorSalida}>{formatearDinero(r.totalSalidas)}</span>
              </div>
              <div className={styles.tarjetaResumenNeto}>
                <span className={styles.etiquetaResumen}>{t('fin.flujo.resNeto')}</span>
                <span className={r.flujoNeto >= 0 ? styles.valorEntrada : styles.valorSalida}>
                  {r.flujoNeto >= 0 ? '+' : '−'}{formatearDinero(Math.abs(r.flujoNeto))}
                </span>
                <span className={styles.detalleResumen}>
                  {t('fin.flujo.diasPosNeg', { pos: r.diasConFlujoPositivo, neg: r.diasConFlujoNegativo })}
                </span>
              </div>
            </div>

            {/* ── Saldo inicial manual (simulación) ── */}
            <div className={`${styles.saldoManual} ${styles.noImprimir}`}>
              <div className={styles.saldoManualEntrada}>
                <Entrada etiqueta={t('fin.flujo.saldoInicialManual')} type="number" step="0.01"
                  value={saldoInicial} onChange={(e) => setSaldoInicial(e.target.value)} placeholder="—"
                  ayuda={t('fin.flujo.saldoManualAyuda')} />
              </div>
              {saldoValido && (
                <div className={styles.saldoManualResultado}>
                  <span>{t('fin.flujo.saldoInicialManual')}: <strong>{formatearDinero(saldoNum)}</strong></span>
                  <span>+ {t('fin.flujo.resNeto')}: <strong>{formatearDinero(r.flujoNeto)}</strong></span>
                  <span className={styles.saldoFinal}>= {t('fin.flujo.saldoFinalProyectado')}: <strong>{formatearDinero(saldoNum + r.flujoNeto)}</strong></span>
                  <span className={styles.marcaSimulacion}>{t('fin.flujo.marcaManual')}</span>
                </div>
              )}
            </div>

            {/* ── Tendencia diaria (barras CSS) ── */}
            <div className={styles.tarjeta}>
              <h2 className={styles.tituloBloque}>{t('fin.flujo.tendencia')}</h2>
              {datos.porDia.length === 0 ? (
                <p className={styles.estadoVacio}>{t('fin.flujo.sinMovimientos')}</p>
              ) : (
                <div className={styles.grafico}>
                  {datos.porDia.map((d) => (
                    <div key={d.fecha} className={styles.diaColumna} title={`${d.fecha} · ${t('fin.flujo.resNeto')} ${formatearDinero(d.flujoNeto)}`}>
                      <div className={styles.barras}>
                        <div className={styles.barraEntrada} style={{ height: `${(d.ingresos / maxDia) * 100}%` }} aria-hidden />
                        <div className={styles.barraSalida} style={{ height: `${(d.salidas / maxDia) * 100}%` }} aria-hidden />
                      </div>
                      <span className={d.flujoNeto >= 0 ? styles.netoDiaPos : styles.netoDiaNeg}>
                        {d.flujoNeto >= 0 ? '+' : '−'}{Math.abs(d.flujoNeto).toFixed(0)}
                      </span>
                      <span className={styles.fechaDia}>{d.fecha.slice(5)}</span>
                    </div>
                  ))}
                </div>
              )}
              {datos.porDia.length > 0 && (
                <div className={styles.leyendaGrafico}>
                  <span><span className={`${styles.puntoLeyenda} ${styles.barraEntrada}`} aria-hidden /> {t('fin.flujo.resIngresos')}</span>
                  <span><span className={`${styles.puntoLeyenda} ${styles.barraSalida}`} aria-hidden /> {t('fin.flujo.resSalidas')}</span>
                  <span className={styles.acumuladoTexto}>
                    {t('fin.flujo.acumuladoFinal')}: {formatearDinero(datos.porDia[datos.porDia.length - 1]!.acumuladoDesdeInicioPeriodo)}
                  </span>
                </div>
              )}
            </div>

            {/* ── Métodos de ingreso ── */}
            <div className={styles.tarjeta}>
              <h2 className={styles.tituloBloque}>{t('fin.flujo.porMetodo')}</h2>
              <div className={styles.metodos}>
                {datos.porMetodoIngreso.map((m) => (
                  <div key={m.metodo} className={styles.metodo}>
                    <span className={styles.metodoNombre}>{t(`fin.arqueo.${m.metodo}`)}</span>
                    <span className={styles.metodoMonto}>{formatearDinero(m.monto)}</span>
                    <span className={styles.metodoDetalle}>{m.porcentaje}% · {t('fin.flujo.nRegistros', { n: m.registros })}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── Movimientos ── */}
            <div className={styles.tarjeta}>
              <h2 className={styles.tituloBloque}>{t('fin.flujo.movimientos')}</h2>
              {datos.movimientos.length === 0 ? (
                <p className={styles.estadoVacio}>{hayFiltros ? t('fin.flujo.vacioFiltrado') : t('fin.flujo.vacio')}</p>
              ) : (
                <>
                  <div className={styles.contenedorTabla}>
                    <table className={styles.tabla}>
                      <thead>
                        <tr>
                          <th>{t('fin.flujo.thFecha')}</th>
                          <th>{t('fin.flujo.thTipo')}</th>
                          <th>{t('fin.flujo.thObjeto')}</th>
                          <th className={styles.colImporte}>{t('fin.flujo.thEntrada')}</th>
                          <th className={styles.colImporte}>{t('fin.flujo.thSalida')}</th>
                          <th>{t('fin.corr.thEstado')}</th>
                          <th>{t('fin.flujo.thUsuario')}</th>
                          <th className={styles.noImprimir}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.movimientos.map((m) => (
                          <tr key={`${m.entidad}-${m.id}`} className={m.estado === 'anulado' ? styles.filaAnulada : undefined}>
                            <td className={styles.celdaFecha}>{formatearFecha(m.fecha)}</td>
                            <td>{t(`fin.flujo.tipo.${m.tipo}`)}</td>
                            <td className={styles.celdaObjeto}>{m.descripcion}</td>
                            {/* Entrada solo en la columna de entrada; salida solo en salida. */}
                            <td className={`${styles.monto} ${styles.entrada}`}>
                              {m.direccion === 'entrada' ? montoConEstado(m) : '—'}
                            </td>
                            <td className={`${styles.monto} ${styles.salida}`}>
                              {m.direccion === 'salida' ? montoConEstado(m) : '—'}
                            </td>
                            <td>
                              {m.estado === 'vigente' ? (
                                <span className={styles.badgeVigente}>{t('fin.corr.estadoVigente')}</span>
                              ) : (
                                <span className={m.estado === 'anulado' ? styles.badgeAnulado : styles.badgeCorregido} title={m.motivoCorreccion ?? undefined}>
                                  {t(m.estado === 'anulado' ? 'fin.corr.estadoAnulado' : 'fin.corr.estadoCorregido')}
                                </span>
                              )}
                            </td>
                            <td className={styles.celdaSecundaria}>{m.registradoPor ?? '—'}</td>
                            <td className={`${styles.celdaAccion} ${styles.noImprimir}`}>
                              <Link to={enlaceMovimiento(m)} className={styles.enlaceMini}>
                                {m.estado === 'vigente' ? t('fin.flujo.verOrigen') : t('fin.corr.verAuditoria')}
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {datos.paginacion.paginas > 1 && (
                    <div className={`${styles.paginacion} ${styles.noImprimir}`}>
                      <Boton variante="secundario" disabled={datos.paginacion.pagina <= 1 || cargando} onClick={() => fijar({ pagina: String(Math.max(1, pagina - 1)) }, true)}>{t('fin.pagos.anterior')}</Boton>
                      <span className={styles.indicadorPagina}>
                        {t('fin.pagos.paginaDe', { pagina: datos.paginacion.pagina, paginas: datos.paginacion.paginas })} · {t('fin.flujo.nMovs', { n: datos.paginacion.total })}
                      </span>
                      <Boton variante="secundario" disabled={datos.paginacion.pagina >= datos.paginacion.paginas || cargando} onClick={() => fijar({ pagina: String(pagina + 1) }, true)}>{t('fin.pagos.siguiente')}</Boton>
                    </div>
                  )}
                </>
              )}
            </div>

            <p className={styles.descargo}>
              <ScrollText size={14} strokeWidth={1.75} aria-hidden /> {t('fin.flujo.descargo')}
            </p>
          </>
        )}
      </div>
    </LayoutPrincipal>
  );

  /** Monto de la celda: original tachado + vigente si fue corregido/anulado. */
  function montoConEstado(m: MovimientoFlujo) {
    if (m.estado === 'vigente') return formatearDinero(m.montoVigente);
    return (
      <span className={styles.montoDual}>
        <span className={styles.montoTachado}>{formatearDinero(m.montoOriginal)}</span>
        <span>{formatearDinero(m.montoVigente)}</span>
      </span>
    );
  }
}
