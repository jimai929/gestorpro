/**
 * Formulario de proveedor: sirve para ALTA y EDICIÓN.
 *
 * - Sin `proveedor` en props → modo alta (crea uno nuevo).
 * - Con `proveedor` → modo edición (precarga sus datos y guarda los cambios).
 *
 * Campos: nombre (obligatorio), identificación fiscal (RUC), teléfono y persona
 * de contacto (opcionales). La baja/alta lógica (`activo`) se gestiona aparte,
 * con el botón de activar/desactivar de la lista.
 */

import { useState, type FormEvent } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { crearProveedor, editarProveedor } from './servicioCuentas';
import type { Proveedor } from './tipos';
import styles from './FormularioProveedor.module.css';

interface PropiedadesFormulario {
  /** Si se pasa, el formulario edita ese proveedor; si no, crea uno nuevo. */
  proveedor?: Proveedor;
  onGuardado: (proveedor: Proveedor) => void;
  onCancelar: () => void;
}

/** Cadena vacía → null (para borrar un campo opcional); si no, el texto recortado. */
function aNullable(valor: string): string | null {
  const limpio = valor.trim();
  return limpio === '' ? null : limpio;
}

export function FormularioProveedor({ proveedor, onGuardado, onCancelar }: PropiedadesFormulario) {
  const esEdicion = proveedor !== undefined;

  const [nombre, setNombre] = useState(proveedor?.nombre ?? '');
  const [identificacionFiscal, setIdentificacionFiscal] = useState(
    proveedor?.identificacionFiscal ?? '',
  );
  const [telefono, setTelefono] = useState(proveedor?.telefono ?? '');
  const [personaContacto, setPersonaContacto] = useState(proveedor?.personaContacto ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manejarEnvio = async (evento: FormEvent) => {
    evento.preventDefault();
    if (!nombre.trim()) return;

    setGuardando(true);
    setError(null);
    try {
      const resultado = esEdicion
        ? await editarProveedor(proveedor.id, {
            nombre: nombre.trim(),
            identificacionFiscal: aNullable(identificacionFiscal),
            telefono: aNullable(telefono),
            personaContacto: aNullable(personaContacto),
          })
        : await crearProveedor({
            nombre: nombre.trim(),
            ...(identificacionFiscal.trim()
              ? { identificacionFiscal: identificacionFiscal.trim() }
              : {}),
            ...(telefono.trim() ? { telefono: telefono.trim() } : {}),
            ...(personaContacto.trim() ? { personaContacto: personaContacto.trim() } : {}),
          });
      onGuardado(resultado);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar el proveedor.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <form onSubmit={(e) => { void manejarEnvio(e); }} className={styles.contenedor}>
      <p className={styles.titulo}>{esEdicion ? 'Editar proveedor' : 'Nuevo proveedor'}</p>

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
        <Entrada
          etiqueta="Teléfono"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="Ej. 6000-0000 (opcional)"
          disabled={guardando}
        />
        <Entrada
          etiqueta="Persona de contacto"
          value={personaContacto}
          onChange={(e) => setPersonaContacto(e.target.value)}
          placeholder="Nombre del contacto (opcional)"
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
          {esEdicion ? 'Guardar cambios' : 'Crear proveedor'}
        </Boton>
      </div>
    </form>
  );
}
