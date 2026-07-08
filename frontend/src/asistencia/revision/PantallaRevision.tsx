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
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { obtenerColaRevision, revisarFichaje } from './servicioRevision';
import type { FichajeEnCola, TipoFichaje } from './tipos';
import styles from './PantallaRevision.module.css';

// ── Constantes de presentación ─────────────────────────────────────────────

const CLASE_TIPO: Record<TipoFichaje, string> = {
  entrada: styles.tipoEntrada,
  salida_comida: styles.tipoSalidaComida,
  entrada_comida: styles.tipoEntradaComida,
  salida: styles.tipoSalida,
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
  const { t } = useTraduccion();
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

  // ── Tema oscuro (montaje con cleanup) ────────────────────────────────────
  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', 'dark');
    return () => {
      if (previo === null) raiz.removeAttribute('data-theme');
      else raiz.setAttribute('data-theme', previo);
    };
  }, []);

  // ── Cargar cola ──────────────────────────────────────────────────────────

  const cargarCola = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const lista = await obtenerColaRevision();
      setCola(lista);
    } catch (err) {
      setErrorCarga(
        err instanceof Error ? err.message : t('asi.rev.errCargar'),
      );
    } finally {
      setCargando(false);
    }
  }, [t]);

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
        err instanceof Error ? err.message : t('asi.rev.errValidar'),
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
        err instanceof Error ? err.message : t('asi.rev.errRechazar'),
      );
    } finally {
      setEnviandoRevision(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        {/* Encabezado */}
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>{t('nav.colaRevision')}</h1>
            <p className={styles.subtitulo}>
              {t('asi.rev.subtitulo')}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {cola.length > 0 && (
              <span className={styles.badgePendientes}>
                {t(cola.length !== 1 ? 'asi.rev.pendientes' : 'asi.rev.pendiente', { n: cola.length })}
              </span>
            )}
            <Boton
              variante="secundario"
              onClick={() => { void cargarCola(); }}
              disabled={cargando}
            >
              {t('comun.actualizar')}
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
                {t('asi.reintentar')}
              </Boton>
            </div>
          )}

          {!errorCarga && cargando && (
            <p className={styles.estadoCarga}>{t('asi.rev.cargandoLista')}</p>
          )}

          {!errorCarga && !cargando && cola.length === 0 && (
            <div className={styles.estadoVacio}>
              <span className={styles.iconoVacio}>✅</span>
              <p>{t('asi.rev.vacio')}</p>
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
                          {t(`asi.tipo.${fichaje.tipo}`)}
                        </span>
                      </div>

                      <div className={styles.detallesFichaje}>
                        <span className={styles.detalleItem}>
                          {t('asi.rev.kiosco', { nombre: fichaje.kiosco.nombre })}
                        </span>
                        <span className={styles.detalleItem}>
                          {formatearMomento(fichaje.momento)}
                        </span>
                        <span className={styles.badgeMecanismo}>
                          {t(`asi.mecanismo.${fichaje.mecanismoExcepcion}`)}
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
                        {enProceso ? <span className={styles.spinner} /> : t('asi.rev.validar')}
                      </button>
                      <button
                        className={styles.botonRechazar}
                        onClick={() => abrirModalRechazo(fichaje)}
                        disabled={enProceso}
                        type="button"
                      >
                        {t('asi.rev.rechazar')}
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
            <h2 className={styles.tituloModal}>{t('asi.rev.modalTitulo')}</h2>
            <p className={styles.subtituloModal}>
              {t('asi.rev.modalEmpleadoLabel')} <strong>{fichajeARechazar.empleado.nombre}</strong>
              {t('asi.rev.modalDetalle', {
                tipo: t(`asi.tipo.${fichajeARechazar.tipo}`),
                momento: formatearMomento(fichajeARechazar.momento),
              })}
            </p>

            <div>
              <label htmlFor="motivo-rechazo" className={styles.etiquetaModal}>
                {t('asi.rev.motivoLabel')}
              </label>
              <textarea
                id="motivo-rechazo"
                className={styles.textareaModal}
                placeholder={t('asi.rev.motivoPlaceholder')}
                value={motivoRechazo}
                onChange={(e) => setMotivoRechazo(e.target.value)}
                autoFocus
              />
            </div>

            {errorRevision && (
              <p style={{ color: 'var(--color-danger)', fontSize: '0.9rem', margin: 0 }}>
                {errorRevision}
              </p>
            )}

            <div className={styles.botonesModal}>
              <Boton
                variante="secundario"
                onClick={cerrarModalRechazo}
                disabled={enviandoRevision}
              >
                {t('comun.cancelar')}
              </Boton>
              <Boton
                variante="peligro"
                onClick={() => { void confirmarRechazo(); }}
                cargando={enviandoRevision}
              >
                {t('asi.rev.confirmarRechazo')}
              </Boton>
            </div>
          </div>
        </div>
      )}
    </LayoutPrincipal>
  );
}
