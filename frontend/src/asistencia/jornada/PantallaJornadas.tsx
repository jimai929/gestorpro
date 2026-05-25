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
import { NavLink, Link } from 'react-router';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useAuth } from '../../core/auth/ContextoAuth';
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

const ETIQUETA_CLASIFICACION: Record<NonNullable<ClasificacionJornada>, string> = {
  diurna: 'Diurna',
  nocturna: 'Nocturna',
  mixta: 'Mixta',
};

const CLASE_CLASIFICACION: Record<NonNullable<ClasificacionJornada>, string> = {
  diurna: styles.clasificacionDiurna,
  nocturna: styles.clasificacionNocturna,
  mixta: styles.clasificacionMixta,
};

const ETIQUETA_ESTADO: Record<EstadoJornada, string> = {
  calculada: 'Calculada',
  anomalia: 'Anomalía',
  corregida: 'Corregida',
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
  const [motivo, setMotivo] = useState('');
  const [minutosTrabajados, setMinutosTrabajados] = useState('');
  const [minutosExtra, setMinutosExtra] = useState('');
  const [montoExtra, setMontoExtra] = useState('');
  const [resolverAnomalia, setResolverAnomalia] = useState(jornada.anomalia);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(err instanceof Error ? err.message : 'Error al registrar la corrección.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className={styles.fondoModal} role="dialog" aria-modal="true" aria-labelledby="titulo-modal-correccion">
      <div className={styles.modal}>
        <h2 className={styles.tituloModal} id="titulo-modal-correccion">
          Corregir jornada
        </h2>
        <p className={styles.subtituloModal}>
          Empleado:{' '}
          <strong>
            {jornada.empleado.nombre} ({jornada.empleado.numero})
          </strong>{' '}
          — Fecha: <strong>{formatearFecha(jornada.fecha)}</strong>
        </p>

        <hr className={styles.separador} />

        <div className={styles.camposModal}>
          {/* Motivo — obligatorio */}
          <div className={styles.grupoModal}>
            <label htmlFor="correccion-motivo" className={styles.etiquetaModal}>
              Motivo de la corrección
            </label>
            <textarea
              id="correccion-motivo"
              className={styles.textareaModal}
              placeholder="Describa el motivo de la corrección…"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              autoFocus
            />
          </div>

          {/* Minutos trabajados — opcional */}
          <div className={styles.grupoModal}>
            <label htmlFor="correccion-minutos-trabajados" className={styles.etiquetaModalOpcional}>
              Minutos trabajados
            </label>
            <input
              id="correccion-minutos-trabajados"
              type="number"
              min="0"
              className={styles.inputModal}
              placeholder={`Actual: ${minutosAHorasMinutos(jornada.minutosTrabajados)}`}
              value={minutosTrabajados}
              onChange={(e) => setMinutosTrabajados(e.target.value)}
            />
          </div>

          {/* Minutos extra — opcional */}
          <div className={styles.grupoModal}>
            <label htmlFor="correccion-minutos-extra" className={styles.etiquetaModalOpcional}>
              Minutos extra
            </label>
            <input
              id="correccion-minutos-extra"
              type="number"
              min="0"
              className={styles.inputModal}
              placeholder={`Actual: ${minutosAHorasMinutos(jornada.minutosExtra)}`}
              value={minutosExtra}
              onChange={(e) => setMinutosExtra(e.target.value)}
            />
          </div>

          {/* Monto extra — opcional */}
          <div className={styles.grupoModal}>
            <label htmlFor="correccion-monto-extra" className={styles.etiquetaModalOpcional}>
              Monto extra (B/.)
            </label>
            <input
              id="correccion-monto-extra"
              type="number"
              min="0"
              step="0.01"
              className={styles.inputModal}
              placeholder={`Actual: ${formatearDinero(jornada.montoExtra)}`}
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
              Resolver anomalía (marcar como corregida)
            </label>
          )}
        </div>

        {error && <div className={styles.errorModal}>{error}</div>}

        <div className={styles.botonesModal}>
          <Boton variante="secundario" onClick={alCerrar} disabled={enviando}>
            Cancelar
          </Boton>
          <Boton
            variante="primario"
            onClick={() => { void manejarEnvio(); }}
            cargando={enviando}
            disabled={!puedeEnviar}
          >
            Guardar corrección
          </Boton>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ───────────────────────────────────────────────────

export function PantallaJornadas() {
  const { usuario } = useAuth();
  const esAdmin = usuario?.rol === 'administrador';

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
      setErrorCarga(err instanceof Error ? err.message : 'Error al cargar las jornadas.');
    } finally {
      setCargando(false);
    }
  }, [desde, hasta]);

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
          ? 'No se encontraron fichajes huérfanos.'
          : `Se marcaron ${resultado.marcadas} fichaje${resultado.marcadas !== 1 ? 's' : ''} huérfano${resultado.marcadas !== 1 ? 's' : ''}.`,
      );
      // Recargar jornadas para reflejar los nuevos cambios
      void cargarJornadas();
    } catch (err) {
      setMensajeBarrido(
        `Error: ${err instanceof Error ? err.message : 'No se pudo completar el barrido.'}`,
      );
    } finally {
      setBarriendoHuerfanos(false);
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
            <h1 className={styles.tituloPagina}>Jornadas</h1>
            <p className={styles.subtitulo}>
              Consulta y corrección de jornadas laborales
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
                Barrer huérfanos
              </Boton>
            )}
            <Boton
              variante="secundario"
              onClick={() => { void cargarJornadas(); }}
              disabled={cargando || barriendoHuerfanos}
            >
              Actualizar
            </Boton>
          </div>
        </div>

        {/* Filtros */}
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
            onClick={() => { void cargarJornadas(); }}
            disabled={!desde || !hasta || cargando}
          >
            Filtrar
          </Boton>

          {/* Separador visual */}
          <div className={styles.grupoFiltroTexto}>
            <label className={styles.etiquetaFiltro} htmlFor="filtro-busqueda">
              Buscar empleado
            </label>
            <input
              id="filtro-busqueda"
              type="text"
              className={styles.inputFiltro}
              placeholder="Número o nombre del empleado…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
        </div>

        {/* Resumen de anomalías */}
        {cantidadAnomalias > 0 && !cargando && (
          <div
            style={{
              background: '#fffbeb',
              border: '1.5px solid #fbbf24',
              borderRadius: '12px',
              padding: '0.75rem 1.25rem',
              color: '#92400e',
              fontSize: '0.9375rem',
              fontWeight: 600,
            }}
          >
            {cantidadAnomalias} jornada{cantidadAnomalias !== 1 ? 's' : ''} con anomalía en el período
          </div>
        )}

        {/* Tabla de jornadas */}
        <div className={styles.tarjeta}>
          {errorCarga && (
            <div className={styles.errorCarga}>
              <span>{errorCarga}</span>
              <Boton variante="secundario" onClick={() => { void cargarJornadas(); }}>
                Reintentar
              </Boton>
            </div>
          )}

          {!errorCarga && cargando && (
            <p className={styles.estadoCarga}>Cargando jornadas…</p>
          )}

          {!errorCarga && !cargando && jornadasFiltradas.length === 0 && (
            <p className={styles.estadoVacio}>
              {jornadas.length === 0
                ? 'No hay jornadas registradas en el período seleccionado.'
                : 'Ninguna jornada coincide con la búsqueda.'}
            </p>
          )}

          {!errorCarga && !cargando && jornadasFiltradas.length > 0 && (
            <div className={styles.tablaContenedor}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>Empleado</th>
                    <th>Fecha</th>
                    <th>Trabajadas</th>
                    <th>Clasificación</th>
                    <th>Extra</th>
                    <th>Monto extra</th>
                    <th>Estado</th>
                    <th>Festivo</th>
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
                            {ETIQUETA_CLASIFICACION[jornada.clasificacion]}
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
                          {ETIQUETA_ESTADO[jornada.estado]}
                        </span>
                      </td>

                      {/* Festivo */}
                      <td>
                        {jornada.esFestivo && (
                          <span className={styles.badgeFestivo}>Festivo</span>
                        )}
                      </td>

                      {/* Acción */}
                      <td className={styles.celdaAccion}>
                        <button
                          type="button"
                          className={styles.botonCorregir}
                          onClick={() => setJornadaACorregir(jornada)}
                        >
                          Corregir
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
