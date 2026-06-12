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
import { obtenerKioscos, registrarFichaje } from './servicioKiosco';
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

// ── Constantes de presentación ─────────────────────────────────────────────

const ETIQUETA_TIPO: Record<TipoFichaje, string> = {
  entrada: 'Entrada',
  salida_comida: 'Salida comida',
  entrada_comida: 'Vuelta de comida',
  salida: 'Salida',
};

const ICONO_TIPO: Record<TipoFichaje, string> = {
  entrada: '🟢',
  salida_comida: '🍽',
  entrada_comida: '🔄',
  salida: '🔴',
};

const TIPOS_FICHAJE: TipoFichaje[] = [
  'entrada',
  'salida_comida',
  'entrada_comida',
  'salida',
];

const ETIQUETA_FACIAL: Record<ResultadoFacialSimulado, string> = {
  'sim:match': '✅ Coincide — facial aprobado',
  'sim:nomatch': '❌ No coincide — facial rechazado',
  'sim:nolive': '⚠️ Sin vida — falla liveness',
};

/** Segundos que espera en pantalla de resultado antes de reiniciar. */
const SEGUNDOS_REINICIO = 5;

// ── Componente principal ───────────────────────────────────────────────────

export function PantallaKiosco() {
  // ── Estado global del flujo ──
  const [paso, setPaso] = useState<PasoKiosco>('seleccion');

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
        err instanceof Error ? err.message : 'Error al cargar los kioscos.',
      );
    } finally {
      setCargandoKioscos(false);
    }
  }, []);

  useEffect(() => {
    void cargarKioscos();
  }, [cargarKioscos]);

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
          mensaje: `Fichaje de ${ETIQUETA_TIPO[datos.fichaje.tipo]} registrado correctamente.`,
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

      // ── 401 en flujo de excepción — credencial inválida ──
      if (respuesta.status === 401) {
        const body = respuesta.datos as { mensaje?: string };
        setErrorExcepcion(body.mensaje ?? 'Credencial inválida. Intente nuevamente.');
        return;
      }

      // ── Otros errores (404 empleado/kiosco no encontrado, etc.) ──
      const body = respuesta.datos as { mensaje?: string };
      setErrorEnvio(body.mensaje ?? `Error ${respuesta.status}.`);
    } catch (err) {
      setErrorEnvio(
        err instanceof Error ? err.message : 'Error de red. Intente nuevamente.',
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
        <h1 className={styles.tituloKiosco}>GestorPro — Kiosco de fichaje</h1>
      </div>

      {kioscoSeleccionado && paso !== 'seleccion' && (
        <p className={styles.infoKioscoActivo}>
          Kiosco:{' '}
          <span className={styles.nombreKioscoActivo}>
            {kioscoSeleccionado.nombre}
          </span>{' '}
          · Sede: {kioscoSeleccionado.sede.nombre}
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
  const manejarCambioKiosco = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const kiosco = kioscos.find((k) => k.id === e.target.value) ?? null;
    if (kiosco) onSeleccionarKiosco(kiosco);
  };

  if (cargandoKioscos) {
    return (
      <div className={styles.encabezadoPaso}>
        <p className={styles.subtituloPaso}>Cargando kioscos…</p>
      </div>
    );
  }

  if (errorKioscos) {
    return (
      <>
        <div className={styles.bannerError}>{errorKioscos}</div>
        <button className={styles.botonKiosco} onClick={onReintentar}>
          Reintentar
        </button>
      </>
    );
  }

  return (
    <>
      <div className={styles.encabezadoPaso}>
        <h2 className={styles.tituloPaso}>Bienvenido</h2>
        <p className={styles.subtituloPaso}>
          Seleccione el kiosco y el tipo de fichaje para comenzar.
        </p>
      </div>

      {/* Selector de kiosco */}
      <div className={styles.grupoSelector}>
        <label className={styles.etiqueta} htmlFor="selector-kiosco">
          Kiosco
        </label>
        <select
          id="selector-kiosco"
          className={styles.selector}
          value={kioscoSeleccionado?.id ?? ''}
          onChange={manejarCambioKiosco}
        >
          <option value="" disabled>
            — Seleccione un kiosco —
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
        <span className={styles.etiqueta}>Tipo de fichaje</span>
        <div className={styles.cuadriculaTipos}>
          {TIPOS_FICHAJE.map((t) => (
            <button
              key={t}
              className={[
                styles.botonTipo,
                tipo === t ? styles.botonTipoSeleccionado : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onSeleccionarTipo(t)}
              type="button"
            >
              <span className={styles.iconoTipo}>{ICONO_TIPO[t]}</span>
              <span className={styles.nombreTipo}>{ETIQUETA_TIPO[t]}</span>
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
        Continuar
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
  const manejarTecla = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') onAvanzar();
  };

  return (
    <>
      <div className={styles.encabezadoPaso}>
        <h2 className={styles.tituloPaso}>Identificación</h2>
        <p className={styles.subtituloPaso}>
          Teclee su número de empleado o pase su tarjeta QR.
        </p>
      </div>

      <input
        ref={refEntrada}
        className={styles.campoGrande}
        type="text"
        placeholder="Número de empleado o QR"
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
          Volver
        </button>
        <button
          className={styles.botonKiosco}
          onClick={onAvanzar}
          disabled={!identificacion.trim()}
          type="button"
          style={{ flex: 2 }}
        >
          Continuar
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
  const opciones: ResultadoFacialSimulado[] = [
    'sim:match',
    'sim:nomatch',
    'sim:nolive',
  ];

  return (
    <>
      <div className={styles.encabezadoPaso}>
        <h2 className={styles.tituloPaso}>Verificación facial</h2>
        <p className={styles.subtituloPaso}>
          En producción se captura la foto automáticamente. Aquí puede
          simular el resultado de la verificación.
        </p>
      </div>

      <div className={styles.panelFacial}>
        <span className={styles.notaSimulacion}>
          Modo simulación — sin cámara real
        </span>
        <span className={styles.etiquetaFacial}>Resultado de la verificación:</span>
        <div className={styles.botonesSimulacion}>
          {opciones.map((op) => (
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
              {ETIQUETA_FACIAL[op]}
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
          Volver
        </button>
        <button
          className={styles.botonKiosco}
          onClick={onEnviar}
          disabled={enviando}
          type="button"
          style={{ flex: 2 }}
        >
          {enviando ? <span className={styles.spinner} /> : 'Registrar fichaje'}
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
        <h2 className={styles.tituloPaso}>Verificación fallida</h2>
        <p className={styles.subtituloPaso}>
          El reconocimiento facial no pudo confirmarse. Use el método
          alternativo para completar el fichaje.
        </p>
      </div>

      <div className={styles.panelExcepcion}>
        <p className={styles.avisoExcepcion}>
          Este fichaje quedará marcado para revisión del jefe.
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
              PIN personal
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
              Supervisor
            </button>
          </div>
        )}

        {/* Formulario de PIN */}
        {mostrarPin && (
          <div>
            <label className={styles.etiqueta} htmlFor="campo-pin">
              {modo === 'ambos' ? 'Su PIN personal:' : 'PIN personal del empleado:'}
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
                Correo del supervisor:
              </label>
              <input
                id="campo-sv-email"
                className={styles.campoTexto}
                type="email"
                placeholder="supervisor@empresa.com"
                value={supervisorEmail}
                onChange={(e) => onChangeSupervisorEmail(e.target.value)}
                autoFocus={!mostrarPin}
              />
            </div>
            <div>
              <label className={styles.etiqueta} htmlFor="campo-sv-pass">
                Contraseña del supervisor:
              </label>
              <input
                id="campo-sv-pass"
                className={styles.campoTexto}
                type="password"
                placeholder="Contraseña"
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
          Cancelar
        </button>
        <button
          className={styles.botonKiosco}
          onClick={onEnviar}
          disabled={!puedeEnviar || enviando}
          type="button"
          style={{ flex: 2 }}
        >
          {enviando ? <span className={styles.spinner} /> : 'Confirmar fichaje'}
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
  const esExito = resultado.estado === 'exito';

  return (
    <div className={styles.panelResultado}>
      <span className={styles.iconoResultado}>{esExito ? '✅' : '❌'}</span>

      <h2 className={styles.tituloResultado}>
        {esExito ? 'Fichaje registrado' : 'No se pudo fichar'}
      </h2>

      <p className={styles.mensajeResultado}>{resultado.mensaje}</p>

      {esExito && resultado.esExcepcion && (
        <span className={styles.badgeExcepcion}>
          Fichaje de excepción — pendiente de revisión
        </span>
      )}

      {esExito && resultado.alertaRRHH && (
        <span className={styles.badgeAlertaRRHH}>
          Alerta a RRHH: verificar foto de referencia
        </span>
      )}

      <p className={styles.subtituloPaso} style={{ marginTop: '0.5rem' }}>
        Próximo empleado en {contador}s…
      </p>

      <button
        className={styles.botonKiosco}
        onClick={onReiniciarAhora}
        type="button"
        style={{ marginTop: '0.5rem' }}
      >
        Siguiente empleado
      </button>
    </div>
  );
}
