/**
 * Formulario de categoría de gasto: ALTA y EDICIÓN.
 *
 * - Sin `categoria` en props → modo alta.
 * - Con `categoria` → modo edición (precarga el nombre).
 *
 * `esPagoEmpleado` solo se decide AL CREAR: cambiarlo en una categoría ya usada
 * rompería la coherencia de los gastos ya registrados con ella, así que en edición
 * ni se muestra (el backend tampoco lo acepta en el PATCH).
 */

import { useState } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { crearCategoria, actualizarCategoria } from './servicioGastos';
import type { CategoriaGasto } from './tipos';
import styles from './FormularioCategoria.module.css';

interface PropiedadesFormulario {
  /** Si se pasa, edita esa categoría; si no, crea una nueva. */
  categoria?: CategoriaGasto;
  onGuardado: (categoria: CategoriaGasto) => void;
  onCancelar: () => void;
}

export function FormularioCategoria({ categoria, onGuardado, onCancelar }: PropiedadesFormulario) {
  const { t } = useTraduccion();
  const esEdicion = categoria !== undefined;

  const [nombre, setNombre] = useState(categoria?.nombre ?? '');
  const [esPagoEmpleado, setEsPagoEmpleado] = useState(categoria?.esPagoEmpleado ?? false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (!nombre.trim()) return;
    setGuardando(true);
    setError(null);
    try {
      const resultado = esEdicion
        ? await actualizarCategoria(categoria.id, { nombre: nombre.trim() })
        : await crearCategoria({ nombre: nombre.trim(), esPagoEmpleado });
      onGuardado(resultado);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fin.categoria.errGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={styles.contenedor}>
      <p className={styles.titulo}>
        {esEdicion ? t('fin.categoria.tituloEditar') : t('fin.categoria.tituloNueva')}
      </p>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.fila}>
        <Entrada
          etiqueta={t('fin.categoria.nombre')}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={t('fin.categoria.nombrePlaceholder')}
          disabled={guardando}
        />
      </div>

      {!esEdicion && (
        <div className={styles.opcionPago}>
          <input
            id="cat-pago-empleado"
            type="checkbox"
            className={styles.checkbox}
            checked={esPagoEmpleado}
            onChange={(e) => setEsPagoEmpleado(e.target.checked)}
            disabled={guardando}
          />
          <label htmlFor="cat-pago-empleado" className={styles.etiquetaCheck}>
            {t('fin.categoria.esPagoEmpleado')}
            <span className={styles.ayuda}>{t('fin.categoria.esPagoEmpleadoAyuda')}</span>
          </label>
        </div>
      )}

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
          {esEdicion ? t('fin.categoria.guardar') : t('fin.categoria.crear')}
        </Boton>
      </div>
    </div>
  );
}
