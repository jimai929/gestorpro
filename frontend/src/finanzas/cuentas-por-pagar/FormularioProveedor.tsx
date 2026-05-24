/**
 * Formulario inline para crear un proveedor nuevo.
 * Muestra nombre + identificación fiscal opcional.
 * Al crear con éxito, llama onCreado con el proveedor creado.
 */

import { useState, type FormEvent } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { crearProveedor } from './servicioCuentas';
import type { Proveedor } from './tipos';
import styles from './FormularioProveedor.module.css';

interface PropiedadesFormulario {
  onCreado: (proveedor: Proveedor) => void;
  onCancelar: () => void;
}

export function FormularioProveedor({ onCreado, onCancelar }: PropiedadesFormulario) {
  const [nombre, setNombre] = useState('');
  const [identificacionFiscal, setIdentificacionFiscal] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manejarEnvio = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!nombre.trim()) return;

    setGuardando(true);
    setError(null);
    try {
      const proveedor = await crearProveedor({
        nombre: nombre.trim(),
        ...(identificacionFiscal.trim()
          ? { identificacionFiscal: identificacionFiscal.trim() }
          : {}),
      });
      onCreado(proveedor);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear el proveedor.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={(e) => { void manejarEnvio(e); }} className={styles.contenedor}>
      <p className={styles.titulo}>Nuevo proveedor</p>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.fila}>
        <Entrada
          etiqueta="Nombre *"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre del proveedor"
          required
          disabled={guardando}
        />
        <Entrada
          etiqueta="Identificación fiscal"
          value={identificacionFiscal}
          onChange={(e) => setIdentificacionFiscal(e.target.value)}
          placeholder="RUC / NIT (opcional)"
          disabled={guardando}
        />
      </div>

      <div className={styles.acciones}>
        <Boton
          type="button"
          variante="secundario"
          onClick={onCancelar}
          disabled={guardando}
        >
          Cancelar
        </Boton>
        <Boton type="submit" cargando={guardando} disabled={!nombre.trim()}>
          Crear proveedor
        </Boton>
      </div>
    </form>
  );
}
