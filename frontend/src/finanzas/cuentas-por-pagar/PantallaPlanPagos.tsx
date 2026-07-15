/**
 * Planificador de pagos a proveedores — ruta /cuentas-por-pagar/plan-pagos.
 *
 * Genera una PROPUESTA de reparto de un presupuesto entre las facturas pendientes.
 * NO registra pagos ni escribe nada: el backend solo simula. En modo manual el
 * backend REVALIDA cada monto (el front no puede saltárselo). Tres pasos en una
 * misma página: configurar → generar/ajustar → reporte de confirmación.
 *
 * Filtros de partida (proveedorId, tramo, estrategia) viven en la URL: se llega con
 * contexto desde la antigüedad. El presupuesto NO va a la URL.
 *
 * API: POST /cuentas-por-pagar/plan-pagos/simular · GET /proveedores.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Printer, Download, FileText, History, Receipt, PieChart } from 'lucide-react';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { useAuth } from '../../core/auth/ContextoAuth';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { simularPlanPagos, obtenerProveedores } from './servicioCuentas';
import { descargarCsvPlanPagos } from './csvPlanPagos';
import { formatearDinero, formatearFecha } from './utilidades';
import type { Proveedor } from './tipos';
import type { TramoAntiguedad } from './antiguedad-tipos';
import type { RespuestaPlan, EstrategiaPlan, AsignacionPlan } from './plan-pagos-tipos';
import styles from './PantallaPlanPagos.module.css';

const ESTRATEGIAS: EstrategiaPlan[] = [
  'mas_antiguas_primero',
  'saldos_menores_primero',
  'proporcional_por_proveedor',
  'manual',
];
const TRAMOS: TramoAntiguedad[] = ['dias_0_30', 'dias_31_60', 'dias_61_90', 'dias_90_mas'];

/** Redondea a céntimos para comparar montos sin error de coma flotante. */
function cent(n: number): number {
  return Math.round(n * 100);
}

export function PantallaPlanPagos() {
  const { t } = useTraduccion();
  const { usuario } = useAuth();
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
    const q = () => document.documentElement.removeAttribute('data-theme');
    const r = () => document.documentElement.setAttribute('data-theme', 'dark');
    window.addEventListener('beforeprint', q);
    window.addEventListener('afterprint', r);
    return () => { window.removeEventListener('beforeprint', q); window.removeEventListener('afterprint', r); };
  }, []);

  // ── Configuración (paso 1) ──
  const [presupuesto, setPresupuesto] = useState('');
  const estrategia = (searchParams.get('estrategia') as EstrategiaPlan | null) ?? 'mas_antiguas_primero';
  const proveedorId = searchParams.get('proveedorId') ?? '';
  const tramoUrl = (searchParams.get('tramo') as TramoAntiguedad | null) ?? null;
  const [tramosSel, setTramosSel] = useState<TramoAntiguedad[]>(tramoUrl ? [tramoUrl] : []);
  const [minimo, setMinimo] = useState('');
  const [limiteProv, setLimiteProv] = useState('');
  const [fechaCorte, setFechaCorte] = useState('');

  const [proveedores, setProveedores] = useState<Proveedor[]>([]);

  // ── Resultado (paso 2/3) ──
  const [plan, setPlan] = useState<RespuestaPlan | null>(null);
  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorPresupuesto, setErrorPresupuesto] = useState<string | null>(null);
  const [generadoEn, setGeneradoEn] = useState<string | null>(null);
  // El plan visible corresponde a UNOS parámetros: si cambian, se marca obsoleto.
  const [obsoleto, setObsoleto] = useState(false);
  // Montos manuales editados por el usuario (compraId → texto). Base: la propuesta auto.
  const [manual, setManual] = useState<Record<string, string>>({});

  const fijarParam = (clave: string, valor: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (valor === null || valor === '') next.delete(clave);
    else next.set(clave, valor);
    setSearchParams(next);
  };

  useEffect(() => {
    let vivo = true;
    void obtenerProveedores().then((ps) => { if (vivo) setProveedores(ps); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  const presupuestoNum = parseFloat(presupuesto);
  const presupuestoValido = !isNaN(presupuestoNum) && presupuestoNum > 0;

  /** Cambiar cualquier parámetro de partida marca el plan visible como obsoleto. */
  const alCambiarConfig = () => { if (plan) setObsoleto(true); };

  const generar = useCallback(async (asignacionesManuales?: Array<{ compraId: string; monto: number }>) => {
    if (!presupuestoValido) {
      setErrorPresupuesto(t('fin.plan.errPresupuesto'));
      return;
    }
    setErrorPresupuesto(null);
    setGenerando(true);
    setError(null);
    try {
      const esManual = asignacionesManuales !== undefined;
      const res = await simularPlanPagos({
        presupuestoDisponible: presupuestoNum,
        estrategia: esManual ? 'manual' : estrategia,
        ...(proveedorId ? { proveedorIds: [proveedorId] } : {}),
        ...(tramosSel.length ? { tramos: tramosSel } : {}),
        ...(minimo && parseFloat(minimo) > 0 ? { montoMinimoPago: parseFloat(minimo) } : {}),
        ...(limiteProv && parseFloat(limiteProv) > 0 ? { limitePorProveedor: parseFloat(limiteProv) } : {}),
        ...(fechaCorte ? { fechaCorte } : {}),
        ...(esManual ? { asignacionesManuales } : {}),
      });
      setPlan(res);
      setGeneradoEn(new Date().toLocaleString('es-PA'));
      setObsoleto(false);
      if (!esManual) {
        // Sembrar los montos manuales con la propuesta automática (base editable).
        setManual(Object.fromEntries(res.asignaciones.map((a) => [a.compraId, String(a.montoPlanificado)])));
      }
    } catch (err) {
      // Falla → NO se borran los inputs del usuario.
      setError(err instanceof Error ? err.message : t('fin.plan.errGenerar'));
    } finally {
      setGenerando(false);
    }
  }, [presupuestoValido, presupuestoNum, estrategia, proveedorId, tramosSel, minimo, limiteProv, fechaCorte, t]);

  // ── Cálculo local de los montos manuales en vivo (para validar antes de re-simular) ──
  const totalManualCent = Object.values(manual).reduce((acc, v) => {
    const n = parseFloat(v);
    return acc + (isNaN(n) || n < 0 ? 0 : cent(n));
  }, 0);
  const restanteCent = presupuestoValido ? cent(presupuestoNum) - totalManualCent : 0;

  /** ¿Un monto manual excede el saldo de su factura? */
  const excedeSaldo = (a: AsignacionPlan): boolean => {
    const v = parseFloat(manual[a.compraId] ?? '');
    return !isNaN(v) && cent(v) > cent(a.saldoPendiente);
  };
  const hayExcesoSaldo = plan?.asignaciones.some(excedeSaldo) ?? false;
  const hayExcesoPresupuesto = restanteCent < 0;
  // El reporte solo se puede confirmar si los montos manuales son consistentes.
  const planConsistente = plan !== null && !obsoleto && !hayExcesoSaldo && !hayExcesoPresupuesto;

  // ── Acciones rápidas ──
  const usarTodo = () => setPresupuesto(String(plan?.cabecera.deudaTotal ?? presupuestoNum ?? ''));
  const limpiarTodo = () => setManual(Object.fromEntries((plan?.asignaciones ?? []).map((a) => [a.compraId, '0'])));
  const restaurarAuto = () => {
    if (plan) setManual(Object.fromEntries(plan.asignaciones.map((a) => [a.compraId, String(a.montoPlanificado)])));
  };
  const pagarSaldo = (a: AsignacionPlan) => setManual((m) => ({ ...m, [a.compraId]: String(a.saldoPendiente) }));

  /** Re-simula usando los montos manuales (el backend los revalida). */
  const aplicarManual = () => {
    const asigns = Object.entries(manual)
      .map(([compraId, v]) => ({ compraId, monto: parseFloat(v) }))
      .filter((x) => !isNaN(x.monto) && x.monto > 0);
    void generar(asigns);
  };

  const exportarCsv = () => { if (plan) descargarCsvPlanPagos(plan, t); };

  const puedeVer = usuario?.rol === 'administrador' || usuario?.rol === 'supervisor';
  // El backend refuerza con 403; esta guardia evita mostrar la herramienta al empleado.
  if (!puedeVer) {
    return (
      <LayoutPrincipal>
        <div className={styles.contenedor}>
          <p className={styles.estadoVacio}>{t('fin.plan.sinAcceso')}</p>
        </div>
      </LayoutPrincipal>
    );
  }

  const usadoPct = plan && plan.cabecera.presupuestoDisponible > 0
    ? Math.min(100, Math.round((plan.cabecera.montoPlanificado / plan.cabecera.presupuestoDisponible) * 1000) / 10)
    : 0;

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        {/* ── Encabezado ── */}
        <div className={`${styles.encabezado} ${styles.noImprimir}`}>
          <div>
            <h1 className={styles.tituloPagina}>{t('fin.plan.titulo')}</h1>
            <p className={styles.subtitulo}>{t('fin.plan.subtitulo')}</p>
          </div>
          {plan && (
            <div className={styles.acciones}>
              <Boton variante="secundario" onClick={() => window.print()}>
                <Printer size={16} strokeWidth={1.75} aria-hidden /> {t('fin.plan.imprimir')}
              </Boton>
              <Boton variante="secundario" onClick={exportarCsv}>
                <Download size={16} strokeWidth={1.75} aria-hidden /> {t('fin.plan.exportarCsv')}
              </Boton>
            </div>
          )}
        </div>

        {/* Aviso permanente: no se registra ningún pago. */}
        <div className={styles.avisoNoRegistra} role="note">{t('fin.plan.avisoNoRegistra')}</div>

        {/* ── PASO 1: configuración ── */}
        <div className={`${styles.tarjeta} ${styles.noImprimir}`}>
          <h2 className={styles.tituloBloque}>{t('fin.plan.paso1')}</h2>
          <div className={styles.configGrid}>
            <Entrada
              etiqueta={t('fin.plan.presupuesto')}
              type="number" min="0" step="0.01"
              value={presupuesto}
              onChange={(e) => { setPresupuesto(e.target.value); setErrorPresupuesto(null); alCambiarConfig(); }}
              placeholder="B/. 0.00"
              error={errorPresupuesto ?? (presupuesto !== '' && !presupuestoValido ? t('fin.plan.errPresupuesto') : undefined)}
            />
            <div className={styles.grupo}>
              <label className={styles.etiqueta} htmlFor="plan-estrategia">{t('fin.plan.estrategia')}</label>
              <select id="plan-estrategia" className={styles.select} value={estrategia}
                onChange={(e) => { fijarParam('estrategia', e.target.value); alCambiarConfig(); }}>
                {ESTRATEGIAS.filter((e) => e !== 'manual').map((e) => (
                  <option key={e} value={e}>{t(`fin.plan.est.${e}`)}</option>
                ))}
              </select>
            </div>
            <div className={styles.grupo}>
              <label className={styles.etiqueta} htmlFor="plan-proveedor">{t('fin.plan.proveedor')}</label>
              <select id="plan-proveedor" className={styles.select} value={proveedorId}
                onChange={(e) => { fijarParam('proveedorId', e.target.value || null); alCambiarConfig(); }}>
                <option value="">{t('fin.plan.todosProveedores')}</option>
                {proveedores.map((p) => (<option key={p.id} value={p.id}>{p.nombre}</option>))}
              </select>
            </div>
            <Entrada etiqueta={t('fin.plan.minimo')} type="number" min="0" step="0.01"
              value={minimo} onChange={(e) => { setMinimo(e.target.value); alCambiarConfig(); }} placeholder="—" />
            <Entrada etiqueta={t('fin.plan.limiteProv')} type="number" min="0" step="0.01"
              value={limiteProv} onChange={(e) => { setLimiteProv(e.target.value); alCambiarConfig(); }} placeholder="—" />
            <Entrada etiqueta={t('fin.plan.fechaCorte')} type="date"
              value={fechaCorte} onChange={(e) => { setFechaCorte(e.target.value); alCambiarConfig(); }} />
          </div>

          {/* Filtro por tramos (multi). */}
          <div className={styles.tramosFiltro}>
            <span className={styles.etiqueta}>{t('fin.plan.tramos')}</span>
            <div className={styles.tramosChips}>
              {TRAMOS.map((tr) => {
                const activo = tramosSel.includes(tr);
                return (
                  <button key={tr} type="button"
                    className={`${styles.chip} ${activo ? styles.chipActivo : ''}`}
                    aria-pressed={activo}
                    onClick={() => { setTramosSel((s) => activo ? s.filter((x) => x !== tr) : [...s, tr]); alCambiarConfig(); }}>
                    {t(`fin.ant.${tr}`)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className={styles.accionesPaso1}>
            <Boton onClick={() => { void generar(); }} cargando={generando} disabled={!presupuestoValido}>
              {t('fin.plan.generar')}
            </Boton>
            <button type="button" className={styles.enlaceRapido} onClick={usarTodo} disabled={!plan}>
              {t('fin.plan.usarTodo')}
            </button>
            <Link to="/cuentas-por-pagar/antiguedad" className={styles.enlaceRapido}>
              <PieChart size={14} strokeWidth={1.75} aria-hidden /> {t('fin.plan.volverAntiguedad')}
            </Link>
          </div>
        </div>

        {error && (
          <div className={`${styles.errorCarga} ${styles.noImprimir}`} role="alert">
            <span>{error}</span>
            <Boton variante="secundario" onClick={() => { void generar(); }}>{t('fin.reintentar')}</Boton>
          </div>
        )}

        {obsoleto && plan && (
          <div className={`${styles.avisoObsoleto} ${styles.noImprimir}`} role="status">
            {t('fin.plan.obsoleto')}
          </div>
        )}

        {!plan && !generando && !error && (
          <p className={`${styles.estadoVacio} ${styles.noImprimir}`}>{t('fin.plan.instruccion')}</p>
        )}

        {/* ── PASO 2/3: plan generado ── */}
        {plan && (
          <>
            {/* Título de impresión. */}
            <div className={styles.tituloImpresion}>
              <h1>{t('fin.plan.titulo')}</h1>
              <p>
                {t(`fin.plan.est.${plan.cabecera.estrategia}`)}
                {generadoEn ? ` · ${t('fin.plan.generadoEl', { fecha: generadoEn })}` : ''}
              </p>
            </div>

            {/* Barra de uso del presupuesto. */}
            <div className={styles.tarjeta}>
              <div className={styles.progresoCabecera}>
                <span>{t('fin.plan.usoPresupuesto')}</span>
                <span className={styles.progresoValor}>
                  {formatearDinero(plan.cabecera.montoPlanificado)} / {formatearDinero(plan.cabecera.presupuestoDisponible)} ({usadoPct}%)
                </span>
              </div>
              <div className={styles.barraProgreso}>
                <div className={styles.barraProgresoRelleno} style={{ width: `${usadoPct}%` }} />
              </div>
              <div className={styles.resumenChips}>
                <span className={styles.chipResumen}>{t('fin.plan.noUsado')}: {formatearDinero(plan.cabecera.presupuestoNoUsado)}</span>
                <span className={styles.chipResumen}>{t('fin.plan.deudaProyectada')}: {formatearDinero(plan.cabecera.deudaProyectada)}</span>
                <span className={styles.chipResumen}>{t('fin.plan.completas', { n: plan.cabecera.facturasCompletas })}</span>
                <span className={styles.chipResumen}>{t('fin.plan.parciales', { n: plan.cabecera.facturasParciales })}</span>
              </div>
            </div>

            {/* Distribución por tramo: antes vs después. */}
            <div className={styles.tarjeta}>
              <h2 className={styles.tituloBloque}>{t('fin.plan.tramoAntesDespues')}</h2>
              <div className={styles.contenedorTabla}>
                <table className={styles.tabla}>
                  <thead>
                    <tr>
                      <th>{t('fin.plan.thTramo')}</th>
                      <th className={styles.colImporte}>{t('fin.plan.thAntes')}</th>
                      <th className={styles.colImporte}>{t('fin.plan.thPagoPlan')}</th>
                      <th className={styles.colImporte}>{t('fin.plan.thDespues')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.resumenPorTramo.map((r) => (
                      <tr key={r.tramo}>
                        <td>{t(`fin.ant.${r.tramo}`)}</td>
                        <td className={styles.monto}>{formatearDinero(r.deudaAntes)}</td>
                        <td className={styles.monto}>{formatearDinero(r.pagoPlanificado)}</td>
                        <td className={`${styles.monto} ${styles.saldo}`}>{formatearDinero(r.deudaDespues)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Resumen por proveedor. */}
            {plan.resumenPorProveedor.length > 0 && (
              <div className={styles.tarjeta}>
                <h2 className={styles.tituloBloque}>{t('fin.plan.porProveedor')}</h2>
                <div className={styles.contenedorTabla}>
                  <table className={styles.tabla}>
                    <thead>
                      <tr>
                        <th>{t('fin.plan.thProveedor')}</th>
                        <th className={styles.colImporte}>{t('fin.plan.thDeudaActual')}</th>
                        <th className={styles.colImporte}>{t('fin.plan.thPlanificado')}</th>
                        <th className={styles.colImporte}>{t('fin.plan.thDeudaProyectada')}</th>
                        <th className={styles.colNum}>{t('fin.plan.thIncluidas')}</th>
                        <th className={styles.colNum}>{t('fin.plan.thCompletadas')}</th>
                        <th className={styles.noImprimir}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.resumenPorProveedor.map((p) => (
                        <tr key={p.proveedorId}>
                          <td>{p.nombre}</td>
                          <td className={styles.monto}>{formatearDinero(p.deudaActual)}</td>
                          <td className={`${styles.monto} ${styles.saldo}`}>{formatearDinero(p.montoPlanificado)}</td>
                          <td className={styles.monto}>{formatearDinero(p.deudaProyectada)}</td>
                          <td className={styles.colNum}>{p.cantidadFacturasIncluidas}</td>
                          <td className={styles.colNum}>{p.cantidadFacturasCompletadas}</td>
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

            {/* Detalle editable de asignaciones (paso 2: ajuste manual). */}
            <div className={styles.tarjeta}>
              <div className={styles.cabeceraDetalle}>
                <h2 className={styles.tituloBloque}>{t('fin.plan.detalle')}</h2>
                <div className={`${styles.accionesDetalle} ${styles.noImprimir}`}>
                  <span className={hayExcesoPresupuesto ? styles.restanteNegativo : styles.restante}>
                    {t('fin.plan.restante')}: {formatearDinero(restanteCent / 100)}
                  </span>
                  <button type="button" className={styles.enlaceRapido} onClick={limpiarTodo}>{t('fin.plan.limpiarTodo')}</button>
                  <button type="button" className={styles.enlaceRapido} onClick={restaurarAuto}>{t('fin.plan.restaurarAuto')}</button>
                  <Boton variante="secundario" onClick={aplicarManual} disabled={generando}>
                    {t('fin.plan.aplicarManual')}
                  </Boton>
                </div>
              </div>

              {(hayExcesoPresupuesto || hayExcesoSaldo) && (
                <p className={`${styles.avisoInvalido} ${styles.noImprimir}`} role="alert">
                  {hayExcesoPresupuesto ? t('fin.plan.avisoExcesoPresupuesto') : t('fin.plan.avisoExcesoSaldo')}
                </p>
              )}

              {plan.asignaciones.length === 0 ? (
                <p className={styles.estadoVacio}>{t('fin.plan.sinFacturas')}</p>
              ) : (
                <div className={styles.contenedorTabla}>
                  <table className={styles.tabla}>
                    <thead>
                      <tr>
                        <th className={styles.colNum}>{t('fin.plan.thOrden')}</th>
                        <th>{t('fin.plan.thFecha')}</th>
                        <th>{t('fin.plan.thFactura')}</th>
                        <th>{t('fin.plan.thProveedor')}</th>
                        <th className={styles.colNum}>{t('fin.plan.thDias')}</th>
                        <th className={styles.colImporte}>{t('fin.plan.thSaldo')}</th>
                        <th className={styles.colImporte}>{t('fin.plan.thPago')}</th>
                        <th className={styles.colImporte}>{t('fin.plan.thSaldoProyectado')}</th>
                        <th>{t('fin.plan.thResultado')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {plan.asignaciones.map((a) => {
                        const exceso = excedeSaldo(a);
                        const valorManual = manual[a.compraId] ?? String(a.montoPlanificado);
                        const pagoNum = parseFloat(valorManual);
                        const proy = a.saldoPendiente - (isNaN(pagoNum) ? 0 : pagoNum);
                        const completa = !isNaN(pagoNum) && cent(pagoNum) === cent(a.saldoPendiente) && pagoNum > 0;
                        return (
                          <tr key={a.compraId}>
                            <td className={styles.colNum}>{a.orden}</td>
                            <td className={styles.celdaFecha}>{formatearFecha(a.fechaCompra)}</td>
                            <td className={styles.celdaSecundaria}>{a.numeroFactura}</td>
                            <td>{a.proveedorNombre}</td>
                            <td className={styles.colNum}>{t('fin.ant.diasValor', { dias: a.diasAntiguedad })}</td>
                            <td className={styles.monto}>{formatearDinero(a.saldoPendiente)}</td>
                            <td className={styles.colImporte}>
                              <div className={styles.celdaPago}>
                                <input
                                  type="number" min="0" step="0.01"
                                  className={`${styles.inputPago} ${exceso ? styles.inputInvalido : ''} ${styles.noImprimir}`}
                                  value={valorManual}
                                  aria-label={t('fin.plan.pagoDe', { factura: a.numeroFactura })}
                                  aria-invalid={exceso || undefined}
                                  onChange={(e) => setManual((m) => ({ ...m, [a.compraId]: e.target.value }))}
                                />
                                <span className={styles.pagoImpresion}>{formatearDinero(isNaN(pagoNum) ? 0 : pagoNum)}</span>
                                <button type="button" className={`${styles.botonSaldo} ${styles.noImprimir}`}
                                  onClick={() => pagarSaldo(a)} title={t('fin.plan.pagarSaldo')}>
                                  {t('fin.plan.saldoCorto')}
                                </button>
                              </div>
                              {exceso && <span className={`${styles.textoInvalido} ${styles.noImprimir}`}>{t('fin.plan.excedeSaldo')}</span>}
                            </td>
                            <td className={`${styles.monto} ${styles.saldo}`}>{formatearDinero(Math.max(0, proy))}</td>
                            <td>
                              <span className={completa ? styles.badgeCompleta : styles.badgeParcial}>
                                {t(completa ? 'fin.plan.resultado.completa' : 'fin.plan.resultado.parcial')}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* ── PASO 3: reporte de confirmación (solo lectura) ── */}
            <div className={styles.tarjeta}>
              <h2 className={styles.tituloBloque}>{t('fin.plan.paso3')}</h2>
              {!planConsistente ? (
                <p className={styles.avisoInvalido} role="status">{t('fin.plan.corrigeAntes')}</p>
              ) : (
                <div className={styles.reporte}>
                  <dl className={styles.reporteDatos}>
                    <div><dt>{t('fin.plan.estrategia')}</dt><dd>{t(`fin.plan.est.${plan.cabecera.estrategia}`)}</dd></div>
                    <div><dt>{t('fin.plan.presupuesto')}</dt><dd>{formatearDinero(plan.cabecera.presupuestoDisponible)}</dd></div>
                    <div><dt>{t('fin.plan.planificado')}</dt><dd>{formatearDinero(plan.cabecera.montoPlanificado)}</dd></div>
                    <div><dt>{t('fin.plan.noUsado')}</dt><dd>{formatearDinero(plan.cabecera.presupuestoNoUsado)}</dd></div>
                    <div><dt>{t('fin.plan.deudaProyectada')}</dt><dd>{formatearDinero(plan.cabecera.deudaProyectada)}</dd></div>
                    {generadoEn && <div><dt>{t('fin.plan.generado')}</dt><dd>{generadoEn}</dd></div>}
                  </dl>
                </div>
              )}
              <p className={styles.descargo}>{t('fin.plan.descargo')}</p>
            </div>
          </>
        )}
      </div>
    </LayoutPrincipal>
  );
}
