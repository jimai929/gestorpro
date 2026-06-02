/**
 * Formulario para registrar el cierre de caja de un turno.
 *
 * La captura es 100% manual: el operador teclea, según Firestec, el arqueo de la
 * caja al cerrar — cuánto hay por cada tipo (efectivo, tarjeta, Yappy, lotería).
 * El total es la suma del arqueo y debe cuadrar con el total que reporta Firestec.
 * La lotería son premios pagados que están en el cajón, no un ingreso aparte.
 *
 * El backend devuelve 409 con { mensaje } si ya existe un cierre normal para esa
 * (sede, fecha, turno, cajera). El formulario muestra ese mensaje en un aviso
 * diferenciado (no es un error de validación, sino un conflicto de negocio).
 */

import { useState, useEffect, useMemo, type FormEvent } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import {
  obtenerSedes,
  obtenerEmpleadosPorRol,
  registrarVenta,
  ErrorCierreDuplicado,
} from './servicioDashboard';
import { fechaHoy } from './utilidades';
import {
  TIPOS_ARQUEO,
  TURNOS,
  type Sede,
  type EmpleadoCierre,
  type TipoArqueo,
  type TurnoVenta,
  type LineaArqueo,
  type VentaDiaria,
} from './tipos';
import styles from './FormularioVenta.module.css';

/** Snapshot legible que se guarda en el cierre: "E001 - María Pérez". */
function snapshotEmpleado(e: EmpleadoCierre): string {
  return `${e.numero} - ${e.nombre}`;
}

/**
 * Ordena empleados poniendo PRIMERO los de la sede del cierre y luego los de
 * otras sedes (no se filtra estricto: a veces alguien cubre otra sede). Dentro
 * de cada grupo, por número de empleado.
 */
function ordenarPorSede(lista: EmpleadoCierre[], sedeId: string): EmpleadoCierre[] {
  return [...lista].sort((a, b) => {
    const aFuera = a.sedeId === sedeId ? 0 : 1;
    const bFuera = b.sedeId === sedeId ? 0 : 1;
    if (aFuera !== bFuera) return aFuera - bFuera;
    return a.numero.localeCompare(b.numero);
  });
}

interface PropiedadesFormulario {
  /** Callback tras registrar con éxito; recibe el cierre creado para que el
   *  dashboard lo confirme y lo resalte aunque el formulario ya se haya cerrado. */
  onRegistrada: (venta: VentaDiaria) => void;
}

const ARQUEO_VACIO: Record<TipoArqueo, string> = {
  efectivo: '',
  tarjeta: '',
  yappy: '',
  loteria: '',
};

export function FormularioVenta({ onRegistrada }: PropiedadesFormulario) {
  // Datos del select de sedes
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [cargandoSedes, setCargandoSedes] = useState(true);

  // Empleados por rol operativo para los selects de cajera y verificador.
  const [cajeras, setCajeras] = useState<EmpleadoCierre[]>([]);
  const [verificadores, setVerificadores] = useState<EmpleadoCierre[]>([]);
  // Distingue "aún no cargó / falló" de "cargó y no hay": evita el mensaje
  // engañoso "no hay cajeras" cuando en realidad el fetch falló.
  const [empleadosListos, setEmpleadosListos] = useState(false);

  // Campos del cierre
  const [sedeId, setSedeId] = useState('');
  const [fechaOperacion, setFechaOperacion] = useState(fechaHoy());
  const [turno, setTurno] = useState<TurnoVenta | ''>('');
  // `cajera` y `cerradoPor` guardan el SNAPSHOT string ("E001 - Nombre").
  const [cajera, setCajera] = useState('');
  const [cerradoPor, setCerradoPor] = useState('');
  const [horaApertura, setHoraApertura] = useState('');
  const [horaCierre, setHoraCierre] = useState('');

  // Arqueo: un monto (como texto) por cada tipo.
  const [montos, setMontos] = useState<Record<TipoArqueo, string>>(ARQUEO_VACIO);

  // Estado de UI
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisoConflicto, setAvisoConflicto] = useState<string | null>(null);

  // Cargar sedes y empleados (cajeras / verificadores) al montar.
  useEffect(() => {
    const cargar = async () => {
      try {
        const lista = await obtenerSedes();
        setSedes(lista);
      } catch {
        setError('No se pudieron cargar las sedes. Recarga la página.');
      } finally {
        setCargandoSedes(false);
      }
    };
    void cargar();
    // Carga cajeras y verificadores; si falla, se AVISA (no se traga el error,
    // que dejaría los selects vacíos pareciendo "no hay empleados con el rol").
    void Promise.all([
      obtenerEmpleadosPorRol('cajera'),
      obtenerEmpleadosPorRol('verificador'),
    ])
      .then(([listaCajeras, listaVerificadores]) => {
        setCajeras(listaCajeras);
        setVerificadores(listaVerificadores);
        setEmpleadosListos(true);
      })
      .catch(() =>
        setError('No se pudieron cargar las cajeras/verificadores. Recarga la página.'),
      );
  }, []);

  // Listas ordenadas: primero los de la sede del cierre, luego otras sedes.
  const cajerasOrdenadas = useMemo(() => ordenarPorSede(cajeras, sedeId), [cajeras, sedeId]);
  const verificadoresOrdenados = useMemo(
    () => ordenarPorSede(verificadores, sedeId),
    [verificadores, sedeId],
  );

  // Al cambiar de sede se RESETEAN cajera y verificador, para no arrastrar a
  // alguien de la sede anterior a un cierre de otra sede.
  const cambiarSede = (nuevaSede: string) => {
    setSedeId(nuevaSede);
    setCajera('');
    setCerradoPor('');
  };

  const actualizarMonto = (tipo: TipoArqueo, valor: string) => {
    setMontos((previo) => ({ ...previo, [tipo]: valor }));
  };

  const limpiarFormulario = () => {
    setSedeId('');
    setFechaOperacion(fechaHoy());
    setTurno('');
    setCajera('');
    setCerradoPor('');
    setHoraApertura('');
    setHoraCierre('');
    setMontos(ARQUEO_VACIO);
  };

  // Misma persona como cajera y verificador: permitido, pero se advierte.
  const mismaPersona = cajera !== '' && cajera === cerradoPor;

  // Total del arqueo en vivo (los campos vacíos cuentan como cero).
  const totalArqueo = TIPOS_ARQUEO.reduce((acc, { tipo }) => {
    const n = parseFloat(montos[tipo]);
    return acc + (isNaN(n) ? 0 : n);
  }, 0);

  const manejarEnvio = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);
    setAvisoConflicto(null);

    if (!turno) {
      setError('Seleccione el turno del cierre.');
      return;
    }

    // Construir el arqueo: solo los tipos con un monto tecleado.
    const detalles: LineaArqueo[] = [];
    for (const { tipo, etiqueta } of TIPOS_ARQUEO) {
      const crudo = montos[tipo].trim();
      if (crudo === '') continue;
      const n = parseFloat(crudo);
      if (isNaN(n) || n < 0) {
        setError(`El monto de ${etiqueta} debe ser un número igual o mayor a cero.`);
        return;
      }
      detalles.push({ tipoArqueo: tipo, monto: n });
    }
    if (detalles.length === 0) {
      setError('Ingrese al menos un monto del arqueo de la caja.');
      return;
    }

    setGuardando(true);
    try {
      const ventaCreada = await registrarVenta({
        sedeId,
        fechaOperacion,
        turno,
        cajera: cajera.trim(),
        cerradoPor: cerradoPor.trim(),
        ...(horaApertura ? { horaApertura } : {}),
        ...(horaCierre ? { horaCierre } : {}),
        detalles,
      });
      limpiarFormulario();
      onRegistrada(ventaCreada);
    } catch (err) {
      if (err instanceof ErrorCierreDuplicado) {
        // 409: el backend ya tiene un cierre normal para esa (sede, fecha, turno, cajera)
        setAvisoConflicto(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Error al registrar el cierre.');
      }
    } finally {
      setGuardando(false);
    }
  };

  const formularioCompleto =
    sedeId && fechaOperacion && turno && cajera.trim() && cerradoPor.trim() && totalArqueo > 0;

  return (
    <div className={styles.tarjeta}>
      <div className={styles.encabezado}>
        <div>
          <h2 className={styles.titulo}>Registrar cierre de caja</h2>
          <p className={styles.nota}>
            Ingrese el arqueo de la caja al cerrar según Firestec. El total debe
            cuadrar con el total que reporta Firestec.
          </p>
        </div>
      </div>

      <form onSubmit={(e) => { void manejarEnvio(e); }}>
        <div className={styles.cuadricula}>
          {/* Sede */}
          <div className={styles.grupoSelect}>
            <label className={styles.etiqueta}>Sede *</label>
            <select
              className={styles.select}
              value={sedeId}
              onChange={(e) => cambiarSede(e.target.value)}
              required
              disabled={cargandoSedes || guardando}
            >
              <option value="">
                {cargandoSedes ? 'Cargando…' : 'Seleccionar sede'}
              </option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Turno */}
          <div className={styles.grupoSelect}>
            <label className={styles.etiqueta}>Turno *</label>
            <select
              className={styles.select}
              value={turno}
              onChange={(e) => setTurno(e.target.value as TurnoVenta | '')}
              required
              disabled={guardando}
            >
              <option value="">Seleccionar turno</option>
              {TURNOS.map((t) => (
                <option key={t.turno} value={t.turno}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </div>

          {/* Cajera (empleado con rol operativo Cajera) */}
          <div className={styles.grupoSelect}>
            <label className={styles.etiqueta}>Cajera *</label>
            <select
              className={styles.select}
              value={cajera}
              onChange={(e) => setCajera(e.target.value)}
              required
              disabled={guardando || !sedeId}
            >
              <option value="">{sedeId ? 'Seleccionar cajera' : 'Elija una sede primero'}</option>
              {cajerasOrdenadas.map((e) => (
                <option key={e.id} value={snapshotEmpleado(e)}>
                  {snapshotEmpleado(e)}
                  {e.sedeId !== sedeId ? ' (otra sede)' : ''}
                </option>
              ))}
            </select>
            {sedeId && empleadosListos && cajeras.length === 0 && (
              <span className={styles.ayudaCampo}>
                No hay empleados con rol Cajera. Asígnalo en Empleados.
              </span>
            )}
          </div>

          {/* Fecha del cierre */}
          <Entrada
            etiqueta="Fecha del cierre *"
            type="date"
            value={fechaOperacion}
            onChange={(e) => setFechaOperacion(e.target.value)}
            required
            disabled={guardando}
          />

          {/* Cerrado por (empleado con rol operativo Verificador) */}
          <div className={styles.grupoSelect}>
            <label className={styles.etiqueta}>Cerrado por *</label>
            <select
              className={styles.select}
              value={cerradoPor}
              onChange={(e) => setCerradoPor(e.target.value)}
              required
              disabled={guardando || !sedeId}
            >
              <option value="">{sedeId ? 'Seleccionar verificador' : 'Elija una sede primero'}</option>
              {verificadoresOrdenados.map((e) => (
                <option key={e.id} value={snapshotEmpleado(e)}>
                  {snapshotEmpleado(e)}
                  {e.sedeId !== sedeId ? ' (otra sede)' : ''}
                </option>
              ))}
            </select>
            {sedeId && empleadosListos && verificadores.length === 0 && (
              <span className={styles.ayudaCampo}>
                No hay empleados con rol Verificador. Asígnalo en Empleados.
              </span>
            )}
          </div>

          {/* Horas descriptivas (opcionales) */}
          <Entrada
            etiqueta="Hora de apertura"
            type="time"
            value={horaApertura}
            onChange={(e) => setHoraApertura(e.target.value)}
            disabled={guardando}
          />
          <Entrada
            etiqueta="Hora de cierre"
            type="time"
            value={horaCierre}
            onChange={(e) => setHoraCierre(e.target.value)}
            disabled={guardando}
          />
        </div>

        {/* ── Arqueo de la caja ── */}
        <div className={styles.arqueo}>
          <div className={styles.arqueoEncabezado}>
            <span className={styles.arqueoTitulo}>Arqueo de la caja</span>
            <span className={styles.arqueoNota}>La lotería son premios pagados que están en el cajón.</span>
          </div>
          <div className={styles.cuadriculaArqueo}>
            {TIPOS_ARQUEO.map(({ tipo, etiqueta }) => (
              <Entrada
                key={tipo}
                etiqueta={`${etiqueta} (B/.)`}
                type="number"
                value={montos[tipo]}
                onChange={(e) => actualizarMonto(tipo, e.target.value)}
                placeholder="0.00"
                min="0"
                step="0.01"
                disabled={guardando}
              />
            ))}
          </div>
          <div className={styles.totalArqueo}>
            <span>Total del cierre</span>
            <span className={styles.totalArqueoValor}>B/. {totalArqueo.toFixed(2)}</span>
          </div>
        </div>

        {/* Aviso de conflicto 409 — diferenciado del error de validación */}
        {avisoConflicto && (
          <div className={styles.avisoConflicto}>
            <span className={styles.iconoAviso}>⚠</span>
            <span>{avisoConflicto}</span>
          </div>
        )}

        {/* Advertencia (no bloquea): la misma persona es cajera y verificador. */}
        {mismaPersona && (
          <div className={styles.avisoAdvertencia}>
            <span className={styles.iconoAviso}>⚠</span>
            <span>
              La cajera y quien verifica son la misma persona ({cajera}). Está permitido,
              pero revisa el control interno.
            </span>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.acciones}>
          <Boton
            type="submit"
            cargando={guardando}
            disabled={!formularioCompleto}
          >
            Registrar cierre
          </Boton>
        </div>
      </form>
    </div>
  );
}
