/**
 * Historial de pagos a proveedor — ruta /pagos.
 *
 * Cada pago es un movimiento de dinero INMUTABLE: aquí no se edita ni se borra
 * ninguno. Se ve qué se pagó, a quién, contra qué factura, quién lo registró y
 * cuándo; y, si un pago se corrigió, se ve su monto original TACHADO junto al que
 * vale hoy, con su motivo. Corregir (reverso + corrección) es acción de gestión:
 * el botón solo aparece para supervisor/administrador, igual que el guard del
 * backend en POST /correcciones. Un pago ya corregido no admite otra corrección.
 *
 * Rutas de API: GET /cuentas-por-pagar/pagos · GET /proveedores · POST /correcciones.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { FileText } from 'lucide-react';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useAuth } from '../../core/auth/ContextoAuth';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { DialogoCorreccion } from '../correcciones';
import { obtenerHistorialPagos, obtenerProveedores } from './servicioCuentas';
import { formatearDinero, formatearFecha } from './utilidades';
import type {
  PagoHistorial,
  PaginacionPagos,
  ResumenPagos,
  EstadoPago,
  Proveedor,
} from './tipos';
import styles from './PantallaPagos.module.css';

const OPCIONES_ESTADO: Array<{ valor: EstadoPago | ''; etiquetaKey: string }> = [
  { valor: '', etiquetaKey: 'fin.pagos.todosEstados' },
  { valor: 'vigente', etiquetaKey: 'fin.corr.estadoVigente' },
  { valor: 'corregido', etiquetaKey: 'fin.corr.estadoCorregido' },
  { valor: 'anulado', etiquetaKey: 'fin.corr.estadoAnulado' },
];

const TAMANO_PAGINA = 20;

export function PantallaPagos() {
  const { t } = useTraduccion();
  const [searchParamsPagos] = useSearchParams();
  const { usuario } = useAuth();
  // Corregir dinero es acción de GESTIÓN (POST /correcciones = supervisor/admin).
  // El empleado ve el historial y los estados, pero no la acción.
  const puedeCorregir = usuario?.rol === 'administrador' || usuario?.rol === 'supervisor';

  // Tema oscuro grafito mientras esta pantalla esté montada.
  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', 'dark');
    return () => {
      if (previo === null) raiz.removeAttribute('data-theme');
      else raiz.setAttribute('data-theme', previo);
    };
  }, []);

  // Datos
  const [pagos, setPagos] = useState<PagoHistorial[]>([]);
  const [paginacion, setPaginacion] = useState<PaginacionPagos | null>(null);
  const [resumen, setResumen] = useState<ResumenPagos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Filtros (el catálogo de proveedores es no crítico: si falla, se avisa y el
  // resto del historial sigue usable sin ese filtro).
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [errorProveedores, setErrorProveedores] = useState<string | null>(null);
  // El proveedor puede venir en la URL (?proveedorId=) desde la antigüedad.
  const [proveedorId, setProveedorId] = useState(searchParamsPagos.get('proveedorId') ?? '');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [estado, setEstado] = useState<EstadoPago | ''>('');
  const [pagina, setPagina] = useState(1);

  // Corrección
  const [pagoACorregir, setPagoACorregir] = useState<PagoHistorial | null>(null);
  const [avisoCorreccion, setAvisoCorreccion] = useState<string | null>(null);

  const cargarProveedores = useCallback(async () => {
    setErrorProveedores(null);
    try {
      setProveedores(await obtenerProveedores());
    } catch (err) {
      setErrorProveedores(err instanceof Error ? err.message : t('fin.prov.errCargar'));
    }
  }, [t]);

  useEffect(() => {
    void cargarProveedores();
  }, [cargarProveedores]);

  const cargarPagos = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const respuesta = await obtenerHistorialPagos({
        ...(proveedorId ? { proveedorId } : {}),
        ...(desde ? { desde } : {}),
        ...(hasta ? { hasta } : {}),
        ...(estado ? { estado } : {}),
        pagina,
        tamano: TAMANO_PAGINA,
      });
      setPagos(respuesta.pagos);
      setPaginacion(respuesta.paginacion);
      setResumen(respuesta.resumen);
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : t('fin.pagos.errCargar'));
    } finally {
      setCargando(false);
    }
  }, [proveedorId, desde, hasta, estado, pagina, t]);

  useEffect(() => {
    void cargarPagos();
  }, [cargarPagos]);

  /** Cambiar un filtro vuelve a la página 1 (si no, se pediría una página que ya no existe). */
  const conReinicio = <T,>(fijar: (valor: T) => void) => (valor: T) => {
    fijar(valor);
    setPagina(1);
    setAvisoCorreccion(null);
  };

  const limpiarFiltros = () => {
    setProveedorId('');
    setDesde('');
    setHasta('');
    setEstado('');
    setPagina(1);
    setAvisoCorreccion(null);
  };

  const hayFiltros = proveedorId !== '' || desde !== '' || hasta !== '' || estado !== '';

  /**
   * Tras corregir (201 confirmado): avisar SIEMPRE y refrescar. Si la recarga
   * fallara, se ve su error de carga, pero el aviso deja claro que la corrección
   * SÍ se registró — nadie debe repetirla creyendo que falló.
   */
  const manejarCorregido = () => {
    setPagoACorregir(null);
    setAvisoCorreccion(t('fin.pagos.avisoCorregido'));
    void cargarPagos();
  };

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>{t('fin.pagos.titulo')}</h1>
            <p className={styles.subtitulo}>{t('fin.pagos.subtitulo')}</p>
          </div>
          {/* Conciliar con un proveedor concreto: documento imprimible / CSV. */}
          <Link to="/estado-cuenta" className={styles.enlaceEstadoCuenta}>
            <FileText size={16} strokeWidth={1.75} aria-hidden />
            {t('fin.ec.verEstadoCuenta')}
          </Link>
        </div>

        {/* ── Resumen del conjunto FILTRADO completo (no solo de esta página) ── */}
        {resumen && (
          <div className={styles.resumen}>
            <div className={styles.tarjetaResumen}>
              <span className={styles.etiquetaResumen}>{t('fin.pagos.resCantidad')}</span>
              <span className={styles.valorResumen}>{resumen.cantidad}</span>
            </div>
            <div className={styles.tarjetaResumen}>
              <span className={styles.etiquetaResumen}>{t('fin.pagos.resOriginal')}</span>
              <span className={styles.valorResumen}>{formatearDinero(resumen.totalOriginal)}</span>
            </div>
            <div className={styles.tarjetaResumen}>
              <span className={styles.etiquetaResumen}>{t('fin.pagos.resVigente')}</span>
              <span className={styles.valorResumenFuerte}>
                {formatearDinero(resumen.totalVigente)}
              </span>
            </div>
            <div className={styles.tarjetaResumen}>
              <span className={styles.etiquetaResumen}>{t('fin.pagos.resDiferencia')}</span>
              <span
                className={
                  resumen.diferencia !== 0 ? styles.valorResumenAlerta : styles.valorResumen
                }
              >
                {formatearDinero(resumen.diferencia)}
              </span>
            </div>
          </div>
        )}

        {/* ── Filtros ── */}
        <div className={styles.filtros}>
          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="filtro-proveedor">
              {t('fin.pagos.proveedor')}
            </label>
            <select
              id="filtro-proveedor"
              className={styles.selectFiltro}
              value={proveedorId}
              onChange={(e) => conReinicio(setProveedorId)(e.target.value)}
            >
              <option value="">{t('fin.pagos.todosProveedores')}</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="filtro-desde">
              {t('comun.desde')}
            </label>
            <input
              id="filtro-desde"
              type="date"
              className={styles.inputFiltro}
              value={desde}
              onChange={(e) => conReinicio(setDesde)(e.target.value)}
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
              onChange={(e) => conReinicio(setHasta)(e.target.value)}
            />
          </div>

          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="filtro-estado">
              {t('fin.estado')}
            </label>
            <select
              id="filtro-estado"
              className={styles.selectFiltro}
              value={estado}
              onChange={(e) => conReinicio(setEstado)(e.target.value as EstadoPago | '')}
            >
              {OPCIONES_ESTADO.map((op) => (
                <option key={op.valor} value={op.valor}>
                  {t(op.etiquetaKey)}
                </option>
              ))}
            </select>
          </div>

          <Boton variante="secundario" onClick={limpiarFiltros} disabled={!hayFiltros || cargando}>
            {t('fin.pagos.limpiarFiltros')}
          </Boton>
        </div>

        {errorProveedores && (
          <div className={styles.errorSuave}>
            <span>{errorProveedores}</span>
            <Boton variante="secundario" onClick={() => { void cargarProveedores(); }}>
              {t('fin.reintentar')}
            </Boton>
          </div>
        )}

        {/* ── Tabla ── */}
        <div className={styles.tarjeta}>
          {avisoCorreccion && <div className={styles.avisoInfo}>{avisoCorreccion}</div>}

          {errorCarga && (
            <div className={styles.errorCarga} role="alert">
              <span>{errorCarga}</span>
              <Boton variante="secundario" onClick={() => { void cargarPagos(); }}>
                {t('fin.reintentar')}
              </Boton>
            </div>
          )}

          {!errorCarga && cargando && (
            <p className={styles.estadoCarga}>{t('fin.pagos.cargandoLista')}</p>
          )}

          {!errorCarga && !cargando && pagos.length === 0 && (
            <p className={styles.estadoVacio}>
              {hayFiltros ? t('fin.pagos.vacioFiltrado') : t('fin.pagos.vacio')}
            </p>
          )}

          {!errorCarga && !cargando && pagos.length > 0 && (
            <>
              <div className={styles.contenedorTabla}>
                <table className={styles.tabla}>
                  <thead>
                    <tr>
                      <th>{t('fin.pagos.thFecha')}</th>
                      <th>{t('fin.pagos.thProveedor')}</th>
                      <th>{t('fin.pagos.thFactura')}</th>
                      <th>{t('fin.pagos.thRegistradoPor')}</th>
                      <th>{t('fin.pagos.thMontoOriginal')}</th>
                      <th>{t('fin.pagos.thMontoVigente')}</th>
                      <th>{t('fin.corr.thEstado')}</th>
                      {puedeCorregir && <th className={styles.colAccion}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {pagos.map((pago) => (
                      <tr
                        key={pago.id}
                        className={pago.estado === 'anulado' ? styles.filaAnulada : undefined}
                      >
                        <td>{formatearFecha(pago.fechaPago)}</td>
                        <td>{pago.proveedorNombre}</td>
                        <td className={styles.celdaSecundaria}>
                          {pago.numeroFactura}
                          <span className={styles.montoFactura}>
                            {formatearDinero(pago.montoFactura)}
                          </span>
                        </td>
                        <td className={styles.celdaSecundaria}>{pago.registradoPor ?? '—'}</td>
                        <td className={styles.monto}>
                          {/* El original NUNCA se sobrescribe: si se corrigió, va tachado. */}
                          <span
                            className={
                              pago.estado === 'vigente' ? undefined : styles.montoTachado
                            }
                          >
                            {formatearDinero(pago.monto)}
                          </span>
                        </td>
                        <td className={styles.monto}>
                          <span
                            className={
                              pago.estado === 'anulado' ? styles.montoCero : styles.montoVigente
                            }
                          >
                            {formatearDinero(pago.montoVigente)}
                          </span>
                        </td>
                        <td>
                          {pago.estado === 'vigente' ? (
                            <span className={styles.badgeVigente}>
                              {t('fin.corr.estadoVigente')}
                            </span>
                          ) : (
                            <span
                              className={
                                pago.estado === 'anulado'
                                  ? styles.badgeAnulado
                                  : styles.badgeCorregido
                              }
                              title={pago.motivoCorreccion ?? undefined}
                            >
                              {t(
                                pago.estado === 'anulado'
                                  ? 'fin.corr.estadoAnulado'
                                  : 'fin.corr.estadoCorregido',
                              )}
                            </span>
                          )}
                        </td>
                        {puedeCorregir && (
                          <td className={styles.colAccion}>
                            {/* Un pago admite UNA sola corrección: ya corregido → sin botón,
                                se muestra el motivo (que es lo útil a partir de entonces). */}
                            {pago.estado === 'vigente' ? (
                              <button
                                type="button"
                                className={styles.botonAccion}
                                onClick={() => {
                                  setAvisoCorreccion(null);
                                  setPagoACorregir(pago);
                                }}
                              >
                                {t('fin.corr.btnCorregir')}
                              </button>
                            ) : (
                              <Link
                                className={styles.enlaceAuditoria}
                                to={`/auditoria-financiera?entidad=pago&registroId=${pago.id}`}
                                title={pago.motivoCorreccion ?? undefined}
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
              </div>

              {/* ── Paginación ── */}
              {paginacion && paginacion.paginas > 1 && (
                <div className={styles.paginacion}>
                  <Boton
                    variante="secundario"
                    onClick={() => setPagina((p) => Math.max(1, p - 1))}
                    disabled={paginacion.pagina <= 1 || cargando}
                  >
                    {t('fin.pagos.anterior')}
                  </Boton>
                  <span className={styles.indicadorPagina}>
                    {t('fin.pagos.paginaDe', {
                      pagina: paginacion.pagina,
                      paginas: paginacion.paginas,
                    })}
                  </span>
                  <Boton
                    variante="secundario"
                    onClick={() => setPagina((p) => Math.min(paginacion.paginas, p + 1))}
                    disabled={paginacion.pagina >= paginacion.paginas || cargando}
                  >
                    {t('fin.pagos.siguiente')}
                  </Boton>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Corrección del pago (reverso + corrección). El importe por defecto es el
          VIGENTE; anular no manda ningún monto. */}
      {pagoACorregir && (
        <DialogoCorreccion
          entidad="pago"
          movimientoId={pagoACorregir.id}
          descripcion={`${pagoACorregir.proveedorNombre} · ${t('fin.pagos.facturaCorta', {
            numero: pagoACorregir.numeroFactura,
          })} · ${formatearFecha(pagoACorregir.fechaPago)}`}
          montoOriginal={pagoACorregir.montoVigente}
          onCerrar={() => setPagoACorregir(null)}
          onCorregido={manejarCorregido}
        />
      )}
    </LayoutPrincipal>
  );
}
