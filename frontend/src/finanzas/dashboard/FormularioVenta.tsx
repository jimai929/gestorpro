/**
 * Formulario para registrar el cierre de caja de un turno.
 *
 * La captura es 100% manual: el operador teclea, según Firestec, el arqueo de la
 * caja al cerrar — cuánto hay por cada tipo (efectivo, tarjeta, Yappy, lotería).
 * El total es la suma del arqueo y debe cuadrar con el total que reporta Firestec.
 * La lotería son premios pagados que están en el cajón, no un ingreso aparte.
 *
 * El backend devuelve 409 con { mensaje } si ya existe un cierre normal para esa
 * (sede, fecha, turno, caja). El formulario muestra ese mensaje en un aviso
 * diferenciado (no es un error de validación, sino un conflicto de negocio).
 */

import { useState, useEffect, type FormEvent } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { obtenerSedes, registrarVenta, ErrorCierreDuplicado } from './servicioDashboard';
import { fechaHoy } from './utilidades';
import {
  TIPOS_ARQUEO,
  TURNOS,
  type Sede,
  type TipoArqueo,
  type TurnoVenta,
  type LineaArqueo,
  type VentaDiaria,
} from './tipos';
import styles from './FormularioVenta.module.css';

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

  // Campos del cierre
  const [sedeId, setSedeId] = useState('');
  const [fechaOperacion, setFechaOperacion] = useState(fechaHoy());
  const [turno, setTurno] = useState<TurnoVenta | ''>('');
  const [caja, setCaja] = useState('');
  const [cerradoPor, setCerradoPor] = useState('');
  const [horaApertura, setHoraApertura] = useState('');
  const [horaCierre, setHoraCierre] = useState('');

  // Arqueo: un monto (como texto) por cada tipo.
  const [montos, setMontos] = useState<Record<TipoArqueo, string>>(ARQUEO_VACIO);

  // Estado de UI
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisoConflicto, setAvisoConflicto] = useState<string | null>(null);

  // Cargar sedes al montar
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
  }, []);

  const actualizarMonto = (tipo: TipoArqueo, valor: string) => {
    setMontos((previo) => ({ ...previo, [tipo]: valor }));
  };

  const limpiarFormulario = () => {
    setSedeId('');
    setFechaOperacion(fechaHoy());
    setTurno('');
    setCaja('');
    setCerradoPor('');
    setHoraApertura('');
    setHoraCierre('');
    setMontos(ARQUEO_VACIO);
  };

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
        caja: caja.trim(),
        cerradoPor: cerradoPor.trim(),
        ...(horaApertura ? { horaApertura } : {}),
        ...(horaCierre ? { horaCierre } : {}),
        detalles,
      });
      limpiarFormulario();
      onRegistrada(ventaCreada);
    } catch (err) {
      if (err instanceof ErrorCierreDuplicado) {
        // 409: el backend ya tiene un cierre normal para esa (sede, fecha, turno, caja)
        setAvisoConflicto(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Error al registrar el cierre.');
      }
    } finally {
      setGuardando(false);
    }
  };

  const formularioCompleto =
    sedeId && fechaOperacion && turno && caja.trim() && cerradoPor.trim() && totalArqueo > 0;

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
              onChange={(e) => setSedeId(e.target.value)}
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

          {/* Caja */}
          <Entrada
            etiqueta="Caja *"
            type="text"
            value={caja}
            onChange={(e) => setCaja(e.target.value)}
            placeholder="Ej.: 1"
            maxLength={20}
            required
            disabled={guardando}
          />

          {/* Fecha del cierre */}
          <Entrada
            etiqueta="Fecha del cierre *"
            type="date"
            value={fechaOperacion}
            onChange={(e) => setFechaOperacion(e.target.value)}
            required
            disabled={guardando}
          />

          {/* Cerrado por */}
          <Entrada
            etiqueta="Cerrado por *"
            type="text"
            value={cerradoPor}
            onChange={(e) => setCerradoPor(e.target.value)}
            placeholder="Nombre o número"
            ayuda="Solo identifica quién hizo el cierre."
            required
            disabled={guardando}
          />

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
