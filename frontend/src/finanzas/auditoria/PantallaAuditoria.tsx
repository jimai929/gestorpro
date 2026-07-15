/**
 * Centro de auditoría de correcciones financieras — ruta /auditoria-financiera.
 *
 * Reúne en una sola vista todas las correcciones y anulaciones de gastos, cierres
 * de caja y pagos: se filtran, se ven en detalle, se imprimen y se exportan a CSV.
 * Es una herramienta de conciliación y responsabilidad, NO un log: cada fila lleva
 * el monto original (nunca sobrescrito), el vigente, la diferencia, el motivo y el
 * usuario. Solo lectura: desde aquí no se corrige nada.
 *
 * Puede abrirse con filtros en la URL (?entidad=&registroId=) desde las pantallas
 * de gasto / dashboard / historial de pagos para ir directo a un registro.
 *
 * API: GET /finanzas/auditoria-correcciones.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Printer, Download, Eye, TrendingUp } from 'lucide-react';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { obtenerAuditoriaCorrecciones } from './servicioAuditoria';
import { descargarCsvAuditoria } from './csvAuditoria';
import { DetalleCorreccion } from './DetalleCorreccion';
import type {
  RegistroAuditoria,
  PaginacionAuditoria,
  ResumenAuditoria,
  UsuarioAuditoria,
  EntidadAuditoria,
  AccionAuditoria,
} from './tipos';
import styles from './PantallaAuditoria.module.css';

const TAMANO_PAGINA = 20;
/** Página con TODO el conjunto filtrado, para la exportación a CSV. */
const TAMANO_EXPORT = 2000;

const OPCIONES_ENTIDAD: Array<{ valor: EntidadAuditoria | 'todas'; clave: string }> = [
  { valor: 'todas', clave: 'fin.aud.todasEntidades' },
  { valor: 'gasto', clave: 'fin.aud.entidad.gasto' },
  { valor: 'venta', clave: 'fin.aud.entidad.venta' },
  { valor: 'pago', clave: 'fin.aud.entidad.pago' },
];

const OPCIONES_ACCION: Array<{ valor: AccionAuditoria | 'todas'; clave: string }> = [
  { valor: 'todas', clave: 'fin.aud.todasAcciones' },
  { valor: 'correccion', clave: 'fin.aud.accion.correccion' },
  { valor: 'anulacion', clave: 'fin.aud.accion.anulacion' },
];

function formatearDinero(valor: number): string {
  return `B/. ${valor.toFixed(2)}`;
}

function formatearMomento(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return iso.slice(0, 10);
  return fecha.toLocaleString('es-PA', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function PantallaAuditoria() {
  const { t } = useTraduccion();
  const [searchParams] = useSearchParams();

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

  // Filtros (la entidad y el texto de registro pueden venir de la URL como deep-link).
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [entidad, setEntidad] = useState<EntidadAuditoria | 'todas'>(
    (searchParams.get('entidad') as EntidadAuditoria | null) ?? 'todas',
  );
  const [accion, setAccion] = useState<AccionAuditoria | 'todas'>('todas');
  const [usuarioId, setUsuarioId] = useState('');
  const [texto, setTexto] = useState(searchParams.get('registroId') ?? '');
  const [pagina, setPagina] = useState(1);

  // Datos
  const [registros, setRegistros] = useState<RegistroAuditoria[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioAuditoria[]>([]);
  const [paginacion, setPaginacion] = useState<PaginacionAuditoria | null>(null);
  const [resumen, setResumen] = useState<ResumenAuditoria | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const [detalle, setDetalle] = useState<RegistroAuditoria | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const res = await obtenerAuditoriaCorrecciones({
        ...(desde ? { desde } : {}),
        ...(hasta ? { hasta } : {}),
        entidad,
        accion,
        ...(usuarioId ? { usuarioId } : {}),
        ...(texto.trim() ? { texto: texto.trim() } : {}),
        pagina,
        tamano: TAMANO_PAGINA,
      });
      setRegistros(res.registros);
      setUsuarios(res.usuariosDisponibles);
      setPaginacion(res.paginacion);
      setResumen(res.resumen);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fin.aud.errCargar'));
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, entidad, accion, usuarioId, texto, pagina, t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Cambiar un filtro vuelve a la página 1. */
  const conReinicio = <T,>(fijar: (v: T) => void) => (valor: T) => {
    fijar(valor);
    setPagina(1);
  };

  const limpiarFiltros = () => {
    setDesde('');
    setHasta('');
    setEntidad('todas');
    setAccion('todas');
    setUsuarioId('');
    setTexto('');
    setPagina(1);
  };

  const hayFiltros =
    desde !== '' || hasta !== '' || entidad !== 'todas' || accion !== 'todas' ||
    usuarioId !== '' || texto.trim() !== '';

  const imprimir = () => window.print();

  const exportarCsv = async () => {
    setExportando(true);
    try {
      // El CSV lleva el conjunto COMPLETO filtrado, no la página visible.
      const res = await obtenerAuditoriaCorrecciones({
        ...(desde ? { desde } : {}),
        ...(hasta ? { hasta } : {}),
        entidad,
        accion,
        ...(usuarioId ? { usuarioId } : {}),
        ...(texto.trim() ? { texto: texto.trim() } : {}),
        pagina: 1,
        tamano: TAMANO_EXPORT,
      });
      descargarCsvAuditoria(res.registros, desde, hasta, t);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fin.aud.errCargar'));
    } finally {
      setExportando(false);
    }
  };

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        {/* ── Encabezado ── */}
        <div className={`${styles.encabezado} ${styles.noImprimir}`}>
          <div>
            <h1 className={styles.tituloPagina}>{t('fin.aud.titulo')}</h1>
            <p className={styles.subtitulo}>{t('fin.aud.subtitulo')}</p>
            {/* Volver al flujo de caja conservando el rango de fechas. */}
            <Link
              to={`/finanzas/flujo-caja${
                desde || hasta
                  ? `?${new URLSearchParams({ ...(desde ? { desde } : {}), ...(hasta ? { hasta } : {}) }).toString()}`
                  : ''
              }`}
              className={styles.enlaceFlujo}
            >
              <TrendingUp size={14} strokeWidth={1.75} aria-hidden /> {t('fin.flujo.verFlujo')}
            </Link>
          </div>
          {resumen && resumen.total > 0 && (
            <div className={styles.acciones}>
              <Boton variante="secundario" onClick={imprimir}>
                <Printer size={16} strokeWidth={1.75} aria-hidden /> {t('fin.aud.imprimir')}
              </Boton>
              <Boton variante="secundario" onClick={() => { void exportarCsv(); }} cargando={exportando}>
                <Download size={16} strokeWidth={1.75} aria-hidden /> {t('fin.aud.exportarCsv')}
              </Boton>
            </div>
          )}
        </div>

        {/* Solo se imprime: título y período del reporte. */}
        <div className={styles.tituloImpresion}>
          <h1>{t('fin.aud.titulo')}</h1>
          <p>
            {desde || hasta
              ? `${t('comun.desde')} ${desde || '—'} · ${t('comun.hasta')} ${hasta || '—'}`
              : t('fin.aud.todoElHistorial')}
          </p>
        </div>

        {/* ── Resumen ── */}
        {resumen && (
          <div className={styles.resumen}>
            <div className={styles.tarjetaResumen}>
              <span className={styles.etiquetaResumen}>{t('fin.aud.resTotal')}</span>
              <span className={styles.valorResumen}>{resumen.total}</span>
              <span className={styles.detalleResumen}>
                {t('fin.aud.resDesglose', {
                  correcciones: resumen.correcciones,
                  anulaciones: resumen.anulaciones,
                })}
              </span>
            </div>
            <div className={styles.tarjetaResumen}>
              <span className={styles.etiquetaResumen}>{t('fin.aud.resPorModulo')}</span>
              <span className={styles.detalleResumen}>
                {t('fin.aud.entidad.gasto')}: {resumen.gastos} · {t('fin.aud.entidad.venta')}:{' '}
                {resumen.ventas} · {t('fin.aud.entidad.pago')}: {resumen.pagos}
              </span>
            </div>
            <div className={styles.tarjetaResumen}>
              <span className={styles.etiquetaResumen}>{t('fin.aud.resOriginal')}</span>
              <span className={styles.valorResumen}>{formatearDinero(resumen.totalOriginal)}</span>
            </div>
            <div className={styles.tarjetaResumen}>
              <span className={styles.etiquetaResumen}>{t('fin.aud.resVigente')}</span>
              <span className={styles.valorResumen}>{formatearDinero(resumen.totalVigente)}</span>
            </div>
            <div className={styles.tarjetaResumen}>
              <span className={styles.etiquetaResumen}>{t('fin.aud.resDiferencia')}</span>
              <span className={styles.valorResumenAlerta}>
                {formatearDinero(resumen.diferenciaNeta)}
              </span>
            </div>
            <div className={styles.tarjetaResumen}>
              <span className={styles.etiquetaResumen}>{t('fin.aud.resUsuarios')}</span>
              <span className={styles.valorResumen}>{resumen.usuarios}</span>
            </div>
          </div>
        )}

        {/* ── Filtros ── */}
        <div className={`${styles.filtros} ${styles.noImprimir}`}>
          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="aud-desde">{t('comun.desde')}</label>
            <input id="aud-desde" type="date" className={styles.inputFiltro} value={desde}
              onChange={(e) => conReinicio(setDesde)(e.target.value)} />
          </div>
          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="aud-hasta">{t('comun.hasta')}</label>
            <input id="aud-hasta" type="date" className={styles.inputFiltro} value={hasta}
              onChange={(e) => conReinicio(setHasta)(e.target.value)} />
          </div>
          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="aud-entidad">{t('fin.aud.filtroModulo')}</label>
            <select id="aud-entidad" className={styles.selectFiltro} value={entidad}
              onChange={(e) => conReinicio(setEntidad)(e.target.value as EntidadAuditoria | 'todas')}>
              {OPCIONES_ENTIDAD.map((o) => (<option key={o.valor} value={o.valor}>{t(o.clave)}</option>))}
            </select>
          </div>
          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="aud-accion">{t('fin.aud.filtroAccion')}</label>
            <select id="aud-accion" className={styles.selectFiltro} value={accion}
              onChange={(e) => conReinicio(setAccion)(e.target.value as AccionAuditoria | 'todas')}>
              {OPCIONES_ACCION.map((o) => (<option key={o.valor} value={o.valor}>{t(o.clave)}</option>))}
            </select>
          </div>
          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="aud-usuario">{t('fin.aud.filtroUsuario')}</label>
            <select id="aud-usuario" className={styles.selectFiltro} value={usuarioId}
              onChange={(e) => conReinicio(setUsuarioId)(e.target.value)}>
              <option value="">{t('fin.aud.todosUsuarios')}</option>
              {usuarios.map((u) => (<option key={u.id} value={u.id}>{u.nombre ?? u.id}</option>))}
            </select>
          </div>
          <div className={`${styles.grupoFiltro} ${styles.grupoBusqueda}`}>
            <label className={styles.etiquetaFiltro} htmlFor="aud-texto">{t('fin.aud.buscar')}</label>
            <input id="aud-texto" type="search" className={styles.inputFiltro} value={texto}
              placeholder={t('fin.aud.buscarPlaceholder')}
              onChange={(e) => conReinicio(setTexto)(e.target.value)} />
          </div>
          <Boton variante="secundario" onClick={limpiarFiltros} disabled={!hayFiltros || cargando}>
            {t('fin.aud.limpiar')}
          </Boton>
          <Boton variante="secundario" onClick={() => { void cargar(); }} disabled={cargando}>
            {t('comun.actualizar')}
          </Boton>
        </div>

        {/* ── Tabla ── */}
        <div className={styles.tarjeta}>
          {error && (
            <div className={`${styles.errorCarga} ${styles.noImprimir}`} role="alert">
              <span>{error}</span>
              <Boton variante="secundario" onClick={() => { void cargar(); }}>{t('fin.reintentar')}</Boton>
            </div>
          )}
          {!error && cargando && (
            <p className={`${styles.estadoCarga} ${styles.noImprimir}`}>{t('fin.aud.cargando')}</p>
          )}
          {!error && !cargando && registros.length === 0 && (
            <p className={styles.estadoVacio}>
              {hayFiltros ? t('fin.aud.vacioFiltrado') : t('fin.aud.vacio')}
            </p>
          )}
          {!error && !cargando && registros.length > 0 && (
            <>
              <div className={styles.contenedorTabla}>
                <table className={styles.tabla}>
                  <thead>
                    <tr>
                      <th>{t('fin.aud.thFecha')}</th>
                      <th>{t('fin.aud.thModulo')}</th>
                      <th>{t('fin.aud.thAccion')}</th>
                      <th>{t('fin.aud.thObjeto')}</th>
                      <th className={styles.colImporte}>{t('fin.aud.thOriginal')}</th>
                      <th className={styles.colImporte}>{t('fin.aud.thVigente')}</th>
                      <th className={styles.colImporte}>{t('fin.aud.thDiferencia')}</th>
                      <th>{t('fin.aud.thMotivo')}</th>
                      <th>{t('fin.aud.thUsuario')}</th>
                      <th className={styles.noImprimir}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {registros.map((r) => (
                      <tr key={r.id} className={r.accion === 'anulacion' ? styles.filaAnulada : undefined}>
                        <td className={styles.celdaFecha}>{formatearMomento(r.fechaCorreccion)}</td>
                        <td>{t(`fin.aud.entidad.${r.entidad}`)}</td>
                        <td>
                          <span className={r.accion === 'anulacion' ? styles.badgeAnulado : styles.badgeCorregido}>
                            {t(`fin.aud.accion.${r.accion}`)}
                          </span>
                        </td>
                        <td className={styles.celdaObjeto}>{r.descripcion}</td>
                        <td className={`${styles.monto} ${styles.montoTachado}`}>
                          {formatearDinero(r.montoOriginal)}
                        </td>
                        <td className={styles.monto}>{formatearDinero(r.montoVigente)}</td>
                        <td className={`${styles.monto} ${styles.montoDiferencia}`}>
                          {/* Signo explícito: no depende solo del color. */}
                          {r.diferencia >= 0 ? '−' : '+'}{formatearDinero(Math.abs(r.diferencia))}
                        </td>
                        <td className={styles.celdaMotivo}>{r.motivo ?? '—'}</td>
                        <td className={styles.celdaSecundaria}>{r.registradoPor.nombre ?? '—'}</td>
                        <td className={styles.noImprimir}>
                          <button type="button" className={styles.botonAccion} onClick={() => setDetalle(r)}>
                            <Eye size={14} strokeWidth={1.75} aria-hidden /> {t('fin.aud.verDetalle')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {paginacion && paginacion.paginas > 1 && (
                <div className={`${styles.paginacion} ${styles.noImprimir}`}>
                  <Boton variante="secundario" onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    disabled={paginacion.pagina <= 1 || cargando}>{t('fin.pagos.anterior')}</Boton>
                  <span className={styles.indicadorPagina}>
                    {t('fin.pagos.paginaDe', { pagina: paginacion.pagina, paginas: paginacion.paginas })}
                  </span>
                  <Boton variante="secundario" onClick={() => setPagina((p) => Math.min(paginacion.paginas, p + 1))}
                    disabled={paginacion.pagina >= paginacion.paginas || cargando}>{t('fin.pagos.siguiente')}</Boton>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {detalle && <DetalleCorreccion registro={detalle} onCerrar={() => setDetalle(null)} />}
    </LayoutPrincipal>
  );
}
