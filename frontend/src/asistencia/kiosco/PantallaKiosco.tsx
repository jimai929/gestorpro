/**
 * Pantalla del kiosco de fichaje — ruta PÚBLICA /kiosco.
 *
 * No requiere sesión de usuario. El kiosco es un dispositivo físico
 * compartido por los empleados para registrar entradas y salidas.
 *
 * Flujo:
 *   1. seleccion   → Elegir kiosco de la lista y tipo de fichaje.
 *   2. identificacion → El empleado teclea su número o QR.
 *   3. facial      → Verificación facial SIMULADA (sin cámara real).
 *   4. excepcion   → Si el facial falla, camino alternativo (PIN/supervisor).
 *   5. resultado   → Mostrar éxito o error. Vuelve al inicio tras unos segundos.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { SelectorIdioma } from '../../core/i18n/SelectorIdioma';
import { useAuth } from '../../core/auth/ContextoAuth';
import { obtenerKioscos, registrarFichaje, obtenerTokenKiosco, fijarTokenKiosco } from './servicioKiosco';
import type {
  Kiosco,
  TipoFichaje,
  ResultadoFacialSimulado,
  PasoKiosco,
  ResultadoFichaje,
  RespuestaExcepcion,
  ModoExcepcion,
} from './tipos';
import styles from './PantallaKiosco.module.css';
import { LogIn, Utensils, RotateCcw, LogOut, CheckCircle2, XCircle, ArrowLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ── Constantes de presentación ─────────────────────────────────────────────

// Icono por tipo de fichaje (lucide, sin emoji — regla del sistema de diseño).
const ICONO_TIPO: Record<TipoFichaje, LucideIcon> = {
  entrada: LogIn,
  salida_comida: Utensils,
  entrada_comida: RotateCcw,
  salida: LogOut,
};

const TIPOS_FICHAJE: TipoFichaje[] = [
  'entrada',
  'salida_comida',
  'entrada_comida',
  'salida',
];

const OPCIONES_FACIAL: ResultadoFacialSimulado[] = ['sim:match', 'sim:nomatch', 'sim:nolive'];

/** Clave i18n para cada resultado facial simulado. */
const CLAVE_FACIAL: Record<ResultadoFacialSimulado, string> = {
  'sim:match': 'asi.facial.match',
  'sim:nomatch': 'asi.facial.nomatch',
  'sim:nolive': 'asi.facial.nolive',
};

/** Segundos que espera en pantalla de resultado antes de reiniciar. */
const SEGUNDOS_REINICIO = 5;

// ── Componente principal ───────────────────────────────────────────────────

export function PantallaKiosco() {
  const { t } = useTraduccion();
  const navigate = useNavigate();
  // Sesión de negocio: `/kiosco` es una ruta PÚBLICA (un dispositivo dedicado NO tiene
  // sesión JWT, solo su token de kiosco). Si hay `usuario`, quien mira entró desde el
  // sistema de gestión con sesión iniciada → se le ofrece volver. En el dispositivo real
  // `usuario` es null (sin sesión), así que el botón no aparece.
  const { usuario } = useAuth();
  // ── Estado global del flujo ──
  const [paso, setPaso] = useState<PasoKiosco>('seleccion');

  // ── Token de dispositivo (autoriza este kiosco ante el backend) ──
  const [tokenDispositivo, setTokenDispositivo] = useState<string | null>(() => obtenerTokenKiosco());
  const [editandoToken, setEditandoToken] = useState(false);
  const [tokenInput, setTokenInput] = useState('');

  const guardarToken = () => {
    if (!tokenInput.trim()) return;
    fijarTokenKiosco(tokenInput);
    setTokenDispositivo(tokenInput.trim());
    setTokenInput('');
    setEditandoToken(false);
  };

  // ── Datos de selección ──
  const [kioscos, setKioscos] = useState<Kiosco[]>([]);
  const [cargandoKioscos, setCargandoKioscos] = useState(true);
  const [errorKioscos, setErrorKioscos] = useState<string | null>(null);
  const [kioscoSeleccionado, setKioscoSeleccionado] = useState<Kiosco | null>(null);
  const [tipo, setTipo] = useState<TipoFichaje | null>(null);

  // ── Datos de identificación ──
  const [identificacion, setIdentificacion] = useState('');

  // ── Verificación facial simulada ──
  const [resultadoFacial, setResultadoFacial] = useState<ResultadoFacialSimulado>('sim:match');

  // ── Excepción ──
  const [modoExcepcionActivo, setModoExcepcionActivo] = useState<ModoExcepcion | null>(null);
  const [pestanaExcepcion, setPestanaExcepcion] = useState<'pin' | 'supervisor'>('pin');
  const [pin, setPin] = useState('');
  const [supervisorEmail, setSupervisorEmail] = useState('');
  const [supervisorPassword, setSupervisorPassword] = useState('');
  const [errorExcepcion, setErrorExcepcion] = useState<string | null>(null);

  // ── Estado de envío ──
  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  // ── Resultado final ──
  const [resultado, setResultado] = useState<ResultadoFichaje | null>(null);
  const [contadorReinicio, setContadorReinicio] = useState(SEGUNDOS_REINICIO);

  const refEntrada = useRef<HTMLInputElement>(null);

  // ── Cargar kioscos al montar ───────────────────────────────────────────

  const cargarKioscos = useCallback(async () => {
    setCargandoKioscos(true);
    setErrorKioscos(null);
    try {
      const lista = await obtenerKioscos();
      setKioscos(lista.filter((k) => k.activo));
    } catch (err) {
      setErrorKioscos(
        err instanceof Error ? err.message : t('asi.kiosco.errCargar'),
      );
    } finally {
      setCargandoKioscos(false);
    }
  }, [t]);

  useEffect(() => {
    void cargarKioscos();
  }, [cargarKioscos]);

  // ── Tema oscuro del kiosco ───────────────────────────────────────────────
  // El kiosco es un dispositivo dedicado y SIEMPRE se muestra en grafito oscuro.
  // Monta data-theme="dark" en <html> mientras el kiosco está montado y lo retira
  // al desmontar (no afecta al resto de la app, que sigue en claro por default).
  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', 'dark');
    return () => {
      if (previo === null) raiz.removeAttribute('data-theme');
      else raiz.setAttribute('data-theme', previo);
    };
  }, []);

  // ── Contador regresivo para reiniciar tras resultado ─────────────────────

  useEffect(() => {
    if (paso !== 'resultado') return;

    setContadorReinicio(SEGUNDOS_REINICIO);
    const intervalo = setInterval(() => {
      setContadorReinicio((prev) => {
        if (prev <= 1) {
          clearInterval(intervalo);
          reiniciar();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(intervalo);
  }, [paso]);

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Resetea todo el flujo al estado inicial de selección. */
  const reiniciar = () => {
    setPaso('seleccion');
    setTipo(null);
    setIdentificacion('');
    setResultadoFacial('sim:match');
    setPin('');
    setSupervisorEmail('');
    setSupervisorPassword('');
    setErrorEnvio(null);
    setErrorExcepcion(null);
    setModoExcepcionActivo(null);
    setResultado(null);
    // Mantener kioscoSeleccionado para el siguiente empleado
  };

  /** Avanza de selección a identificación si el formulario está completo. */
  const avanzarAIdentificacion = () => {
    if (!kioscoSeleccionado || !tipo) return;
    setErrorEnvio(null);
    setPaso('identificacion');
    setTimeout(() => refEntrada.current?.focus(), 100);
  };

  /** Avanza de identificación a verificación facial. */
  const avanzarAFacial = () => {
    if (!identificacion.trim()) return;
    setErrorEnvio(null);
    setPaso('facial');
  };

  /**
   * Envía el fichaje con el resultado facial simulado.
   * Si el backend devuelve 409, entra al flujo de excepción.
   */
  const enviarFichaje = async (extras?: {
    pin?: string;
    supervisorEmail?: string;
    supervisorPassword?: string;
  }) => {
    if (!kioscoSeleccionado || !tipo) return;

    setEnviando(true);
    setErrorEnvio(null);
    setErrorExcepcion(null);

    const cuerpo = {
      kioscoId: kioscoSeleccionado.id,
      tipo,
      // Heurística simple: si parece un QR (largo o sin números simples), va como qrToken.
      // En producción, la UI tendría pestañas separadas.
      numero: identificacion.trim(),
      fotoCaptura: resultadoFacial,
      ...extras,
    };

    try {
      const respuesta = await registrarFichaje(cuerpo);

      if (respuesta.ok) {
        const datos = respuesta.datos;
        setResultado({
          estado: 'exito',
          mensaje: t('asi.kiosco.fichajeRegistrado', { tipo: t(`asi.tipo.${datos.fichaje.tipo}`) }),
          esExcepcion: datos.fichaje.esExcepcion,
          alertaRRHH: datos.alertaRRHH ?? false,
        });
        setPaso('resultado');
        return;
      }

      // ── 409 → requiere excepción ──
      if (respuesta.status === 409) {
        const body = respuesta.datos as RespuestaExcepcion;
        setModoExcepcionActivo(body.modoExcepcion);
        // Establecer pestaña inicial según el modo
        setPestanaExcepcion(
          body.modoExcepcion === 'supervisor' ? 'supervisor' : 'pin',
        );
        setPaso('excepcion');
        return;
      }

      // ── 401 — token de kiosco o credencial de excepción inválida ──
      // Sin `extras` el 401 es del token de dispositivo (paso facial); con
      // `extras` es la credencial de excepción (PIN/supervisor).
      if (respuesta.status === 401) {
        const body = respuesta.datos as { mensaje?: string };
        const mensaje = body.mensaje ?? t('asi.kiosco.credInvalida');
        if (extras) {
          setErrorExcepcion(mensaje);
        } else {
          setErrorEnvio(mensaje);
        }
        return;
      }

      // ── Otros errores (404 empleado/kiosco no encontrado, etc.) ──
      const body = respuesta.datos as { mensaje?: string };
      setErrorEnvio(body.mensaje ?? t('asi.kiosco.errStatus', { status: respuesta.status }));
    } catch (err) {
      setErrorEnvio(
        err instanceof Error ? err.message : t('asi.kiosco.errRed'),
      );
    } finally {
      setEnviando(false);
    }
  };

  const manejarEnvioExcepcion = () => {
    if (pestanaExcepcion === 'pin') {
      if (!pin.trim()) return;
      void enviarFichaje({ pin });
    } else {
      if (!supervisorEmail.trim() || !supervisorPassword.trim()) return;
      void enviarFichaje({ supervisorEmail, supervisorPassword });
    }
  };

  // ── Render por paso ───────────────────────────────────────────────────────

  return (
    <div className={styles.contenedor}>
      {/* Encabezado del kiosco */}
      <div className={styles.encabezado}>
        <span className={styles.logotipoKiosco}>GP</span>
        <h1 className={styles.tituloKiosco}>{t('asi.kiosco.tituloKiosco')}</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Solo para quien entró desde la gestión con sesión (no aparece en el dispositivo). */}
          {usuario && (
            <button
              type="button"
              className={styles.botonVolverGestor}
              onClick={() => navigate('/')}
            >
              <ArrowLeft size={16} strokeWidth={1.75} aria-hidden />
              {t('asi.kiosco.volverGestorPro')}
            </button>
          )}
          <SelectorIdioma />
        </div>
      </div>

      <PanelTokenDispositivo
        configurado={tokenDispositivo !== null}
        editando={editandoToken}
        tokenInput={tokenInput}
        onChangeToken={setTokenInput}
        onEditar={() => { setEditandoToken(true); setTokenInput(''); }}
        onCancelar={() => { setEditandoToken(false); setTokenInput(''); }}
        onGuardar={guardarToken}
      />

      {kioscoSeleccionado && paso !== 'seleccion' && (
        <p className={styles.infoKioscoActivo}>
          {t('asi.kiosco.kioscoPre')}
          <span className={styles.nombreKioscoActivo}>
            {kioscoSeleccionado.nombre}
          </span>
          {t('asi.kiosco.sedeInfo', { sede: kioscoSeleccionado.sede.nombre })}
        </p>
      )}

      <div className={styles.tarjeta}>
        {/* ── PASO 1: Selección ── */}
        {paso === 'seleccion' && (
          <PasoSeleccion
            kioscos={kioscos}
            cargandoKioscos={cargandoKioscos}
            errorKioscos={errorKioscos}
            kioscoSeleccionado={kioscoSeleccionado}
            tipo={tipo}
            onSeleccionarKiosco={setKioscoSeleccionado}
            onSeleccionarTipo={setTipo}
            onAvanzar={avanzarAIdentificacion}
            onReintentar={() => { void cargarKioscos(); }}
          />
        )}

        {/* ── PASO 2: Identificación ── */}
        {paso === 'identificacion' && (
          <PasoIdentificacion
            identificacion={identificacion}
            onChange={setIdentificacion}
            onAvanzar={avanzarAFacial}
            onVolver={() => setPaso('seleccion')}
            refEntrada={refEntrada}
          />
        )}

        {/* ── PASO 3: Verificación facial simulada ── */}
        {paso === 'facial' && (
          <PasoFacial
            resultadoFacial={resultadoFacial}
            onChange={setResultadoFacial}
            enviando={enviando}
            error={errorEnvio}
            onEnviar={() => { void enviarFichaje(); }}
            onVolver={() => setPaso('identificacion')}
          />
        )}

        {/* ── PASO 4: Excepción ── */}
        {paso === 'excepcion' && modoExcepcionActivo && (
          <PasoExcepcion
            modo={modoExcepcionActivo}
            pestana={pestanaExcepcion}
            pin={pin}
            supervisorEmail={supervisorEmail}
            supervisorPassword={supervisorPassword}
            enviando={enviando}
            error={errorExcepcion}
            onCambiarPestana={setPestanaExcepcion}
            onChangePin={setPin}
            onChangeSupervisorEmail={setSupervisorEmail}
            onChangeSupervisorPassword={setSupervisorPassword}
            onEnviar={manejarEnvioExcepcion}
            onCancelar={() => {
              setPaso('facial');
              setErrorExcepcion(null);
            }}
          />
        )}

        {/* ── PASO 5: Resultado ── */}
        {paso === 'resultado' && resultado && (
          <PasoResultado
            resultado={resultado}
            contador={contadorReinicio}
            onReiniciarAhora={reiniciar}
          />
        )}
      </div>
    </div>
  );
}

// ── Panel de configuración del token de dispositivo ────────────────────────

interface PropsPanelToken {
  configurado: boolean;
  editando: boolean;
  tokenInput: string;
  onChangeToken: (v: string) => void;
  onEditar: () => void;
  onCancelar: () => void;
  onGuardar: () => void;
}

function PanelTokenDispositivo({
  configurado,
  editando,
  tokenInput,
  onChangeToken,
  onEditar,
  onCancelar,
  onGuardar,
}: PropsPanelToken) {
  const { t } = useTraduccion();
  const mostrarFormulario = !configurado || editando;

  return (
    <div
      style={{
        maxWidth: 480,
        margin: '0 auto 1rem',
        padding: '0.75rem 1rem',
        borderRadius: 8,
        background: configurado ? 'var(--color-success-bg)' : 'var(--color-danger-bg)',
        border: `1px solid ${configurado ? 'var(--color-success)' : 'var(--color-danger)'}`,
        color: 'var(--color-text)',
        fontSize: '0.85rem',
      }}
    >
      {!mostrarFormulario ? (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem' }}>
          <span>{t('asi.kiosco.dispAutorizado')}</span>
          <button type="button" onClick={onEditar} style={{ cursor: 'pointer', padding: '0.25rem 0.5rem' }}>
            {t('asi.kiosco.reconfigurar')}
          </button>
        </div>
      ) : (
        <div>
          <p style={{ margin: '0 0 0.5rem', fontWeight: 600 }}>
            {configurado ? t('asi.kiosco.reconfigTitulo') : t('asi.kiosco.noConfigurado')}
          </p>
          <p style={{ margin: '0 0 0.5rem' }}>
            {t('asi.kiosco.tokenInstruccion')}
          </p>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <input
              type="password"
              value={tokenInput}
              onChange={(e) => onChangeToken(e.target.value)}
              placeholder={t('asi.kiosco.tokenPlaceholder')}
              style={{ flex: 1, padding: '0.4rem' }}
            />
            <button
              type="button"
              onClick={onGuardar}
              disabled={!tokenInput.trim()}
              style={{ cursor: 'pointer', padding: '0.25rem 0.75rem' }}
            >
              {t('comun.guardar')}
            </button>
            {configurado && (
              <button type="button" onClick={onCancelar} style={{ cursor: 'pointer', padding: '0.25rem 0.75rem' }}>
                {t('comun.cancelar')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-componentes de cada paso ──────────────────────────────────────────

interface PropsPasoSeleccion {
  kioscos: Kiosco[];
  cargandoKioscos: boolean;
  errorKioscos: string | null;
  kioscoSeleccionado: Kiosco | null;
  tipo: TipoFichaje | null;
  onSeleccionarKiosco: (k: Kiosco) => void;
  onSeleccionarTipo: (t: TipoFichaje) => void;
  onAvanzar: () => void;
  onReintentar: () => void;
}

function PasoSeleccion({
  kioscos,
  cargandoKioscos,
  errorKioscos,
  kioscoSeleccionado,
  tipo,
  onSeleccionarKiosco,
  onSeleccionarTipo,
  onAvanzar,
  onReintentar,
}: PropsPasoSeleccion) {
  const { t } = useTraduccion();
  const manejarCambioKiosco = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const kiosco = kioscos.find((k) => k.id === e.target.value) ?? null;
    if (kiosco) onSeleccionarKiosco(kiosco);
  };

  if (cargandoKioscos) {
    return (
      <div className={styles.encabezadoPaso}>
        <p className={styles.subtituloPaso}>{t('asi.kiosco.cargandoKioscos')}</p>
      </div>
    );
  }

  if (errorKioscos) {
    return (
      <>
        <div className={styles.bannerError}>{errorKioscos}</div>
        <button className={styles.botonKiosco} onClick={onReintentar}>
          {t('asi.reintentar')}
        </button>
      </>
    );
  }

  return (
    <>
      <div className={styles.encabezadoPaso}>
        <h2 className={styles.tituloPaso}>{t('asi.kiosco.bienvenido')}</h2>
        <p className={styles.subtituloPaso}>
          {t('asi.kiosco.bienvenidoSub')}
        </p>
      </div>

      {/* Selector de kiosco */}
      <div className={styles.grupoSelector}>
        <label className={styles.etiqueta} htmlFor="selector-kiosco">
          {t('asi.kiosco.kiosco')}
        </label>
        <select
          id="selector-kiosco"
          className={styles.selector}
          value={kioscoSeleccionado?.id ?? ''}
          onChange={manejarCambioKiosco}
        >
          <option value="" disabled>
            {t('asi.kiosco.selKiosco')}
          </option>
          {kioscos.map((k) => (
            <option key={k.id} value={k.id}>
              {k.nombre} ({k.sede.nombre})
            </option>
          ))}
        </select>
      </div>

      {/* Cuadrícula de tipos */}
      <div className={styles.grupoSelector}>
        <span className={styles.etiqueta}>{t('asi.kiosco.tipoFichaje')}</span>
        <div className={styles.cuadriculaTipos}>
          {TIPOS_FICHAJE.map((tf) => (
            <button
              key={tf}
              className={[
                styles.botonTipo,
                tipo === tf ? styles.botonTipoSeleccionado : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSeleccionarTipo(tf)}
              type="button"
            >
              <span className={styles.iconoTipo}>
                {React.createElement(ICONO_TIPO[tf], { size: 28, 'aria-hidden': true })}
              </span>
              <span className={styles.nombreTipo}>{t(`asi.tipo.${tf}`)}</span>
            </button>
          ))}
        </div>
      </div>

      <button
        className={styles.botonKiosco}
        onClick={onAvanzar}
        disabled={!kioscoSeleccionado || !tipo}
        type="button"
      >
        {t('comun.continuar')}
      </button>
    </>
  );
}

// ── Paso 2: Identificación ─────────────────────────────────────────────────

interface PropsPasoIdentificacion {
  identificacion: string;
  onChange: (v: string) => void;
  onAvanzar: () => void;
  onVolver: () => void;
  refEntrada: React.RefObject<HTMLInputElement | null>;
}

function PasoIdentificacion({
  identificacion,
  onChange,
  onAvanzar,
  onVolver,
  refEntrada,
}: PropsPasoIdentificacion) {
  const { t } = useTraduccion();
  const manejarTecla = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onAvanzar();
  };

  return (
    <>
      <div className={styles.encabezadoPaso}>
        <h2 className={styles.tituloPaso}>{t('asi.kiosco.identificacion')}</h2>
        <p className={styles.subtituloPaso}>
          {t('asi.kiosco.identificacionSub')}
        </p>
      </div>

      <input
        ref={refEntrada}
        className={styles.campoGrande}
        type="text"
        placeholder={t('asi.kiosco.identPlaceholder')}
        value={identificacion}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={manejarTecla}
        autoComplete="off"
        autoFocus
      />

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          className={[styles.botonKiosco, styles.botonKioscoSecundario].join(' ')}
          onClick={onVolver}
          type="button"
          style={{ flex: 1 }}
        >
          {t('comun.volver')}
        </button>
        <button
          className={styles.botonKiosco}
          onClick={onAvanzar}
          disabled={!identificacion.trim()}
          type="button"
          style={{ flex: 2 }}
        >
          {t('comun.continuar')}
        </button>
      </div>
    </>
  );
}

// ── Paso 3: Verificación facial (simulada) ────────────────────────────────

interface PropsPasoFacial {
  resultadoFacial: ResultadoFacialSimulado;
  onChange: (v: ResultadoFacialSimulado) => void;
  enviando: boolean;
  error: string | null;
  onEnviar: () => void;
  onVolver: () => void;
}

function PasoFacial({
  resultadoFacial,
  onChange,
  enviando,
  error,
  onEnviar,
  onVolver,
}: PropsPasoFacial) {
  const { t } = useTraduccion();

  return (
    <>
      <div className={styles.encabezadoPaso}>
        <h2 className={styles.tituloPaso}>{t('asi.kiosco.facialTitulo')}</h2>
        <p className={styles.subtituloPaso}>
          {t('asi.kiosco.facialSub')}
        </p>
      </div>

      <div className={styles.panelFacial}>
        <span className={styles.notaSimulacion}>
          {t('asi.kiosco.modoSimulacion')}
        </span>
        <span className={styles.etiquetaFacial}>{t('asi.kiosco.resultadoVerif')}</span>
        <div className={styles.botonesSimulacion}>
          {OPCIONES_FACIAL.map((op) => (
            <button
              key={op}
              className={[
                styles.botonSimular,
                resultadoFacial === op ? styles.botonSimularSeleccionado : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onChange(op)}
              type="button"
            >
              {t(CLAVE_FACIAL[op])}
            </button>
          ))}
        </div>
      </div>

      {error && <div className={styles.bannerError}>{error}</div>}

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          className={[styles.botonKiosco, styles.botonKioscoSecundario].join(' ')}
          onClick={onVolver}
          type="button"
          style={{ flex: 1 }}
          disabled={enviando}
        >
          {t('comun.volver')}
        </button>
        <button
          className={styles.botonKiosco}
          onClick={onEnviar}
          disabled={enviando}
          type="button"
          style={{ flex: 2 }}
        >
          {enviando ? <span className={styles.spinner} /> : t('asi.kiosco.registrarFichaje')}
        </button>
      </div>
    </>
  );
}

// ── Paso 4: Excepción ─────────────────────────────────────────────────────

interface PropsPasoExcepcion {
  modo: ModoExcepcion;
  pestana: 'pin' | 'supervisor';
  pin: string;
  supervisorEmail: string;
  supervisorPassword: string;
  enviando: boolean;
  error: string | null;
  onCambiarPestana: (p: 'pin' | 'supervisor') => void;
  onChangePin: (v: string) => void;
  onChangeSupervisorEmail: (v: string) => void;
  onChangeSupervisorPassword: (v: string) => void;
  onEnviar: () => void;
  onCancelar: () => void;
}

function PasoExcepcion({
  modo,
  pestana,
  pin,
  supervisorEmail,
  supervisorPassword,
  enviando,
  error,
  onCambiarPestana,
  onChangePin,
  onChangeSupervisorEmail,
  onChangeSupervisorPassword,
  onEnviar,
  onCancelar,
}: PropsPasoExcepcion) {
  const { t } = useTraduccion();
  const mostrarPestanas = modo === 'ambos';
  const mostrarPin = modo === 'pin' || (modo === 'ambos' && pestana === 'pin');
  const mostrarSupervisor =
    modo === 'supervisor' || (modo === 'ambos' && pestana === 'supervisor');

  const puedeEnviar =
    (mostrarPin && pin.trim().length > 0) ||
    (mostrarSupervisor &&
      supervisorEmail.trim().length > 0 &&
      supervisorPassword.trim().length > 0);

  return (
    <>
      <div className={styles.encabezadoPaso}>
        <h2 className={styles.tituloPaso}>{t('asi.kiosco.verifFallida')}</h2>
        <p className={styles.subtituloPaso}>
          {t('asi.kiosco.verifFallidaSub')}
        </p>
      </div>

      <div className={styles.panelExcepcion}>
        <p className={styles.avisoExcepcion}>
          {t('asi.kiosco.avisoRevision')}
        </p>

        {/* Pestañas (solo si modo === 'ambos') */}
        {mostrarPestanas && (
          <div className={styles.pestanasExcepcion}>
            <button
              className={[
                styles.pestana,
                pestana === 'pin' ? styles.pestanaActiva : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onCambiarPestana('pin')}
              type="button"
            >
              {t('asi.kiosco.pestPin')}
            </button>
            <button
              className={[
                styles.pestana,
                pestana === 'supervisor' ? styles.pestanaActiva : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onCambiarPestana('supervisor')}
              type="button"
            >
              {t('asi.kiosco.pestSupervisor')}
            </button>
          </div>
        )}

        {/* Formulario de PIN */}
        {mostrarPin && (
          <div>
            <label className={styles.etiqueta} htmlFor="campo-pin">
              {modo === 'ambos' ? t('asi.kiosco.pinLabelAmbos') : t('asi.kiosco.pinLabelSolo')}
            </label>
            <input
              id="campo-pin"
              className={styles.campoPIN}
              type="password"
              inputMode="numeric"
              maxLength={8}
              placeholder="● ● ● ●"
              value={pin}
              onChange={(e) => onChangePin(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {/* Formulario de supervisor */}
        {mostrarSupervisor && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label className={styles.etiqueta} htmlFor="campo-sv-email">
                {t('asi.kiosco.svEmail')}
              </label>
              <input
                id="campo-sv-email"
                className={styles.campoTexto}
                type="email"
                placeholder={t('asi.kiosco.svEmailPlaceholder')}
                value={supervisorEmail}
                onChange={(e) => onChangeSupervisorEmail(e.target.value)}
                autoFocus={!mostrarPin}
              />
            </div>
            <div>
              <label className={styles.etiqueta} htmlFor="campo-sv-pass">
                {t('asi.kiosco.svPass')}
              </label>
              <input
                id="campo-sv-pass"
                className={styles.campoTexto}
                type="password"
                placeholder={t('asi.kiosco.svPassPlaceholder')}
                value={supervisorPassword}
                onChange={(e) => onChangeSupervisorPassword(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {error && <div className={styles.bannerError}>{error}</div>}

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          className={[styles.botonKiosco, styles.botonKioscoSecundario].join(' ')}
          onClick={onCancelar}
          type="button"
          style={{ flex: 1 }}
          disabled={enviando}
        >
          {t('comun.cancelar')}
        </button>
        <button
          className={styles.botonKiosco}
          onClick={onEnviar}
          disabled={!puedeEnviar || enviando}
          type="button"
          style={{ flex: 2 }}
        >
          {enviando ? <span className={styles.spinner} /> : t('asi.kiosco.confirmarFichaje')}
        </button>
      </div>
    </>
  );
}

// ── Paso 5: Resultado ─────────────────────────────────────────────────────

interface PropsPasoResultado {
  resultado: ResultadoFichaje;
  contador: number;
  onReiniciarAhora: () => void;
}

function PasoResultado({ resultado, contador, onReiniciarAhora }: PropsPasoResultado) {
  const { t } = useTraduccion();
  const esExito = resultado.estado === 'exito';

  return (
    <div className={styles.panelResultado}>
      <span className={styles.iconoResultado}>
        {esExito ? (
          <CheckCircle2 size={64} style={{ color: 'var(--color-success)' }} aria-hidden />
        ) : (
          <XCircle size={64} style={{ color: 'var(--color-danger)' }} aria-hidden />
        )}
      </span>

      <h2 className={styles.tituloResultado}>
        {esExito ? t('asi.kiosco.fichajeRegistradoTitulo') : t('asi.kiosco.noFichar')}
      </h2>

      <p className={styles.mensajeResultado}>{resultado.mensaje}</p>

      {esExito && resultado.esExcepcion && (
        <span className={styles.badgeExcepcion}>
          {t('asi.kiosco.badgeExcepcion')}
        </span>
      )}

      {esExito && resultado.alertaRRHH && (
        <span className={styles.badgeAlertaRRHH}>
          {t('asi.kiosco.badgeAlertaRRHH')}
        </span>
      )}

      <p className={styles.subtituloPaso} style={{ marginTop: '0.5rem' }}>
        {t('asi.kiosco.proximoEmpleado', { n: contador })}
      </p>

      <button
        className={styles.botonKiosco}
        onClick={onReiniciarAhora}
        type="button"
        style={{ marginTop: '0.5rem' }}
      >
        {t('asi.kiosco.siguienteEmpleado')}
      </button>
    </div>
  );
}
