/**
 * Antigüedad de cuentas por pagar — ruta /cuentas-por-pagar/antiguedad.
 *
 * Mesa de trabajo para el manejo diario de caja: cuánto se debe, qué deudas llevan
 * más tiempo, en qué proveedores se concentra y qué priorizar. Solo lectura: no
 * registra pagos ni cambia la deuda.
 *
 * ANTIGÜEDAD = días naturales desde la fecha de compra hasta hoy. NO es mora
 * contractual: el sistema no exige fecha de vencimiento. El aviso de la cabecera lo
 * deja explícito. Los tramos y montos los calcula y etiqueta el backend (una sola
 * definición); esta pantalla solo presenta y filtra.
 *
 * Los filtros viven en la URL (?proveedorId=&tramo=&texto=&orden=&pagina=): al
 * recargar se conservan, y las otras pantallas pueden enlazar con contexto.
 *
 * API: GET /cuentas-por-pagar/antiguedad · GET /proveedores.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Printer, Download, FileText, History, Receipt } from 'lucide-react';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { obtenerAntiguedad, obtenerProveedores } from './servicioCuentas';
import { descargarCsvAntiguedad } from './csvAntiguedad';
import { formatearDinero, formatearFecha } from './utilidades';
import type { Proveedor } from './tipos';
import type {
  RespuestaAntiguedad,
  TramoAntiguedad,
  OrdenAntiguedad,
  FacturaAntiguedad,
} from './antiguedad-tipos';
import styles from './PantallaAntiguedad.module.css';

const TAMANO_PAGINA = 20;
const TAMANO_EXPORT = 2000;

const TRAMOS: Array<{ valor: TramoAntiguedad; clave: string; claseBarraKey: string }> = [
  { valor: 'dias_0_30', clave: 'fin.ant.tramo0a30', claseBarraKey: 'barra0a30' },
  { valor: 'dias_31_60', clave: 'fin.ant.tramo31a60', claseBarraKey: 'barra31a60' },
  { valor: 'dias_61_90', clave: 'fin.ant.tramo61a90', claseBarraKey: 'barra61a90' },
  { valor: 'dias_90_mas', clave: 'fin.ant.tramo90Mas', claseBarraKey: 'barra90Mas' },
];

const ORDENES: OrdenAntiguedad[] = ['deuda_desc', 'antiguedad_desc', 'proveedor_asc', 'fecha_asc'];

/** Nivel de riesgo NEUTRO por antigüedad (no es calificación crediticia). */
function nivelRiesgo(dias: number): 'reciente' | 'atencion' | 'antigua' {
  if (dias <= 30) return 'reciente';
  if (dias <= 90) return 'atencion';
  return 'antigua';
}

export function PantallaAntiguedad() {
  const { t } = useTraduccion();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', 'dark');
    return () => {
      if (previo === null) raiz.removeAttribute('data-theme');
      else raiz.setAttribute('data-theme', previo);
    };
  }, []);
  useEffect(() => {
    const alImprimir = () => document.documentElement.removeAttribute('data-theme');
    const alTerminar = () => document.documentElement.setAttribute('data-theme', 'dark');
    window.addEventListener('beforeprint', alImprimir);
    window.addEventListener('afterprint', alTerminar);
    return () => {
      window.removeEventListener('beforeprint', alImprimir);
      window.removeEventListener('afterprint', alTerminar);
    };
  }, []);

  // Filtros DERIVADOS de la URL (fuente única): así recargar conserva el estado y
  // las otras pantallas pueden enlazar con ?proveedorId=…
  const proveedorId = searchParams.get('proveedorId') ?? '';
  const tramo = (searchParams.get('tramo') as TramoAntiguedad | null) ?? 'todos';
  const orden = (searchParams.get('orden') as OrdenAntiguedad | null) ?? 'deuda_desc';
  const pagina = Math.max(1, Number(searchParams.get('pagina') ?? '1') || 1);
  // El texto se teclea localmente y se vuelca a la URL (sin recargar cada tecla).
  const [texto, setTexto] = useState(searchParams.get('texto') ?? '');

  /** Fija/borra parámetros de la URL, reseteando la página salvo que se indique. */
  const fijarParams = (cambios: Record<string, string | null>, conservarPagina = false) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(cambios)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!conservarPagina) next.delete('pagina');
    setSearchParams(next);
  };

  const [datos, setDatos] = useState<RespuestaAntiguedad | null>(null);
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generadoEn, setGeneradoEn] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const cargarProveedores = useCallback(async () => {
    try {
      setProveedores(await obtenerProveedores());
    } catch {
      /* no crítico: el selector queda vacío, el resto funciona */
    }
  }, []);
  useEffect(() => { void cargarProveedores(); }, [cargarProveedores]);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await obtenerAntiguedad({
        ...(proveedorId ? { proveedorId } : {}),
        tramo,
        orden,
        ...(searchParams.get('texto') ? { texto: searchParams.get('texto')! } : {}),
        pagina,
        tamano: TAMANO_PAGINA,
      });
      setDatos(res);
      setGeneradoEn(new Date().toLocaleString('es-PA'));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fin.ant.errCargar'));
    } finally {
      setCargando(false);
    }
  }, [proveedorId, tramo, orden, pagina, searchParams, t]);

  useEffect(() => { void cargar(); }, [cargar]);

  const limpiarFiltros = () => {
    setTexto('');
    setSearchParams(new URLSearchParams());
  };

  const hayFiltros = proveedorId !== '' || tramo !== 'todos' || texto.trim() !== '' || orden !== 'deuda_desc';

  const exportarCsv = async () => {
    setExportando(true);
    try {
      const res = await obtenerAntiguedad({
        ...(proveedorId ? { proveedorId } : {}),
        tramo, orden,
        ...(searchParams.get('texto') ? { texto: searchParams.get('texto')! } : {}),
        pagina: 1, tamano: TAMANO_EXPORT,
      });
      descargarCsvAntiguedad(res.proveedores, res.facturas, tramo, t);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fin.ant.errCargar'));
    } finally {
      setExportando(false);
    }
  };

  const resumen = datos?.resumen ?? null;

  const filaFactura = (f: FacturaAntiguedad) => (
    <tr key={f.compraId} className={f.tramo === 'dias_90_mas' ? styles.filaVieja : undefined}>
      <td className={styles.celdaFecha}>{formatearFecha(f.fechaCompra)}</td>
      <td className={styles.celdaSecundaria}>{f.numeroFactura}</td>
      <td>{f.proveedorNombre}</td>
      <td className={styles.monto}>{formatearDinero(f.montoOriginal)}</td>
      <td className={styles.monto}>{formatearDinero(f.pagosVigentes)}</td>
      <td className={`${styles.monto} ${styles.saldo}`}>{formatearDinero(f.saldoPendiente)}</td>
      <td className={styles.celdaDias}>
        {t('fin.ant.diasValor', { dias: f.diasAntiguedad })}
        {f.tramo === 'dias_90_mas' && (
          <span className={styles.marca90}>{t('fin.ant.marca90')}</span>
        )}
      </td>
      <td>
        <span className={styles[`badge_${nivelRiesgo(f.diasAntiguedad)}`]}>
          {t(`fin.ant.${f.tramo}`)}
        </span>
      </td>
      <td className={`${styles.celdaAcciones} ${styles.noImprimir}`}>
        <Link to={`/estado-cuenta?proveedorId=${f.proveedorId}`} className={styles.enlaceMini} title={t('fin.ant.accEstadoCuenta')}>
          <FileText size={14} strokeWidth={1.75} aria-hidden />
        </Link>
      </td>
    </tr>
  );

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        {/* ── Encabezado ── */}
        <div className={`${styles.encabezado} ${styles.noImprimir}`}>
          <div>
            <h1 className={styles.tituloPagina}>{t('fin.ant.titulo')}</h1>
            <p className={styles.subtitulo}>{t('fin.ant.subtitulo')}</p>
          </div>
          <div className={styles.acciones}>
            <Boton variante="secundario" onClick={() => window.print()}>
              <Printer size={16} strokeWidth={1.75} aria-hidden /> {t('fin.ant.imprimir')}
            </Boton>
            <Boton variante="secundario" onClick={() => { void exportarCsv(); }} cargando={exportando}>
              <Download size={16} strokeWidth={1.75} aria-hidden /> {t('fin.ant.exportarCsv')}
            </Boton>
          </div>
        </div>

        {/* Aviso: la antigüedad NO es mora contractual. */}
        <div className={styles.avisoAntiguedad}>{t('fin.ant.avisoNoMora')}</div>

        {/* Título de impresión + fecha. */}
        <div className={styles.tituloImpresion}>
          <h1>{t('fin.ant.titulo')}</h1>
          {generadoEn && <p>{t('fin.ant.generadoEl', { fecha: generadoEn })}</p>}
        </div>
        {generadoEn && (
          <p className={`${styles.generadoEn} ${styles.noImprimir}`}>
            {t('fin.ant.generadoEl', { fecha: generadoEn })}
            <button type="button" className={styles.enlaceRefrescar} onClick={() => { void cargar(); }}>
              {t('comun.actualizar')}
            </button>
          </p>
        )}

        {/* ── Resumen + distribución ── */}
        {resumen && (
          <>
            <div className={styles.resumen}>
              <div className={styles.tarjetaResumen}>
                <span className={styles.etiquetaResumen}>{t('fin.ant.resDeuda')}</span>
                <span className={styles.valorResumenFuerte}>{formatearDinero(resumen.deudaTotal)}</span>
              </div>
              <div className={styles.tarjetaResumen}>
                <span className={styles.etiquetaResumen}>{t('fin.ant.resFacturas')}</span>
                <span className={styles.valorResumen}>{resumen.cantidadFacturasPendientes}</span>
              </div>
              <div className={styles.tarjetaResumen}>
                <span className={styles.etiquetaResumen}>{t('fin.ant.resProveedores')}</span>
                <span className={styles.valorResumen}>{resumen.cantidadProveedores}</span>
              </div>
              <div className={styles.tarjetaResumen}>
                <span className={styles.etiquetaResumen}>{t('fin.ant.resMasAntigua')}</span>
                <span className={styles.valorResumen}>
                  {t('fin.ant.diasValor', { dias: resumen.deudaMasAntiguaDias })}
                </span>
              </div>
              <div className={styles.tarjetaResumen}>
                <span className={styles.etiquetaResumen}>{t('fin.ant.resMayorDeudor')}</span>
                <span className={styles.valorResumenTexto}>
                  {resumen.proveedorMayorDeuda
                    ? `${resumen.proveedorMayorDeuda.nombre} (${formatearDinero(resumen.proveedorMayorDeuda.deuda)})`
                    : '—'}
                </span>
              </div>
            </div>

            {/* Barra de distribución por tramo. Cada segmento lleva etiqueta, monto,
                % y cantidad (no solo color). Al pulsarlo, filtra por ese tramo. */}
            <div className={styles.distribucion}>
              <div className={styles.barra} role="group" aria-label={t('fin.ant.distribucion')}>
                {TRAMOS.map((tr) => {
                  const monto = resumen[`deuda${tr.valor === 'dias_0_30' ? '0a30' : tr.valor === 'dias_31_60' ? '31a60' : tr.valor === 'dias_61_90' ? '61a90' : '90Mas'}` as keyof typeof resumen] as number;
                  const pct = resumen[`pct${tr.valor === 'dias_0_30' ? '0a30' : tr.valor === 'dias_31_60' ? '31a60' : tr.valor === 'dias_61_90' ? '61a90' : '90Mas'}` as keyof typeof resumen] as number;
                  if (pct <= 0) return null;
                  return (
                    <button
                      key={tr.valor}
                      type="button"
                      className={`${styles.segmento} ${styles[tr.claseBarraKey]}`}
                      style={{ width: `${pct}%` }}
                      onClick={() => fijarParams({ tramo: tramo === tr.valor ? null : tr.valor })}
                      title={`${t(tr.clave)}: ${formatearDinero(monto)} (${pct}%)`}
                      aria-pressed={tramo === tr.valor}
                    >
                      {pct >= 8 ? `${pct}%` : ''}
                    </button>
                  );
                })}
              </div>
              <div className={styles.leyenda}>
                {TRAMOS.map((tr) => {
                  const sufijo = tr.valor === 'dias_0_30' ? '0a30' : tr.valor === 'dias_31_60' ? '31a60' : tr.valor === 'dias_61_90' ? '61a90' : '90Mas';
                  const monto = resumen[`deuda${sufijo}` as keyof typeof resumen] as number;
                  const pct = resumen[`pct${sufijo}` as keyof typeof resumen] as number;
                  const cant = resumen[`cant${sufijo}` as keyof typeof resumen] as number;
                  return (
                    <button
                      key={tr.valor}
                      type="button"
                      className={`${styles.itemLeyenda} ${tramo === tr.valor ? styles.itemLeyendaActivo : ''}`}
                      onClick={() => fijarParams({ tramo: tramo === tr.valor ? null : tr.valor })}
                    >
                      <span className={`${styles.puntoLeyenda} ${styles[tr.claseBarraKey]}`} aria-hidden />
                      <span className={styles.leyendaTexto}>{t(tr.clave)}</span>
                      <span className={styles.leyendaMonto}>{formatearDinero(monto)}</span>
                      <span className={styles.leyendaDetalle}>
                        {pct}% · {t('fin.ant.nFacturas', { n: cant })}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* ── Filtros ── */}
        <div className={`${styles.filtros} ${styles.noImprimir}`}>
          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="ant-proveedor">{t('fin.ant.filtroProveedor')}</label>
            <select id="ant-proveedor" className={styles.selectFiltro} value={proveedorId}
              onChange={(e) => fijarParams({ proveedorId: e.target.value || null })}>
              <option value="">{t('fin.ant.todosProveedores')}</option>
              {proveedores.map((p) => (<option key={p.id} value={p.id}>{p.nombre}</option>))}
            </select>
          </div>
          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="ant-tramo">{t('fin.ant.filtroTramo')}</label>
            <select id="ant-tramo" className={styles.selectFiltro} value={tramo}
              onChange={(e) => fijarParams({ tramo: e.target.value === 'todos' ? null : e.target.value })}>
              <option value="todos">{t('fin.ant.todosTramos')}</option>
              {TRAMOS.map((tr) => (<option key={tr.valor} value={tr.valor}>{t(tr.clave)}</option>))}
            </select>
          </div>
          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="ant-orden">{t('fin.ant.filtroOrden')}</label>
            <select id="ant-orden" className={styles.selectFiltro} value={orden}
              onChange={(e) => fijarParams({ orden: e.target.value })}>
              {ORDENES.map((o) => (<option key={o} value={o}>{t(`fin.ant.orden.${o}`)}</option>))}
            </select>
          </div>
          <form className={`${styles.grupoFiltro} ${styles.grupoBusqueda}`}
            onSubmit={(e) => { e.preventDefault(); fijarParams({ texto: texto.trim() || null }); }}>
            <label className={styles.etiquetaFiltro} htmlFor="ant-texto">{t('fin.ant.buscar')}</label>
            <input id="ant-texto" type="search" className={styles.inputFiltro} value={texto}
              placeholder={t('fin.ant.buscarPlaceholder')}
              onChange={(e) => setTexto(e.target.value)}
              onBlur={() => fijarParams({ texto: texto.trim() || null })} />
          </form>
          <Boton variante="secundario" onClick={limpiarFiltros} disabled={!hayFiltros || cargando}>
            {t('fin.ant.limpiar')}
          </Boton>
        </div>

        {/* ── Ranking de proveedores ── */}
        {resumen && datos && datos.proveedores.length > 0 && (
          <div className={styles.tarjeta}>
            <h2 className={styles.tituloBloque}>{t('fin.ant.tituloProveedores')}</h2>
            <div className={styles.contenedorTabla}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>{t('fin.ant.thProveedor')}</th>
                    <th className={styles.colImporte}>{t('fin.ant.thDeuda')}</th>
                    <th className={styles.colNum}>{t('fin.ant.thFacturas')}</th>
                    <th className={styles.colImporte}>{t('fin.ant.tramo0a30')}</th>
                    <th className={styles.colImporte}>{t('fin.ant.tramo31a60')}</th>
                    <th className={styles.colImporte}>{t('fin.ant.tramo61a90')}</th>
                    <th className={styles.colImporte}>{t('fin.ant.tramo90Mas')}</th>
                    <th className={styles.colNum}>{t('fin.ant.thMasAntigua')}</th>
                    <th className={styles.noImprimir}></th>
                  </tr>
                </thead>
                <tbody>
                  {datos.proveedores.map((p) => (
                    <tr key={p.proveedorId} className={proveedorId === p.proveedorId ? styles.filaSeleccionada : undefined}>
                      <td>
                        <button type="button" className={styles.enlaceProveedor}
                          onClick={() => fijarParams({ proveedorId: proveedorId === p.proveedorId ? null : p.proveedorId })}>
                          {p.nombre}
                        </button>
                        {p.identificacionFiscal && (
                          <span className={styles.rucProveedor}>{p.identificacionFiscal}</span>
                        )}
                      </td>
                      <td className={`${styles.monto} ${styles.saldo}`}>{formatearDinero(p.deudaTotal)}</td>
                      <td className={styles.colNum}>{p.cantidadFacturas}</td>
                      <td className={styles.monto}>{formatearDinero(p.deuda0a30)}</td>
                      <td className={styles.monto}>{formatearDinero(p.deuda31a60)}</td>
                      <td className={styles.monto}>{formatearDinero(p.deuda61a90)}</td>
                      <td className={styles.monto}>{formatearDinero(p.deuda90Mas)}</td>
                      <td className={styles.colNum}>{t('fin.ant.diasValor', { dias: p.facturaMasAntiguaDias })}</td>
                      <td className={`${styles.celdaAcciones} ${styles.noImprimir}`}>
                        <Link to={`/estado-cuenta?proveedorId=${p.proveedorId}`} className={styles.enlaceMini} title={t('fin.ant.accEstadoCuenta')}>
                          <FileText size={14} strokeWidth={1.75} aria-hidden />
                        </Link>
                        <Link to={`/pagos?proveedorId=${p.proveedorId}`} className={styles.enlaceMini} title={t('fin.ant.accHistorial')}>
                          <History size={14} strokeWidth={1.75} aria-hidden />
                        </Link>
                        <Link to="/cuentas-por-pagar" className={styles.enlaceMini} title={t('fin.ant.accRegistrarPago')}>
                          <Receipt size={14} strokeWidth={1.75} aria-hidden />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Facturas pendientes ── */}
        <div className={styles.tarjeta}>
          <h2 className={styles.tituloBloque}>{t('fin.ant.tituloFacturas')}</h2>
          {error && (
            <div className={`${styles.errorCarga} ${styles.noImprimir}`} role="alert">
              <span>{error}</span>
              <Boton variante="secundario" onClick={() => { void cargar(); }}>{t('fin.reintentar')}</Boton>
            </div>
          )}
          {!error && cargando && (
            <p className={`${styles.estadoCarga} ${styles.noImprimir}`}>{t('fin.ant.cargando')}</p>
          )}
          {!error && !cargando && datos && datos.facturas.length === 0 && (
            <p className={styles.estadoVacio}>
              {hayFiltros ? t('fin.ant.vacioFiltrado') : t('fin.ant.vacio')}
            </p>
          )}
          {!error && !cargando && datos && datos.facturas.length > 0 && (
            <>
              <div className={styles.contenedorTabla}>
                <table className={styles.tabla}>
                  <thead>
                    <tr>
                      <th>{t('fin.ant.thFecha')}</th>
                      <th>{t('fin.ant.thFactura')}</th>
                      <th>{t('fin.ant.thProveedor')}</th>
                      <th className={styles.colImporte}>{t('fin.ant.thOriginal')}</th>
                      <th className={styles.colImporte}>{t('fin.ant.thPagos')}</th>
                      <th className={styles.colImporte}>{t('fin.ant.thSaldo')}</th>
                      <th>{t('fin.ant.thDias')}</th>
                      <th>{t('fin.ant.thTramo')}</th>
                      <th className={styles.noImprimir}></th>
                    </tr>
                  </thead>
                  <tbody>{datos.facturas.map(filaFactura)}</tbody>
                </table>
              </div>
              {datos.paginacion.paginas > 1 && (
                <div className={`${styles.paginacion} ${styles.noImprimir}`}>
                  <Boton variante="secundario" disabled={datos.paginacion.pagina <= 1 || cargando}
                    onClick={() => fijarParams({ pagina: String(Math.max(1, pagina - 1)) }, true)}>
                    {t('fin.pagos.anterior')}
                  </Boton>
                  <span className={styles.indicadorPagina}>
                    {t('fin.pagos.paginaDe', { pagina: datos.paginacion.pagina, paginas: datos.paginacion.paginas })}
                    {' · '}{t('fin.ant.nFacturas', { n: datos.paginacion.total })}
                  </span>
                  <Boton variante="secundario" disabled={datos.paginacion.pagina >= datos.paginacion.paginas || cargando}
                    onClick={() => fijarParams({ pagina: String(pagina + 1) }, true)}>
                    {t('fin.pagos.siguiente')}
                  </Boton>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </LayoutPrincipal>
  );
}
