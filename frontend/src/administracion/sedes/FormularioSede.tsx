/**
 * Formulario de sede: sirve para ALTA y EDICIÓN.
 *
 * - Sin `sede` en props → modo alta.
 * - Con `sede` → modo edición (precarga sus datos).
 *
 * Campos: nombre (obligatorio) y modo de excepción del fichaje (pin / supervisor
 * / ambos). La baja/alta lógica (`activo`) se gestiona aparte, con el botón de
 * activar/desactivar de la lista.
 *
 * No usa `<form>` (renderiza `<div>` + botón con `onClick`) a propósito: así
 * puede embeberse en cualquier sitio sin riesgo de anidar formularios.
 */

import { useState } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { crearSede, editarSede } from './servicioSedes';
import { MODOS_EXCEPCION, type Sede, type ModoExcepcion } from './tipos';
import styles from './FormularioSede.module.css';

interface PropiedadesFormulario {
  /** Si se pasa, el formulario edita esa sede; si no, crea una nueva. */
  sede?: Sede;
  onGuardado: (sede: Sede) => void;
  onCancelar: () => void;
}

export function FormularioSede({ sede, onGuardado, onCancelar }: PropiedadesFormulario) {
  const { t } = useTraduccion();
  const esEdicion = sede !== undefined;

  const [nombre, setNombre] = useState(sede?.nombre ?? '');
  const [modoExcepcion, setModoExcepcion] = useState<ModoExcepcion>(sede?.modoExcepcion ?? 'pin');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const resultado = esEdicion
        ? await editarSede(sede.id, { nombre: nombre.trim(), modoExcepcion })
        : await crearSede({ nombre: nombre.trim(), modoExcepcion });
      onGuardado(resultado);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adm.sede.errGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={styles.contenedor}>
      <p className={styles.titulo}>{esEdicion ? t('adm.sede.editar') : t('adm.sede.nueva')}</p>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.fila}>
        <Entrada
          etiqueta={t('adm.sede.nombre')}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={t('adm.sede.nombrePlaceholder')}
          disabled={guardando}
        />
        <div className={styles.grupoSelect}>
          <label className={styles.etiqueta}>{t('adm.sede.modoExcepcion')}</label>
          <select
            className={styles.select}
            value={modoExcepcion}
            onChange={(e) => setModoExcepcion(e.target.value as ModoExcepcion)}
            disabled={guardando}
          >
            {MODOS_EXCEPCION.map((m) => (
              <option key={m.valor} value={m.valor}>
                {t(`adm.modo.${m.valor}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className={styles.acciones}>
        <Boton type="button" variante="secundario" onClick={onCancelar} disabled={guardando}>
          {t('comun.cancelar')}
        </Boton>
        <Boton
          type="button"
          cargando={guardando}
          disabled={!nombre.trim()}
          onClick={() => { void guardar(); }}
        >
          {esEdicion ? t('adm.sede.guardarCambios') : t('adm.sede.crear')}
        </Boton>
      </div>
    </div>
  );
}
