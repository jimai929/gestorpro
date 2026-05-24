/**
 * Formulario para registrar el cierre de ventas del día.
 *
 * La captura es 100% manual: el operador teclea el total del día que obtiene
 * de Firestec (sistema externo sin API). Está pendiente confirmar si Firestec
 * imprime el total para asistir la captura; por ahora se ingresa a mano.
 *
 * El backend devuelve 409 con { mensaje } si ya existe un cierre normal
 * para esa (sede, fecha). El formulario muestra ese mensaje en un aviso
 * diferenciado (no es un error de validación, sino un conflicto de negocio).
 */

import { useState, useEffect, type FormEvent } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { obtenerSedes, registrarVenta, ErrorCierreDuplicado } from './servicioDashboard';
import { fechaHoy } from './utilidades';
import type { Sede } from './tipos';
import styles from './FormularioVenta.module.css';

interface PropiedadesFormulario {
  /** Callback que se ejecuta tras registrar una venta con éxito. */
  onRegistrada: () => void;
}

export function FormularioVenta({ onRegistrada }: PropiedadesFormulario) {
  // Datos del select de sedes
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [cargandoSedes, setCargandoSedes] = useState(true);

  // Campos del formulario
  const [sedeId, setSedeId] = useState('');
  const [fechaOperacion, setFechaOperacion] = useState(fechaHoy());
  const [monto, setMonto] = useState('');

  // Estado de UI
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisoConflicto, setAvisoConflicto] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

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

  const limpiarFormulario = () => {
    setSedeId('');
    setFechaOperacion(fechaHoy());
    setMonto('');
  };

  const manejarEnvio = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);
    setAvisoConflicto(null);
    setExito(false);

    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum < 0) {
      setError('El monto debe ser un número igual o mayor a cero.');
      return;
    }

    setGuardando(true);
    try {
      await registrarVenta({ sedeId, fechaOperacion, monto: montoNum });
      limpiarFormulario();
      setExito(true);
      onRegistrada();
    } catch (err) {
      if (err instanceof ErrorCierreDuplicado) {
        // 409: el backend ya tiene un cierre normal para esa (sede, fecha)
        setAvisoConflicto(err.message);
      } else {
        setError(err instanceof Error ? err.message : 'Error al registrar la venta.');
      }
    } finally {
      setGuardando(false);
    }
  };

  const formularioCompleto = sedeId && fechaOperacion && monto;

  return (
    <div className={styles.tarjeta}>
      <div className={styles.encabezado}>
        <div>
          <h2 className={styles.titulo}>Registrar cierre del día</h2>
          <p className={styles.nota}>
            Ingrese el total de ventas del día según Firestec.
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

          {/* Fecha del cierre */}
          <Entrada
            etiqueta="Fecha del cierre *"
            type="date"
            value={fechaOperacion}
            onChange={(e) => setFechaOperacion(e.target.value)}
            required
            disabled={guardando}
          />

          {/* Monto total del día */}
          <Entrada
            etiqueta="Total de ventas (B/.) *"
            type="number"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
            min="0"
            step="0.01"
            required
            disabled={guardando}
          />
        </div>

        {/* Aviso de conflicto 409 — diferenciado del error de validación */}
        {avisoConflicto && (
          <div className={styles.avisoConflicto}>
            <span className={styles.iconoAviso}>⚠</span>
            <span>{avisoConflicto}</span>
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}
        {exito && <p className={styles.exito}>Cierre registrado correctamente.</p>}

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
