/**
 * Cola de revisión de fichajes de excepción — ruta PROTEGIDA /asistencia/revision.
 *
 * Solo accesible por supervisor o administrador (el backend lo valida).
 * Muestra los fichajes de excepción pendientes de revisión y permite
 * validarlos o rechazarlos uno a uno.
 *
 * Rutas de API utilizadas:
 *   GET  /fichajes/cola-revision  → lista de fichajes pendientes
 *   POST /revisiones              → validar o rechazar un fichaje
 */

import { useState, useEffect, useCallback } from 'react';
import { NavLink, Link } from 'react-router';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { obtenerColaRevision, revisarFichaje } from './servicioRevision';
import type { FichajeEnCola, TipoFichaje, MecanismoExcepcion } from './tipos';
import styles from './PantallaRevision.module.css';

// ── Constantes de presentación ─────────────────────────────────────────────

const ETIQUETA_TIPO: Record<TipoFichaje, string> = {
  entrada: 'Entrada',
  salida_comida: 'Salida comida',
  entrada_comida: 'Vuelta de comida',
  salida: 'Salida',
};

const CLASE_TIPO: Record<TipoFichaje, string> = {
  entrada: styles.tipoEntrada,
  salida_comida: styles.tipoSalidaComida,
  entrada_comida: styles.tipoEntradaComida,
  salida: styles.tipoSalida,
};

const ETIQUETA_MECANISMO: Record<MecanismoExcepcion, string> = {
  pin: 'Excepción por PIN',
  supervisor: 'Excepción por supervisor',
};

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

// ── Componente principal ───────────────────────────────────────────────────

export function PantallaRevision() {
  const [cola, setCola] = useState<FichajeEnCola[]>([]);
  const [cargando, setCargando] = useState(false);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Estado del modal de rechazo
  const [fichajeARechazar, setFichajeARechazar] = useState<FichajeEnCola | null>(null);
  const [motivoRechazo, setMotivoRechazo] = useState('');
  const [enviandoRevision, setEnviandoRevision] = useState(false);
  const [errorRevision, setErrorRevision] = useState<string | null>(null);

  // IDs en proceso de validación (para deshabilitar botones)
  const [procesando, setProcesando] = useState<Set<string>>(new Set());

  // ── Cargar cola ──────────────────────────────────────────────────────────

  const cargarCola = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const lista = await obtenerColaRevision();
      setCola(lista);
    } catch (err) {
      setErrorCarga(
        err instanceof Error ? err.message : 'Error al cargar la cola de revisión.',
      );
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargarCola();
  }, [cargarCola]);

  // ── Validar un fichaje (sin diálogo) ─────────────────────────────────────

  const validarFichaje = async (fichaje: FichajeEnCola) => {
    setProcesando((prev) => new Set(prev).add(fichaje.id));
    setErrorRevision(null);
    try {
      await revisarFichaje({ fichajeId: fichaje.id, valido: true });
      // Quitar de la cola localmente (evita un reload completo)
      setCola((prev) => prev.filter((f) => f.id !== fichaje.id));
    } catch (err) {
      setErrorRevision(
        err instanceof Error ? err.message : 'Error al validar el fichaje.',
      );
    } finally {
      setProcesando((prev) => {
        const siguiente = new Set(prev);
        siguiente.delete(fichaje.id);
        return siguiente;
      });
    }
  };

  // ── Abrir modal de rechazo ────────────────────────────────────────────────

  const abrirModalRechazo = (fichaje: FichajeEnCola) => {
    setFichajeARechazar(fichaje);
    setMotivoRechazo('');
    setErrorRevision(null);
  };

  const cerrarModalRechazo = () => {
    setFichajeARechazar(null);
    setMotivoRechazo('');
    setErrorRevision(null);
  };

  // ── Confirmar rechazo desde el modal ─────────────────────────────────────

  const confirmarRechazo = async () => {
    if (!fichajeARechazar) return;

    setEnviandoRevision(true);
    setErrorRevision(null);
    try {
      await revisarFichaje({
        fichajeId: fichajeARechazar.id,
        valido: false,
        motivo: motivoRechazo.trim() || undefined,
      });
      setCola((prev) => prev.filter((f) => f.id !== fichajeARechazar.id));
      cerrarModalRechazo();
    } catch (err) {
      setErrorRevision(
        err instanceof Error ? err.message : 'Error al rechazar el fichaje.',
      );
    } finally {
      setEnviandoRevision(false);
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
          <Link to="/kiosco" className={styles.enlaceExterno} target="_blank" rel="noopener noreferrer">
            Abrir kiosco
          </Link>
        </nav>

        {/* Encabezado */}
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>Cola de revisión</h1>
            <p className={styles.subtitulo}>
              Fichajes de excepción pendientes de aprobación
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {cola.length > 0 && (
              <span className={styles.badgePendientes}>
                {cola.length} pendiente{cola.length !== 1 ? 's' : ''}
              </span>
            )}
            <Boton
              variante="secundario"
              onClick={() => { void cargarCola(); }}
              disabled={cargando}
            >
              Actualizar
            </Boton>
          </div>
        </div>

        {/* Error de revisión (fuera del modal) */}
        {errorRevision && !fichajeARechazar && (
          <div className={styles.errorCarga}>
            <span>{errorRevision}</span>
          </div>
        )}

        {/* Tabla / lista */}
        <div className={styles.tarjeta}>
          {errorCarga && (
            <div className={styles.errorCarga}>
              <span>{errorCarga}</span>
              <Boton variante="secundario" onClick={() => { void cargarCola(); }}>
                Reintentar
              </Boton>
            </div>
          )}

          {!errorCarga && cargando && (
            <p className={styles.estadoCarga}>Cargando cola de revisión…</p>
          )}

          {!errorCarga && !cargando && cola.length === 0 && (
            <div className={styles.estadoVacio}>
              <span className={styles.iconoVacio}>✅</span>
              <p>No hay fichajes de excepción pendientes de revisión.</p>
            </div>
          )}

          {!errorCarga && !cargando && cola.length > 0 && (
            <div className={styles.listaFichajes}>
              {cola.map((fichaje) => {
                const enProceso = procesando.has(fichaje.id);
                return (
                  <div key={fichaje.id} className={styles.fichajeItem}>
                    {/* Información del fichaje */}
                    <div className={styles.infoFichaje}>
                      <div className={styles.encabezadoFichaje}>
                        <span className={styles.nombreEmpleado}>
                          {fichaje.empleado.nombre}
                        </span>
                        <span className={styles.numeroEmpleado}>
                          {fichaje.empleado.numero}
                        </span>
                        <span
                          className={[
                            styles.badgeTipo,
                            CLASE_TIPO[fichaje.tipo],
                          ].join(' ')}
                        >
                          {ETIQUETA_TIPO[fichaje.tipo]}
                        </span>
                      </div>

                      <div className={styles.detallesFichaje}>
                        <span className={styles.detalleItem}>
                          Kiosco: {fichaje.kiosco.nombre}
                        </span>
                        <span className={styles.detalleItem}>
                          {formatearMomento(fichaje.momento)}
                        </span>
                        <span className={styles.badgeMecanismo}>
                          {ETIQUETA_MECANISMO[fichaje.mecanismoExcepcion]}
                        </span>
                      </div>
                    </div>

                    {/* Botones de acción */}
                    <div className={styles.accionesFichaje}>
                      <button
                        className={styles.botonValidar}
                        onClick={() => { void validarFichaje(fichaje); }}
                        disabled={enProceso}
                        type="button"
                      >
                        {enProceso ? <span className={styles.spinner} /> : 'Validar'}
                      </button>
                      <button
                        className={styles.botonRechazar}
                        onClick={() => abrirModalRechazo(fichaje)}
                        disabled={enProceso}
                        type="button"
                      >
                        Rechazar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Modal de motivo de rechazo */}
      {fichajeARechazar && (
        <div className={styles.fondoModal} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <h2 className={styles.tituloModal}>Rechazar fichaje</h2>
            <p className={styles.subtituloModal}>
              Empleado: <strong>{fichajeARechazar.empleado.nombre}</strong> —{' '}
              {ETIQUETA_TIPO[fichajeARechazar.tipo]} el{' '}
              {formatearMomento(fichajeARechazar.momento)}
            </p>

            <div>
              <label htmlFor="motivo-rechazo" className={styles.etiquetaModal}>
                Motivo del rechazo (opcional):
              </label>
              <textarea
                id="motivo-rechazo"
                className={styles.textareaModal}
                placeholder="Describa el motivo del rechazo…"
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                autoFocus
              />
            </div>

            {errorRevision && (
              <p style={{ color: '#b91c1c', fontSize: '0.9rem', margin: 0 }}>
                {errorRevision}
              </p>
            )}

            <div className={styles.botonesModal}>
              <Boton
                variante="secundario"
                onClick={cerrarModalRechazo}
                disabled={enviandoRevision}
              >
                Cancelar
              </Boton>
              <Boton
                variante="peligro"
                onClick={() => { void confirmarRechazo(); }}
                cargando={enviandoRevision}
              >
                Confirmar rechazo
              </Boton>
            </div>
          </div>
        </div>
      )}
    </LayoutPrincipal>
  );
}
