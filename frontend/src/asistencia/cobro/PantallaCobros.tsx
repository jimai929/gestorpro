/**
 * Pantalla de cobro anticipado de horas extra — ruta PROTEGIDA /asistencia/cobros.
 *
 * Dos secciones en la misma pantalla:
 *   A) Solicitud del empleado: selector de empleado, saldo visible, formulario de monto.
 *   B) Lista y gestión (jefe/admin): tabla de solicitudes con acciones por estado.
 *
 * Rutas de API utilizadas:
 *   GET  /empleados                   → lista de empleados
 *   GET  /saldo?empleadoId=ID         → saldo y disponible del empleado
 *   GET  /configuracion-cobro         → % cobrable y umbral de aprobación
 *   POST /cobros                      → crear solicitud
 *   GET  /cobros?empleadoId?&estado?  → lista de solicitudes
 *   POST /cobros/:id/aprobar          → aprobar (supervisor/admin)
 *   POST /cobros/:id/rechazar         → rechazar (supervisor/admin)
 *   POST /cobros/:id/pagar            → marcar pagada (admin)
 */

import { useState, useEffect, useCallback } from 'react';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useAuth } from '../../core/auth/ContextoAuth';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import {
  obtenerEmpleados,
  obtenerSaldo,
  crearSolicitudCobro,
  obtenerCobros,
  aprobarCobro,
  rechazarCobro,
  pagarCobro,
} from './servicioCobro';
import type {
  EmpleadoResumido,
  SaldoEmpleado,
  SolicitudCobro,
  EstadoCobro,
} from './tipos';
import styles from './PantallaCobros.module.css';

// ── Constantes de presentación ─────────────────────────────────────────────

const CLASE_ESTADO: Record<EstadoCobro, string> = {
  pendiente: styles.badgePendiente,
  aprobada: styles.badgeAprobada,
  rechazada: styles.badgeRechazada,
  pagada: styles.badgePagada,
};

const OPCIONES_ESTADO: Array<{ valor: EstadoCobro | ''; etiquetaKey: string }> = [
  { valor: '', etiquetaKey: 'asi.cob.todosEstados' },
  { valor: 'pendiente', etiquetaKey: 'asi.cob.pendientes' },
  { valor: 'aprobada', etiquetaKey: 'asi.cob.aprobadas' },
  { valor: 'rechazada', etiquetaKey: 'asi.cob.rechazadas' },
  { valor: 'pagada', etiquetaKey: 'asi.cob.pagadas' },
];

/** Formatea un número como moneda panameña con 2 decimales. */
function formatearDinero(valor: number): string {
  return `B/. ${valor.toFixed(2)}`;
}

/** Formatea un ISO 8601 a "DD/MM/AAAA HH:mm" en zona local. */
function formatearMomento(iso: string): string {
  const fecha = new Date(iso);
  return fecha.toLocaleString('es-PA', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Subcomponente: modal de motivo de rechazo ─────────────────────────────

interface PropiedadesModalRechazo {
  cobro: SolicitudCobro;
  alCerrar: () => void;
  alRechazar: (cobroActualizado: SolicitudCobro) => void;
}

function ModalRechazo({ cobro, alCerrar, alRechazar }: PropiedadesModalRechazo) {
  const { t } = useTraduccion();
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    try {
      const actualizado = await rechazarCobro(cobro.id, {
        motivo: motivo.trim() || undefined,
      });
      alRechazar(actualizado);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('asi.cob.errRechazar'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className={styles.fondoModal} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <h2 className={styles.tituloModal}>{t('asi.cob.rechazarTitulo')}</h2>
        <p className={styles.subtituloModal}>
          {t('asi.cob.modalEmpleadoLabel')} <strong>{cobro.empleado.nombre}</strong>
          {t('asi.cob.modalMonto', { monto: formatearDinero(cobro.monto) })}
        </p>

        <div>
          <label htmlFor="motivo-rechazo-cobro" className={styles.etiquetaModal}>
            {t('asi.cob.motivoLabel')}
          </label>
          <textarea
            id="motivo-rechazo-cobro"
            className={styles.textareaModal}
            placeholder={t('asi.cob.motivoPlaceholder')}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            autoFocus
          />
        </div>

        {error && (
          <p style={{ color: 'var(--color-danger)', fontSize: '0.875rem', margin: 0 }}>{error}</p>
        )}

        <div className={styles.botonesModal}>
          <Boton variante="secundario" onClick={alCerrar} disabled={enviando}>
            {t('comun.cancelar')}
          </Boton>
          <Boton
            variante="peligro"
            onClick={() => { void confirmar(); }}
            cargando={enviando}
          >
            {t('asi.cob.confirmarRechazo')}
          </Boton>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export function PantallaCobros() {
  const { usuario } = useAuth();
  const { t } = useTraduccion();
  const esSupervisorOAdmin =
    usuario?.rol === 'supervisor' || usuario?.rol === 'administrador';
  const esAdmin = usuario?.rol === 'administrador';

  // ── Estado: sección A — solicitud ────────────────────────────────────────

  const [empleados, setEmpleados] = useState<EmpleadoResumido[]>([]);
  const [cargandoEmpleados, setCargandoEmpleados] = useState(false);
  const [errorEmpleados, setErrorEmpleados] = useState<string | null>(null);

  const [empleadoSeleccionado, setEmpleadoSeleccionado] = useState('');
  const [saldo, setSaldo] = useState<SaldoEmpleado | null>(null);
  const [cargandoSaldo, setCargandoSaldo] = useState(false);
  const [errorSaldo, setErrorSaldo] = useState<string | null>(null);

  const [monto, setMonto] = useState('');
  const [enviandoSolicitud, setEnviandoSolicitud] = useState(false);
  const [errorSolicitud, setErrorSolicitud] = useState<string | null>(null);
  const [exitoSolicitud, setExitoSolicitud] = useState<string | null>(null);

  // ── Estado: sección B — lista de cobros ──────────────────────────────────

  const [cobros, setCobros] = useState<SolicitudCobro[]>([]);
  const [cargandoCobros, setCargandoCobros] = useState(false);
  const [errorCobros, setErrorCobros] = useState<string | null>(null);
  const [filtroEstado, setFiltroEstado] = useState<EstadoCobro | ''>('');

  const [procesando, setProcesando] = useState<Set<string>>(new Set());
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  // Modal de rechazo
  const [cobroARechazar, setCobroARechazar] = useState<SolicitudCobro | null>(null);

  // ── Tema oscuro: montar data-theme mientras esta pantalla esté viva ──────

  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', 'dark');
    return () => {
      if (previo === null) raiz.removeAttribute('data-theme');
      else raiz.setAttribute('data-theme', previo);
    };
  }, []);

  // ── Carga inicial: empleados (error visible + reintento) ──────────────────
  // Reutilizable por el botón de reintento. `cargandoEmpleados` deshabilita el
  // botón mientras la petición está en vuelo (evita solicitudes duplicadas). El
  // fallo NUNCA se traga: se expone en `errorEmpleados`, igual que errorSaldo /
  // errorCobros hacen en el resto de esta pantalla.

  const cargarEmpleados = useCallback(async () => {
    setCargandoEmpleados(true);
    setErrorEmpleados(null);
    try {
      const lista = await obtenerEmpleados();
      setEmpleados(lista);
    } catch (err) {
      setErrorEmpleados(err instanceof Error ? err.message : t('asi.cob.errCargarEmpleados'));
    } finally {
      setCargandoEmpleados(false);
    }
  }, [t]);

  useEffect(() => {
    void cargarEmpleados();
  }, [cargarEmpleados]);

  // ── Cargar saldo cuando cambia el empleado seleccionado ──────────────────

  useEffect(() => {
    if (!empleadoSeleccionado) {
      setSaldo(null);
      setErrorSaldo(null);
      return;
    }

    let cancelado = false;
    const cargar = async () => {
      setCargandoSaldo(true);
      setErrorSaldo(null);
      try {
        const datos = await obtenerSaldo(empleadoSeleccionado);
        if (!cancelado) setSaldo(datos);
      } catch (err) {
        if (!cancelado) {
          setErrorSaldo(
            err instanceof Error ? err.message : t('asi.cob.errSaldo'),
          );
          setSaldo(null);
        }
      } finally {
        if (!cancelado) setCargandoSaldo(false);
      }
    };
    void cargar();

    return () => {
      cancelado = true;
    };
  }, [empleadoSeleccionado, t]);

  // ── Cargar lista de cobros ────────────────────────────────────────────────

  const cargarCobros = useCallback(async (estado?: EstadoCobro | '') => {
    setCargandoCobros(true);
    setErrorCobros(null);
    try {
      const lista = await obtenerCobros(estado ? { estado } : undefined);
      setCobros(lista);
    } catch (err) {
      setErrorCobros(
        err instanceof Error ? err.message : t('asi.cob.errCargarLista'),
      );
    } finally {
      setCargandoCobros(false);
    }
  }, [t]);

  useEffect(() => {
    void cargarCobros(filtroEstado);
  }, [cargarCobros, filtroEstado]);

  // ── Enviar solicitud ──────────────────────────────────────────────────────

  const enviarSolicitud = async () => {
    if (!empleadoSeleccionado || !monto) return;

    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      setErrorSolicitud(t('asi.cob.errMontoValido'));
      return;
    }

    setEnviandoSolicitud(true);
    setErrorSolicitud(null);
    setExitoSolicitud(null);

    try {
      await crearSolicitudCobro({ empleadoId: empleadoSeleccionado, monto: montoNum });
      setExitoSolicitud(t('asi.cob.exitoSolicitud'));
      setMonto('');

      // Refrescar saldo y lista tras solicitar
      const [saldoActualizado] = await Promise.all([
        obtenerSaldo(empleadoSeleccionado),
        cargarCobros(filtroEstado),
      ]);
      setSaldo(saldoActualizado);
    } catch (err) {
      setErrorSolicitud(
        err instanceof Error ? err.message : t('asi.cob.errEnviar'),
      );
    } finally {
      setEnviandoSolicitud(false);
    }
  };

  // ── Acción: aprobar ───────────────────────────────────────────────────────

  const manejarAprobar = async (cobro: SolicitudCobro) => {
    setProcesando((prev) => new Set(prev).add(cobro.id));
    setErrorAccion(null);
    try {
      const actualizado = await aprobarCobro(cobro.id);
      setCobros((prev) => prev.map((c) => (c.id === actualizado.id ? actualizado : c)));
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : t('asi.cob.errAprobar'));
    } finally {
      setProcesando((prev) => {
        const sig = new Set(prev);
        sig.delete(cobro.id);
        return sig;
      });
    }
  };

  // ── Acción: rechazar (desde modal) ────────────────────────────────────────

  const manejarRechazado = (cobroActualizado: SolicitudCobro) => {
    setCobros((prev) =>
      prev.map((c) => (c.id === cobroActualizado.id ? cobroActualizado : c)),
    );
    setCobroARechazar(null);
  };

  // ── Acción: marcar pagado ─────────────────────────────────────────────────

  const manejarPagar = async (cobro: SolicitudCobro) => {
    setProcesando((prev) => new Set(prev).add(cobro.id));
    setErrorAccion(null);
    try {
      const actualizado = await pagarCobro(cobro.id);
      setCobros((prev) => prev.map((c) => (c.id === actualizado.id ? actualizado : c)));

      // Refrescar saldo si el empleado pagado es el que está seleccionado
      if (empleadoSeleccionado === cobro.empleadoId) {
        const saldoActualizado = await obtenerSaldo(empleadoSeleccionado);
        setSaldo(saldoActualizado);
      }
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : t('asi.cob.errPagar'));
    } finally {
      setProcesando((prev) => {
        const sig = new Set(prev);
        sig.delete(cobro.id);
        return sig;
      });
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        {/* Encabezado */}
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>{t('asi.cob.titulo')}</h1>
            <p className={styles.subtitulo}>
              {t('asi.cob.subtitulo')}
            </p>
          </div>
        </div>

        {/* Cuadrícula: A (solicitud) + B (lista) */}
        <div className={styles.cuadricula}>
          {/* ── Sección A: Solicitud del empleado ── */}
          <div className={styles.tarjeta}>
            <div className={styles.cabeceraTarjeta}>
              <h2 className={styles.tituloTarjeta}>{t('asi.cob.nuevaSolicitud')}</h2>
            </div>
            <div className={styles.cuerpoTarjeta}>
              {/* Selector de empleado */}
              <div className={styles.grupoFormulario}>
                <label htmlFor="selector-empleado" className={styles.etiqueta}>
                  {t('asi.cob.empleado')}
                </label>
                <select
                  id="selector-empleado"
                  className={styles.selectEmpleado}
                  value={empleadoSeleccionado}
                  onChange={(e) => {
                    setEmpleadoSeleccionado(e.target.value);
                    setSaldo(null);
                    setErrorSolicitud(null);
                    setExitoSolicitud(null);
                    setMonto('');
                  }}
                  disabled={cargandoEmpleados}
                >
                  <option value="">
                    {cargandoEmpleados ? t('asi.cob.cargandoEmpleados') : t('asi.cob.selEmpleado')}
                  </option>
                  {empleados.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.numero} — {emp.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Error de carga de empleados + reintento (mismo patrón que errorCobros) */}
              {errorEmpleados && (
                <div className={styles.errorCarga}>
                  <span>{errorEmpleados}</span>
                  <Boton
                    variante="secundario"
                    onClick={() => { void cargarEmpleados(); }}
                    disabled={cargandoEmpleados}
                  >
                    {t('asi.reintentar')}
                  </Boton>
                </div>
              )}

              {/* Bloque de saldo */}
              {empleadoSeleccionado && (
                <>
                  {cargandoSaldo && (
                    <p className={styles.saldoCargando}>{t('asi.cob.consultandoSaldo')}</p>
                  )}
                  {errorSaldo && (
                    <div className={styles.mensajeError}>{errorSaldo}</div>
                  )}
                  {!cargandoSaldo && !errorSaldo && saldo && (
                    <div className={styles.bloqueSaldo}>
                      <div className={styles.saldoLinea}>
                        {t('asi.cob.saldoAcumulado')}{' '}
                        <span className={styles.saldoDestacado}>
                          {formatearDinero(saldo.saldo)}
                        </span>
                      </div>
                      <div className={styles.saldoLinea}>
                        {t('asi.cob.porcentajeCobrable')}{' '}
                        <strong>{saldo.porcentajeCobrable}%</strong>
                      </div>
                      <div className={styles.saldoLinea}>
                        {t('asi.cob.disponible')}{' '}
                        <span className={styles.disponibleDestacado}>
                          {formatearDinero(saldo.disponible)}
                        </span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Monto a solicitar */}
              {empleadoSeleccionado && saldo && !cargandoSaldo && (
                <div className={styles.grupoFormulario}>
                  <label htmlFor="monto-solicitud" className={styles.etiqueta}>
                    {t('asi.cob.montoSolicitar')}
                  </label>
                  <input
                    id="monto-solicitud"
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={saldo.disponible}
                    className={styles.inputMonto}
                    placeholder={t('asi.cob.montoMax', { max: formatearDinero(saldo.disponible) })}
                    value={monto}
                    onChange={(e) => {
                      setMonto(e.target.value);
                      setErrorSolicitud(null);
                      setExitoSolicitud(null);
                    }}
                    disabled={enviandoSolicitud}
                  />
                </div>
              )}

              {/* Mensajes de error/éxito de la solicitud */}
              {errorSolicitud && (
                <div className={styles.mensajeError}>{errorSolicitud}</div>
              )}
              {exitoSolicitud && (
                <div className={styles.mensajeExito}>{exitoSolicitud}</div>
              )}

              {/* Botón solicitar */}
              {empleadoSeleccionado && saldo && !cargandoSaldo && (
                <Boton
                  variante="primario"
                  onClick={() => { void enviarSolicitud(); }}
                  cargando={enviandoSolicitud}
                  disabled={!monto || parseFloat(monto) <= 0}
                  completo
                >
                  {t('asi.cob.solicitarAdelanto')}
                </Boton>
              )}
            </div>
          </div>

          {/* ── Sección B: Lista y gestión ── */}
          <div className={styles.tarjeta}>
            <div className={styles.cabeceraTarjeta}>
              <h2 className={styles.tituloTarjeta}>{t('asi.cob.solicitudesTitulo')}</h2>
            </div>

            {/* Filtro por estado */}
            <div className={styles.filtroCobros}>
              <div className={styles.grupoFiltro}>
                <label htmlFor="filtro-estado" className={styles.etiquetaFiltro}>
                  {t('asi.cob.estadoLabel')}
                </label>
                <select
                  id="filtro-estado"
                  className={styles.selectFiltro}
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value as EstadoCobro | '')}
                >
                  {OPCIONES_ESTADO.map((op) => (
                    <option key={op.valor} value={op.valor}>
                      {t(op.etiquetaKey)}
                    </option>
                  ))}
                </select>
              </div>
              <Boton
                variante="secundario"
                onClick={() => { void cargarCobros(filtroEstado); }}
                disabled={cargandoCobros}
              >
                {t('comun.actualizar')}
              </Boton>
            </div>

            {/* Error de acción (aprobar/pagar) */}
            {errorAccion && (
              <div className={styles.errorCarga}>
                <span>{errorAccion}</span>
              </div>
            )}

            {/* Contenido de la lista */}
            {errorCobros && (
              <div className={styles.errorCarga}>
                <span>{errorCobros}</span>
                <Boton
                  variante="secundario"
                  onClick={() => { void cargarCobros(filtroEstado); }}
                >
                  {t('asi.reintentar')}
                </Boton>
              </div>
            )}

            {!errorCobros && cargandoCobros && (
              <p className={styles.estadoCarga}>{t('asi.cob.cargandoLista')}</p>
            )}

            {!errorCobros && !cargandoCobros && cobros.length === 0 && (
              <p className={styles.estadoVacio}>
                {filtroEstado
                  ? t('asi.cob.vacioFiltrado', { estado: t(`asi.estCobro.${filtroEstado}`) })
                  : t('asi.cob.vacio')}
              </p>
            )}

            {!errorCobros && !cargandoCobros && cobros.length > 0 && (
              <div className={styles.listaCobros}>
                {cobros.map((cobro) => {
                  const enProceso = procesando.has(cobro.id);
                  return (
                    <div key={cobro.id} className={styles.itemCobro}>
                      {/* Info de la solicitud */}
                      <div className={styles.infoCobro}>
                        <div className={styles.encabezadoCobro}>
                          <span className={styles.nombreEmpleado}>
                            {cobro.empleado.nombre}
                          </span>
                          <span className={styles.numeroEmpleado}>
                            {cobro.empleado.numero}
                          </span>
                          <span className={styles.montoCobro}>
                            {formatearDinero(cobro.monto)}
                          </span>
                          <span
                            className={`${styles.badge} ${CLASE_ESTADO[cobro.estado]}`}
                          >
                            {t(`asi.estCobro.${cobro.estado}`)}
                          </span>
                        </div>
                        <div className={styles.detallesCobro}>
                          <span>{t('asi.cob.creada', { fecha: formatearMomento(cobro.creadoEn) })}</span>
                          {cobro.resueltoEn && (
                            <span>{t('asi.cob.resuelta', { fecha: formatearMomento(cobro.resueltoEn) })}</span>
                          )}
                          {cobro.pagadoEn && (
                            <span>{t('asi.cob.pagada', { fecha: formatearMomento(cobro.pagadoEn) })}</span>
                          )}
                        </div>
                      </div>

                      {/* Botones de acción por estado */}
                      <div className={styles.accionesCobro}>
                        {/* Pendiente → Aprobar + Rechazar (supervisor/admin) */}
                        {cobro.estado === 'pendiente' && esSupervisorOAdmin && (
                          <>
                            <button
                              type="button"
                              className={styles.botonAprobar}
                              onClick={() => { void manejarAprobar(cobro); }}
                              disabled={enProceso}
                            >
                              {enProceso ? (
                                <span className={styles.spinner} />
                              ) : (
                                t('asi.cob.aprobar')
                              )}
                            </button>
                            <button
                              type="button"
                              className={styles.botonRechazar}
                              onClick={() => setCobroARechazar(cobro)}
                              disabled={enProceso}
                            >
                              {t('asi.cob.rechazar')}
                            </button>
                          </>
                        )}

                        {/* Aprobada → Marcar pagado (solo admin) */}
                        {cobro.estado === 'aprobada' && esAdmin && (
                          <button
                            type="button"
                            className={styles.botonPagar}
                            onClick={() => { void manejarPagar(cobro); }}
                            disabled={enProceso}
                          >
                            {enProceso ? (
                              <span className={styles.spinner} />
                            ) : (
                              t('asi.cob.marcarPagado')
                            )}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de motivo de rechazo */}
      {cobroARechazar && (
        <ModalRechazo
          cobro={cobroARechazar}
          alCerrar={() => setCobroARechazar(null)}
          alRechazar={manejarRechazado}
        />
      )}
    </LayoutPrincipal>
  );
}
