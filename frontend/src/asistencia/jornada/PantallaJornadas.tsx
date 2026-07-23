/**
 * Pantalla de consulta y corrección de jornadas — ruta PROTEGIDA /asistencia/jornadas.
 *
 * Accesible por supervisor o administrador (el backend lo valida).
 * Permite al jefe:
 *  1. Consultar jornadas por período (desde/hasta) y filtrar por empleado (client-side).
 *  2. Ver detalles: horas trabajadas, clasificación, extra, monto, estado y festivo.
 *  3. Resaltar anomalías y mostrar su detalle.
 *  4. Corregir una jornada mediante un modal (POST /jornadas/correccion).
 *  5. (Admin) Disparar el barrido de fichajes huérfanos.
 *
 * Rutas de API:
 *   GET  /jornadas?desde=&hasta=     → listado de jornadas
 *   POST /jornadas/correccion        → corrección de una jornada
 *   POST /jornadas/barrer-huerfanos  → barrido de huérfanos (admin)
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useModal } from '../../core/ui/useModal';
import { useAuth } from '../../core/auth/ContextoAuth';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { obtenerJornadas, corregirJornada, barrerHuerfanos } from './servicioJornada';
import {
  minutosAHorasMinutos,
  formatearDinero,
  formatearFecha,
  primerDiaDelMes,
  fechaHoy,
} from './utilidades';
import type { Jornada, ClasificacionJornada, EstadoJornada } from './tipos';
import styles from './PantallaJornadas.module.css';

// ── Constantes de presentación ─────────────────────────────────────────────

const CLASE_CLASIFICACION: Record<NonNullable<ClasificacionJornada>, string> = {
  diurna: styles.clasificacionDiurna,
  nocturna: styles.clasificacionNocturna,
  mixta: styles.clasificacionMixta,
};

const CLASE_ESTADO: Record<EstadoJornada, string> = {
  calculada: styles.estadoCalculada,
  anomalia: styles.estadoAnomalia,
  corregida: styles.estadoCorregida,
};

// ── Componente del modal de corrección ────────────────────────────────────

interface PropiedadesModalCorreccion {
  jornada: Jornada;
  alCerrar: () => void;
  alCorregir: (jornadaActualizada: Jornada) => void;
}

function ModalCorreccion({ jornada, alCerrar, alCorregir }: PropiedadesModalCorreccion) {
  const { t } = useTraduccion();
  const [motivo, setMotivo] = useState('');
  const [minutosTrabajados, setMinutosTrabajados] = useState('');
  const [minutosExtra, setMinutosExtra] = useState('');
  const [montoExtra, setMontoExtra] = useState('');
  const [resolverAnomalia, setResolverAnomalia] = useState(jornada.anomalia);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Accesibilidad compartida del modal; mientras envía NO se cierra.
  const refModal = useModal<HTMLDivElement>(() => {
    if (!enviando) alCerrar();
  });

  const puedeEnviar = motivo.trim().length > 0;

  const manejarEnvio = async () => {
    if (!puedeEnviar) return;
    setEnviando(true);
    setError(null);
    try {
      const jornadaActualizada = await corregirJornada({
        jornadaId: jornada.id,
        motivo: motivo.trim(),
        minutosTrabajados: minutosTrabajados !== '' ? Number(minutosTrabajados) : undefined,
        minutosExtra: minutosExtra !== '' ? Number(minutosExtra) : undefined,
        montoExtra: montoExtra !== '' ? Number(montoExtra) : undefined,
        resolverAnomalia: resolverAnomalia || undefined,
      });
      alCorregir(jornadaActualizada);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('asi.jor.errCorreccion'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div ref={refModal} className={styles.fondoModal} role="dialog" aria-modal="true" aria-labelledby="titulo-modal-correccion">
      <div className={styles.modal}>
        <h2 className={styles.tituloModal} id="titulo-modal-correccion">
          {t('asi.jor.corregirTitulo')}
        </h2>
        <p className={styles.subtituloModal}>
          {t('asi.jor.modalEmpleadoLabel')}{' '}
          <strong>
            {jornada.empleado.nombre} ({jornada.empleado.numero})
          </strong>{' '}
          {t('asi.jor.modalFechaLabel')} <strong>{formatearFecha(jornada.fecha)}</strong>
        </p>

        <hr className={styles.separador} />

        <div className={styles.camposModal}>
          {/* Motivo — obligatorio */}
          <div className={styles.grupoModal}>
            <label htmlFor="correccion-motivo" className={styles.etiquetaModal}>
              {t('asi.jor.motivo')}
            </label>
            <textarea
              id="correccion-motivo"
              className={styles.textareaModal}
              placeholder={t('asi.jor.motivoPlaceholder')}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              autoFocus
            />
          </div>

          {/* Minutos trabajados — opcional */}
          <div className={styles.grupoModal}>
            <label htmlFor="correccion-minutos-trabajados" className={styles.etiquetaModalOpcional}>
              {t('asi.jor.minutosTrabajados')}
            </label>
            <input
              id="correccion-minutos-trabajados"
              type="number"
              min="0"
              className={styles.inputModal}
              placeholder={t('asi.jor.actual', { valor: minutosAHorasMinutos(jornada.minutosTrabajados) })}
              value={minutosTrabajados}
              onChange={(e) => setMinutosTrabajados(e.target.value)}
            />
          </div>

          {/* Minutos extra — opcional */}
          <div className={styles.grupoModal}>
            <label htmlFor="correccion-minutos-extra" className={styles.etiquetaModalOpcional}>
              {t('asi.jor.minutosExtra')}
            </label>
            <input
              id="correccion-minutos-extra"
              type="number"
              min="0"
              className={styles.inputModal}
              placeholder={t('asi.jor.actual', { valor: minutosAHorasMinutos(jornada.minutosExtra) })}
              value={minutosExtra}
              onChange={(e) => setMinutosExtra(e.target.value)}
            />
          </div>

          {/* Monto extra — opcional */}
          <div className={styles.grupoModal}>
            <label htmlFor="correccion-monto-extra" className={styles.etiquetaModalOpcional}>
              {t('asi.jor.montoExtra')}
            </label>
            <input
              id="correccion-monto-extra"
              type="number"
              min="0"
              step="0.01"
              className={styles.inputModal}
              placeholder={t('asi.jor.actual', { valor: formatearDinero(jornada.montoExtra) })}
              value={montoExtra}
              onChange={(e) => setMontoExtra(e.target.value)}
            />
          </div>

          {/* Resolver anomalía — solo si la jornada tiene anomalía */}
          {jornada.anomalia && (
            <label className={styles.grupoCheckbox}>
              <input
                type="checkbox"
                checked={resolverAnomalia}
                onChange={(e) => setResolverAnomalia(e.target.checked)}
              />
              {t('asi.jor.resolverAnomalia')}
            </label>
          )}
        </div>

        {error && <div className={styles.errorModal}>{error}</div>}

        <div className={styles.botonesModal}>
          <Boton variante="secundario" onClick={alCerrar} disabled={enviando}>
            {t('comun.cancelar')}
          </Boton>
          <Boton
            variante="primario"
            onClick={() => { void manejarEnvio(); }}
            cargando={enviando}
            disabled={!puedeEnviar}
          >
            {t('asi.jor.guardarCorreccion')}
          </Boton>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export function PantallaJornadas() {
  const { usuario } = useAuth();
  const { t } = useTraduccion();
  const esAdmin = usuario?.rol === 'administrador';

  // Montar tema oscuro mientras esta pantalla está visible (con cleanup al salir).
  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', 'dark');
    return () => {
      if (previo === null) raiz.removeAttribute('data-theme');
      else raiz.setAttribute('data-theme', previo);
    };
  }, []);

  // Lista de jornadas
  const [jornadas, setJornadas] = useState<Jornada[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Filtros de período
  const [desde, setDesde] = useState(primerDiaDelMes());
  const [hasta, setHasta] = useState(fechaHoy());

  // Filtro de texto client-side
  const [busqueda, setBusqueda] = useState('');

  // Estado del modal de corrección
  const [jornadaACorregir, setJornadaACorregir] = useState<Jornada | null>(null);

  // Estado del barrido de huérfanos
  const [barriendoHuerfanos, setBarriendoHuerfanos] = useState(false);
  const [mensajeBarrido, setMensajeBarrido] = useState<string | null>(null);

  // ── Cargar jornadas ──────────────────────────────────────────────────────

  const cargarJornadas = useCallback(async () => {
    if (!desde || !hasta) return;
    setCargando(true);
    setErrorCarga(null);
    setMensajeBarrido(null);
    try {
      const lista = await obtenerJornadas({ desde, hasta });
      setJornadas(lista);
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : t('asi.jor.errCargar'));
    } finally {
      setCargando(false);
    }
  }, [desde, hasta, t]);

  useEffect(() => {
    void cargarJornadas();
  }, [cargarJornadas]);

  // ── Filtro client-side por empleado ─────────────────────────────────────

  const jornadasFiltradas = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    if (!termino) return jornadas;
    return jornadas.filter(
      (j) =>
        j.empleado.nombre.toLowerCase().includes(termino) ||
        j.empleado.numero.toLowerCase().includes(termino),
    );
  }, [jornadas, busqueda]);

  // ── Anomalías en el conjunto filtrado ───────────────────────────────────

  const cantidadAnomalias = jornadasFiltradas.filter((j) => j.anomalia).length;

  // ── Corregir jornada ─────────────────────────────────────────────────────

  const manejarCorreccion = (jornadaActualizada: Jornada) => {
    setJornadas((prev) =>
      prev.map((j) => (j.id === jornadaActualizada.id ? jornadaActualizada : j)),
    );
    setJornadaACorregir(null);
  };

  // ── Barrer huérfanos ─────────────────────────────────────────────────────

  const manejarBarridoHuerfanos = async () => {
    setBarriendoHuerfanos(true);
    setMensajeBarrido(null);
    try {
      const resultado = await barrerHuerfanos();
      setMensajeBarrido(
        resultado.marcadas === 0
          ? t('asi.jor.sinHuerfanos')
          : t('asi.jor.marcadosHuerfanos', {
              n: resultado.marcadas,
              unidad: t(resultado.marcadas !== 1 ? 'asi.jor.huerfanosPlural' : 'asi.jor.huerfanoSingular'),
            }),
      );
      // Recargar jornadas para reflejar los nuevos cambios
      void cargarJornadas();
    } catch (err) {
      setMensajeBarrido(
        t('asi.jor.errBarrido', { msg: err instanceof Error ? err.message : t('asi.jor.errBarridoDefault') }),
      );
    } finally {
      setBarriendoHuerfanos(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        {/* Encabezado */}
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>{t('nav.jornadas')}</h1>
            <p className={styles.subtitulo}>
              {t('asi.jor.subtitulo')}
            </p>
          </div>
          <div className={styles.barraAcciones}>
            {mensajeBarrido && (
              <span className={styles.mensajeBarrido}>{mensajeBarrido}</span>
            )}
            {esAdmin && (
              <Boton
                variante="secundario"
                onClick={() => { void manejarBarridoHuerfanos(); }}
                disabled={barriendoHuerfanos || cargando}
                cargando={barriendoHuerfanos}
              >
                {t('asi.jor.barrerHuerfanos')}
              </Boton>
            )}
            <Boton
              variante="secundario"
              onClick={() => { void cargarJornadas(); }}
              disabled={cargando || barriendoHuerfanos}
            >
              {t('comun.actualizar')}
            </Boton>
          </div>
        </div>

        {/* Filtros */}
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
            onClick={() => { void cargarJornadas(); }}
            disabled={!desde || !hasta || cargando}
          >
            {t('comun.filtrar')}
          </Boton>

          {/* Separador visual */}
          <div className={styles.grupoFiltroTexto}>
            <label className={styles.etiquetaFiltro} htmlFor="filtro-busqueda">
              {t('asi.jor.buscarEmpleado')}
            </label>
            <input
              id="filtro-busqueda"
              type="text"
              className={styles.inputFiltro}
              placeholder={t('asi.jor.buscarPlaceholder')}
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        {/* Resumen de anomalías */}
        {cantidadAnomalias > 0 && !cargando && (
          <div
            style={{
              background: 'var(--color-warning-bg)',
              border: '1.5px solid var(--color-warning)',
              borderRadius: '12px',
              padding: '0.75rem 1.25rem',
              color: 'var(--color-warning)',
              fontSize: '0.9375rem',
              fontWeight: 600,
            }}
          >
            {t('asi.jor.anomaliasResumen', {
              n: cantidadAnomalias,
              unidad: t(cantidadAnomalias !== 1 ? 'asi.jor.jornadasPlural' : 'asi.jor.jornadaSingular'),
            })}
          </div>
        )}

        {/* Tabla de jornadas */}
        <div className={styles.tarjeta}>
          {errorCarga && (
            <div className={styles.errorCarga}>
              <span>{errorCarga}</span>
              <Boton variante="secundario" onClick={() => { void cargarJornadas(); }}>
                {t('asi.reintentar')}
              </Boton>
            </div>
          )}

          {!errorCarga && cargando && (
            <p className={styles.estadoCarga}>{t('asi.jor.cargandoLista')}</p>
          )}

          {!errorCarga && !cargando && jornadasFiltradas.length === 0 && (
            <p className={styles.estadoVacio}>
              {jornadas.length === 0
                ? t('asi.jor.vacioSinJornadas')
                : t('asi.jor.vacioSinCoincidencias')}
            </p>
          )}

          {!errorCarga && !cargando && jornadasFiltradas.length > 0 && (
            <div className={styles.tablaContenedor}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>{t('asi.jor.thEmpleado')}</th>
                    <th>{t('asi.jor.thFecha')}</th>
                    <th>{t('asi.jor.thTrabajadas')}</th>
                    <th>{t('asi.jor.thClasificacion')}</th>
                    <th>{t('asi.jor.thExtra')}</th>
                    <th>{t('asi.jor.thMontoExtra')}</th>
                    <th>{t('asi.jor.thEstado')}</th>
                    <th>{t('asi.jor.thFestivo')}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {jornadasFiltradas.map((jornada) => (
                    <tr
                      key={jornada.id}
                      className={jornada.anomalia ? styles.filaAnomalia : undefined}
                    >
                      {/* Empleado */}
                      <td>
                        <span className={styles.empleadoNombre}>
                          {jornada.empleado.nombre}
                        </span>
                        <span className={styles.empleadoNumero}>
                          {jornada.empleado.numero}
                        </span>
                        {jornada.anomalia && jornada.detalleAnomalia && (
                          <span className={styles.detalleAnomalia}>
                            {jornada.detalleAnomalia}
                          </span>
                        )}
                      </td>

                      {/* Fecha */}
                      <td>{formatearFecha(jornada.fecha)}</td>

                      {/* Horas trabajadas */}
                      <td className={styles.horas}>
                        {minutosAHorasMinutos(jornada.minutosTrabajados)}
                      </td>

                      {/* Clasificación */}
                      <td>
                        {jornada.clasificacion ? (
                          <span
                            className={`${styles.badgeClasificacion} ${CLASE_CLASIFICACION[jornada.clasificacion]}`}
                          >
                            {t(`asi.clasif.${jornada.clasificacion}`)}
                          </span>
                        ) : (
                          <span className={`${styles.badgeClasificacion} ${styles.clasificacionNula}`}>
                            —
                          </span>
                        )}
                      </td>

                      {/* Minutos extra */}
                      <td className={styles.horas}>
                        {jornada.minutosExtra > 0
                          ? minutosAHorasMinutos(jornada.minutosExtra)
                          : '—'}
                      </td>

                      {/* Monto extra */}
                      <td className={styles.monto}>
                        {jornada.montoExtra > 0
                          ? formatearDinero(jornada.montoExtra)
                          : '—'}
                      </td>

                      {/* Estado */}
                      <td>
                        <span className={`${styles.badgeEstado} ${CLASE_ESTADO[jornada.estado]}`}>
                          {t(`asi.estJornada.${jornada.estado}`)}
                        </span>
                      </td>

                      {/* Festivo */}
                      <td>
                        {jornada.esFestivo && (
                          <span className={styles.badgeFestivo}>{t('asi.jor.festivo')}</span>
                        )}
                      </td>

                      {/* Acción */}
                      <td className={styles.celdaAccion}>
                        <button
                          type="button"
                          className={styles.botonCorregir}
                          onClick={() => setJornadaACorregir(jornada)}
                        >
                          {t('asi.jor.corregir')}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modal de corrección */}
      {jornadaACorregir && (
        <ModalCorreccion
          jornada={jornadaACorregir}
          alCerrar={() => setJornadaACorregir(null)}
          alCorregir={manejarCorreccion}
        />
      )}
    </LayoutPrincipal>
  );
}
