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
import { NavLink, Link } from 'react-router';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useAuth } from '../../core/auth/ContextoAuth';
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

const ETIQUETA_ESTADO: Record<EstadoCobro, string> = {
  pendiente: 'Pendiente',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  pagada: 'Pagada',
};

const CLASE_ESTADO: Record<EstadoCobro, string> = {
  pendiente: styles.badgePendiente,
  aprobada: styles.badgeAprobada,
  rechazada: styles.badgeRechazada,
  pagada: styles.badgePagada,
};

const OPCIONES_ESTADO: Array<{ valor: EstadoCobro | ''; etiqueta: string }> = [
  { valor: '', etiqueta: 'Todos los estados' },
  { valor: 'pendiente', etiqueta: 'Pendientes' },
  { valor: 'aprobada', etiqueta: 'Aprobadas' },
  { valor: 'rechazada', etiqueta: 'Rechazadas' },
  { valor: 'pagada', etiqueta: 'Pagadas' },
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
      setError(err instanceof Error ? err.message : 'Error al rechazar la solicitud.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className={styles.fondoModal} role="dialog" aria-modal="true">
      <div className={styles.modal}>
        <h2 className={styles.tituloModal}>Rechazar solicitud</h2>
        <p className={styles.subtituloModal}>
          Empleado: <strong>{cobro.empleado.nombre}</strong> —{' '}
          {formatearDinero(cobro.monto)}
        </p>

        <div>
          <label htmlFor="motivo-rechazo-cobro" className={styles.etiquetaModal}>
            Motivo del rechazo (opcional):
          </label>
          <textarea
            id="motivo-rechazo-cobro"
            className={styles.textareaModal}
            placeholder="Describa el motivo del rechazo…"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            autoFocus
          />
        </div>

        {error && (
          <p style={{ color: '#b91c1c', fontSize: '0.875rem', margin: 0 }}>{error}</p>
        )}

        <div className={styles.botonesModal}>
          <Boton variante="secundario" onClick={alCerrar} disabled={enviando}>
            Cancelar
          </Boton>
          <Boton
            variante="peligro"
            onClick={() => { void confirmar(); }}
            cargando={enviando}
          >
            Confirmar rechazo
          </Boton>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export function PantallaCobros() {
  const { usuario } = useAuth();
  const esSupervisorOAdmin =
    usuario?.rol === 'supervisor' || usuario?.rol === 'administrador';
  const esAdmin = usuario?.rol === 'administrador';

  // ── Estado: sección A — solicitud ────────────────────────────────────────

  const [empleados, setEmpleados] = useState<EmpleadoResumido[]>([]);
  const [cargandoEmpleados, setCargandoEmpleados] = useState(false);

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

  // ── Carga inicial: empleados ──────────────────────────────────────────────

  useEffect(() => {
    const cargar = async () => {
      setCargandoEmpleados(true);
      try {
        const lista = await obtenerEmpleados();
        setEmpleados(lista);
      } catch {
        // Error no crítico — el selector quedará vacío
      } finally {
        setCargandoEmpleados(false);
      }
    };
    void cargar();
  }, []);

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
            err instanceof Error ? err.message : 'Error al obtener el saldo.',
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
  }, [empleadoSeleccionado]);

  // ── Cargar lista de cobros ────────────────────────────────────────────────

  const cargarCobros = useCallback(async (estado?: EstadoCobro | '') => {
    setCargandoCobros(true);
    setErrorCobros(null);
    try {
      const lista = await obtenerCobros(estado ? { estado } : undefined);
      setCobros(lista);
    } catch (err) {
      setErrorCobros(
        err instanceof Error ? err.message : 'Error al cargar las solicitudes.',
      );
    } finally {
      setCargandoCobros(false);
    }
  }, []);

  useEffect(() => {
    void cargarCobros(filtroEstado);
  }, [cargarCobros, filtroEstado]);

  // ── Enviar solicitud ──────────────────────────────────────────────────────

  const enviarSolicitud = async () => {
    if (!empleadoSeleccionado || !monto) return;

    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      setErrorSolicitud('Ingrese un monto válido mayor a cero.');
      return;
    }

    setEnviandoSolicitud(true);
    setErrorSolicitud(null);
    setExitoSolicitud(null);

    try {
      await crearSolicitudCobro({ empleadoId: empleadoSeleccionado, monto: montoNum });
      setExitoSolicitud('Solicitud enviada correctamente.');
      setMonto('');

      // Refrescar saldo y lista tras solicitar
      const [saldoActualizado] = await Promise.all([
        obtenerSaldo(empleadoSeleccionado),
        cargarCobros(filtroEstado),
      ]);
      setSaldo(saldoActualizado);
    } catch (err) {
      setErrorSolicitud(
        err instanceof Error ? err.message : 'Error al enviar la solicitud.',
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
      setErrorAccion(err instanceof Error ? err.message : 'Error al aprobar la solicitud.');
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
      setErrorAccion(err instanceof Error ? err.message : 'Error al marcar la solicitud como pagada.');
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
        {/* Barra de navegación de asistencia */}
        <nav className={styles.navAsistencia} aria-label="Módulos de asistencia">
          <NavLink
            to="/asistencia/revision"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            Cola de revisión
          </NavLink>
          <NavLink
            to="/asistencia/jornadas"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            Jornadas
          </NavLink>
          <NavLink
            to="/asistencia/cobros"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            Cobros
          </NavLink>
          <Link
            to="/kiosco"
            className={styles.enlaceExterno}
            target="_blank"
            rel="noopener noreferrer"
          >
            Abrir kiosco
          </Link>
        </nav>

        {/* Encabezado */}
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>Cobro anticipado de horas extra</h1>
            <p className={styles.subtitulo}>
              Solicita un adelanto o gestiona las solicitudes de tu equipo
            </p>
          </div>
        </div>

        {/* Cuadrícula: A (solicitud) + B (lista) */}
        <div className={styles.cuadricula}>
          {/* ── Sección A: Solicitud del empleado ── */}
          <div className={styles.tarjeta}>
            <div className={styles.cabeceraTarjeta}>
              <h2 className={styles.tituloTarjeta}>Nueva solicitud</h2>
            </div>
            <div className={styles.cuerpoTarjeta}>
              {/* Selector de empleado */}
              <div className={styles.grupoFormulario}>
                <label htmlFor="selector-empleado" className={styles.etiqueta}>
                  Empleado
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
                    {cargandoEmpleados ? 'Cargando empleados…' : '— Seleccione un empleado —'}
                  </option>
                  {empleados.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.numero} — {emp.nombre}
                    </option>
                  ))}
                </select>
              </div>

              {/* Bloque de saldo */}
              {empleadoSeleccionado && (
                <>
                  {cargandoSaldo && (
                    <p className={styles.saldoCargando}>Consultando saldo…</p>
                  )}
                  {errorSaldo && (
                    <div className={styles.mensajeError}>{errorSaldo}</div>
                  )}
                  {!cargandoSaldo && !errorSaldo && saldo && (
                    <div className={styles.bloqueSaldo}>
                      <div className={styles.saldoLinea}>
                        Saldo acumulado:{' '}
                        <span className={styles.saldoDestacado}>
                          {formatearDinero(saldo.saldo)}
                        </span>
                      </div>
                      <div className={styles.saldoLinea}>
                        % cobrable:{' '}
                        <strong>{saldo.porcentajeCobrable}%</strong>
                      </div>
                      <div className={styles.saldoLinea}>
                        Disponible para adelanto:{' '}
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
                    Monto a solicitar (B/.)
                  </label>
                  <input
                    id="monto-solicitud"
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={saldo.disponible}
                    className={styles.inputMonto}
                    placeholder={`Máx. ${formatearDinero(saldo.disponible)}`}
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
                  Solicitar adelanto
                </Boton>
              )}
            </div>
          </div>

          {/* ── Sección B: Lista y gestión ── */}
          <div className={styles.tarjeta}>
            <div className={styles.cabeceraTarjeta}>
              <h2 className={styles.tituloTarjeta}>Solicitudes de cobro</h2>
            </div>

            {/* Filtro por estado */}
            <div className={styles.filtroCobros}>
              <div className={styles.grupoFiltro}>
                <label htmlFor="filtro-estado" className={styles.etiquetaFiltro}>
                  Estado
                </label>
                <select
                  id="filtro-estado"
                  className={styles.selectFiltro}
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value as EstadoCobro | '')}
                >
                  {OPCIONES_ESTADO.map((op) => (
                    <option key={op.valor} value={op.valor}>
                      {op.etiqueta}
                    </option>
                  ))}
                </select>
              </div>
              <Boton
                variante="secundario"
                onClick={() => { void cargarCobros(filtroEstado); }}
                disabled={cargandoCobros}
              >
                Actualizar
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
                  Reintentar
                </Boton>
              </div>
            )}

            {!errorCobros && cargandoCobros && (
              <p className={styles.estadoCarga}>Cargando solicitudes…</p>
            )}

            {!errorCobros && !cargandoCobros && cobros.length === 0 && (
              <p className={styles.estadoVacio}>
                No hay solicitudes{filtroEstado ? ` con estado "${ETIQUETA_ESTADO[filtroEstado]}"` : ''}.
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
                            {ETIQUETA_ESTADO[cobro.estado]}
                          </span>
                        </div>
                        <div className={styles.detallesCobro}>
                          <span>Creada: {formatearMomento(cobro.creadoEn)}</span>
                          {cobro.resueltoEn && (
                            <span>Resuelta: {formatearMomento(cobro.resueltoEn)}</span>
                          )}
                          {cobro.pagadoEn && (
                            <span>Pagada: {formatearMomento(cobro.pagadoEn)}</span>
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
                                'Aprobar'
                              )}
                            </button>
                            <button
                              type="button"
                              className={styles.botonRechazar}
                              onClick={() => setCobroARechazar(cobro)}
                              disabled={enProceso}
                            >
                              Rechazar
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
                              'Marcar pagado'
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
