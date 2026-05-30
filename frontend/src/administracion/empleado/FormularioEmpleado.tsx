/**
 * Formulario de empleado: ALTA y EDICIÓN.
 *
 * - Sin `empleado` → alta (pide PIN; al guardar, el padre muestra el QR).
 * - Con `empleado` → edición (no pide PIN; el reset de PIN es una acción aparte).
 *
 * No usa `<form>` (div + botón con `onClick`) por convención del paquete, para
 * no anidar formularios. El turno se difiere (turnoId queda sin asignar por
 * ahora). La foto queda como campo preparado y DESHABILITADO: el reconocimiento
 * facial es una tarea futura; aquí solo se deja el hueco.
 */

import { useState, useEffect } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { obtenerSedes } from '../sedes/servicioSedes';
import type { Sede } from '../sedes/tipos';
import { crearEmpleado, editarEmpleado } from './servicioEmpleados';
import type { Empleado, EmpleadoCreado } from './tipos';
import styles from './FormularioEmpleado.module.css';

interface PropiedadesFormulario {
  empleado?: Empleado;
  onGuardado: (resultado: Empleado | EmpleadoCreado) => void;
  onCancelar: () => void;
}

export function FormularioEmpleado({ empleado, onGuardado, onCancelar }: PropiedadesFormulario) {
  const esEdicion = empleado !== undefined;

  const [sedes, setSedes] = useState<Sede[]>([]);
  const [numero, setNumero] = useState(empleado?.numero ?? '');
  const [nombre, setNombre] = useState(empleado?.nombre ?? '');
  const [sedeId, setSedeId] = useState(empleado?.sedeId ?? '');
  const [salario, setSalario] = useState(empleado ? String(empleado.salarioFijo) : '');
  const [pin, setPin] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void obtenerSedes()
      .then(setSedes)
      .catch(() => setError('No se pudieron cargar las sedes.'));
  }, []);

  const guardar = async () => {
    setError(null);

    const salarioNum = parseFloat(salario);
    if (!numero.trim() || !nombre.trim() || !sedeId) {
      setError('Número, nombre y sede son obligatorios.');
      return;
    }
    if (isNaN(salarioNum) || salarioNum < 0) {
      setError('El salario debe ser un número igual o mayor a cero.');
      return;
    }
    if (!esEdicion && !/^\d{4}$/.test(pin)) {
      setError('El PIN debe ser de 4 dígitos.');
      return;
    }

    setGuardando(true);
    try {
      const resultado = esEdicion
        ? await editarEmpleado(empleado.id, {
            numero: numero.trim(),
            nombre: nombre.trim(),
            sedeId,
            salarioFijo: salarioNum,
          })
        : await crearEmpleado({
            numero: numero.trim(),
            nombre: nombre.trim(),
            sedeId,
            salarioFijo: salarioNum,
            pin,
          });
      onGuardado(resultado);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el empleado.');
    } finally {
      setGuardando(false);
    }
  };

  const completo = numero.trim() && nombre.trim() && sedeId && salario && (esEdicion || pin.length === 4);

  return (
    <div className={styles.contenedor}>
      <p className={styles.titulo}>{esEdicion ? 'Editar empleado' : 'Nuevo empleado'}</p>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.fila}>
        <Entrada
          etiqueta="Número *"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="Ej. E001"
          disabled={guardando}
        />
        <Entrada
          etiqueta="Nombre *"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del empleado"
          disabled={guardando}
        />
        <div className={styles.grupoSelect}>
          <label className={styles.etiqueta}>Sede *</label>
          <select
            className={styles.select}
            value={sedeId}
            onChange={(e) => setSedeId(e.target.value)}
            disabled={guardando}
          >
            <option value="">Seleccionar sede</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </div>
        <Entrada
          etiqueta="Salario fijo (B/.) *"
          type="number"
          value={salario}
          onChange={(e) => setSalario(e.target.value)}
          placeholder="0.00"
          min="0"
          step="0.01"
          disabled={guardando}
        />
        {!esEdicion && (
          <Entrada
            etiqueta="PIN (4 dígitos) *"
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="••••"
            inputMode="numeric"
            maxLength={4}
            ayuda="Evita secuencias (1234) y repeticiones (0000)."
            disabled={guardando}
          />
        )}
        {/* Foto preparada para reconocimiento facial — deshabilitada (tarea futura). */}
        <div className={styles.grupoSelect}>
          <label className={styles.etiqueta}>Foto de referencia</label>
          <input
            className={styles.select}
            type="text"
            value=""
            placeholder="Reconocimiento facial — pendiente"
            disabled
            readOnly
          />
        </div>
      </div>

      <div className={styles.acciones}>
        <Boton type="button" variante="secundario" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton type="button" cargando={guardando} disabled={!completo} onClick={() => { void guardar(); }}>
          {esEdicion ? 'Guardar cambios' : 'Crear empleado'}
        </Boton>
      </div>
    </div>
  );
}
