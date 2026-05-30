/**
 * Formulario de caja registradora: sirve para ALTA y EDICIÓN.
 *
 * - Sin `caja` en props → modo alta (crearCaja).
 * - Con `caja` → modo edición (editarCaja, precarga sus datos).
 *
 * Campos: número (obligatorio), nombre (obligatorio) y sede (select de las
 * sedes activas; obligatorio). La baja/alta lógica (`activo`) se gestiona
 * aparte, con el botón de activar/desactivar de la lista.
 *
 * No usa `<form>` (renderiza `<div>` + botón con `onClick`) a propósito: así
 * puede embeberse en cualquier sitio sin riesgo de anidar formularios.
 */

import { useEffect, useState } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { crearCaja, editarCaja } from './servicioCajas';
import type { Caja } from './tipos';
import { obtenerSedes } from '../sedes/servicioSedes';
import type { Sede } from '../sedes/tipos';
import styles from './FormularioCaja.module.css';

interface PropiedadesFormulario {
  /** Si se pasa, el formulario edita esa caja; si no, crea una nueva. */
  caja?: Caja;
  onGuardado: (caja: Caja) => void;
  onCancelar: () => void;
}

export function FormularioCaja({ caja, onGuardado, onCancelar }: PropiedadesFormulario) {
  const esEdicion = caja !== undefined;

  const [numero, setNumero] = useState(caja?.numero ?? '');
  const [nombre, setNombre] = useState(caja?.nombre ?? '');
  const [sedeId, setSedeId] = useState(caja?.sedeId ?? '');
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let activo = true;
    obtenerSedes()
      .then((lista) => {
        if (activo) setSedes(lista);
      })
      .catch((err) => {
        if (activo) {
          setError(err instanceof Error ? err.message : 'Error al cargar las sedes.');
        }
      });
    return () => {
      activo = false;
    };
  }, []);

  const completo = numero.trim() !== '' && nombre.trim() !== '' && sedeId !== '';

  const guardar = async () => {
    if (!completo) return;
    setGuardando(true);
    setError(null);
    try {
      const resultado = esEdicion
        ? await editarCaja(caja.id, { numero: numero.trim(), nombre: nombre.trim(), sedeId })
        : await crearCaja({ numero: numero.trim(), nombre: nombre.trim(), sedeId });
      onGuardado(resultado);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar la caja.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={styles.contenedor}>
      <p className={styles.titulo}>{esEdicion ? 'Editar caja' : 'Nueva caja'}</p>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.fila}>
        <Entrada
          etiqueta="Número *"
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder="Número de la caja"
          disabled={guardando}
        />
        <Entrada
          etiqueta="Nombre *"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre de la caja"
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
            <option value="">Selecciona una sede</option>
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
          disabled={!completo}
          onClick={() => { void guardar(); }}
        >
          {esEdicion ? 'Guardar cambios' : 'Crear caja'}
        </Boton>
      </div>
    </div>
  );
}
