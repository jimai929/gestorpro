/**
 * Formulario de alta de kiosco (no hay edición ni baja: el backend solo expone
 * el alta). Campos: nombre (obligatorio) y sede (obligatoria). No usa `<form>`
 * (div + botón con `onClick`) por convención del paquete, para no anidar
 * formularios.
 */

import { useState, useEffect } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { crearKiosco } from './servicioKioscos';
import { obtenerSedes } from '../sedes/servicioSedes';
import type { Sede } from '../sedes/tipos';
import type { KioscoConToken } from './tipos';
import styles from './FormularioKiosco.module.css';

interface PropiedadesFormulario {
  onGuardado: (kiosco: KioscoConToken) => void;
  onCancelar: () => void;
}

export function FormularioKiosco({ onGuardado, onCancelar }: PropiedadesFormulario) {
  const [nombre, setNombre] = useState('');
  const [sedeId, setSedeId] = useState('');
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    obtenerSedes()
      .then(setSedes)
      .catch(() => setError('No se pudieron cargar las sedes.'));
  }, []);

  const guardar = async () => {
    if (!nombre.trim() || !sedeId) return;
    setGuardando(true);
    setError(null);
    try {
      const kiosco = await crearKiosco({ nombre: nombre.trim(), sedeId });
      onGuardado(kiosco);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el kiosco.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={styles.contenedor}>
      <p className={styles.titulo}>Nuevo kiosco</p>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.fila}>
        <Entrada
          etiqueta="Nombre *"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del kiosco"
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
      </div>

      <div className={styles.acciones}>
        <Boton type="button" variante="secundario" onClick={onCancelar} disabled={guardando}>
          Cancelar
        </Boton>
        <Boton
          type="button"
          cargando={guardando}
          disabled={!nombre.trim() || !sedeId}
          onClick={() => { void guardar(); }}
        >
          Crear kiosco
        </Boton>
      </div>
    </div>
  );
}
