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

import { useState } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { useNavegacionEnter } from '../../core/ui/useNavegacionEnter';
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
  const { t } = useTraduccion();
  const { ref: refFormulario, onKeyDown } = useNavegacionEnter<HTMLDivElement>();
  const esEdicion = proveedor !== undefined;

  const [nombre, setNombre] = useState(proveedor?.nombre ?? '');
  const [identificacionFiscal, setIdentificacionFiscal] = useState(
    proveedor?.identificacionFiscal ?? '',
  );
  const [telefono, setTelefono] = useState(proveedor?.telefono ?? '');
  const [personaContacto, setPersonaContacto] = useState(proveedor?.personaContacto ?? '');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
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
      setError(err instanceof Error ? err.message : t('fin.prov.errGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div ref={refFormulario} onKeyDown={onKeyDown} className={styles.contenedor}>
      <p className={styles.titulo}>{esEdicion ? t('fin.prov.editar') : t('fin.prov.nuevo')}</p>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.fila}>
        <Entrada
          etiqueta={t('fin.prov.nombre')}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={t('fin.prov.nombrePlaceholder')}
          required
          disabled={guardando}
        />
        <Entrada
          etiqueta={t('fin.prov.idFiscal')}
          value={identificacionFiscal}
          onChange={(e) => setIdentificacionFiscal(e.target.value)}
          placeholder={t('fin.prov.idFiscalPlaceholder')}
          disabled={guardando}
        />
        <Entrada
          etiqueta={t('fin.prov.telefono')}
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder={t('fin.prov.telefonoPlaceholder')}
          disabled={guardando}
        />
        <Entrada
          etiqueta={t('fin.prov.contacto')}
          value={personaContacto}
          onChange={(e) => setPersonaContacto(e.target.value)}
          placeholder={t('fin.prov.contactoPlaceholder')}
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
          {t('comun.cancelar')}
        </Boton>
        <Boton
          type="button"
          data-enter-submit
          cargando={guardando}
          disabled={!nombre.trim()}
          onClick={() => { void guardar(); }}
        >
          {esEdicion ? t('fin.prov.guardarCambios') : t('fin.prov.crear')}
        </Boton>
      </div>
    </div>
  );
}
