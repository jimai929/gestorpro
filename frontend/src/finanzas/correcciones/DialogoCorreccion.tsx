/**
 * Diálogo de CORRECCIÓN de un movimiento de dinero (gasto o cierre de caja).
 *
 * El dinero es inmutable: aquí NO se edita el movimiento original. Se elige entre
 *   - CORREGIR: el movimiento existía pero con otro importe → reverso + corrección.
 *   - ANULAR:   el movimiento no debía existir → solo reverso (queda en 0).
 * El motivo es obligatorio (queda en la auditoría). Un movimiento admite UNA sola
 * corrección: si ya fue corregido, el backend responde 409 y se muestra tal cual.
 *
 * No se cierra ni anuncia éxito antes del 201: el error queda visible y el
 * diálogo abierto para reintentar. El botón se deshabilita mientras envía.
 */

import { useState } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { useModal } from '../../core/ui/useModal';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { TIPOS_ARQUEO } from '../dashboard/tipos';
import type { LineaArqueo, TipoArqueo } from '../dashboard/tipos';
import { corregirMovimiento, type EntidadCorregible } from './servicioCorrecciones';
import styles from './DialogoCorreccion.module.css';

type Modo = 'corregir' | 'anular';

interface PropiedadesBase {
  movimientoId: string;
  /** Descripción legible del movimiento (categoría/fecha o sede/turno/cajera). */
  descripcion: string;
  /** Monto actualmente vigente, para mostrar el "antes". */
  montoOriginal: number;
  onCerrar: () => void;
  /** Se invoca SOLO tras el 201: el llamador refresca su lista. */
  onCorregido: () => void;
}

interface PropiedadesGasto extends PropiedadesBase {
  entidad: Extract<EntidadCorregible, 'gasto' | 'pago'>;
}

interface PropiedadesVenta extends PropiedadesBase {
  entidad: Extract<EntidadCorregible, 'venta'>;
  /** Arqueo vigente del cierre: precarga los campos del arqueo corregido. */
  arqueoOriginal: LineaArqueo[];
}

export type PropiedadesDialogoCorreccion = PropiedadesGasto | PropiedadesVenta;

/** Formatea un número como moneda panameña. */
function formatearDinero(valor: number): string {
  return `B/. ${valor.toFixed(2)}`;
}

export function DialogoCorreccion(props: PropiedadesDialogoCorreccion) {
  const { entidad, movimientoId, descripcion, montoOriginal, onCerrar, onCorregido } = props;
  const { t } = useTraduccion();
  const esVenta = entidad === 'venta';

  const [modo, setModo] = useState<Modo>('corregir');
  const [motivo, setMotivo] = useState('');
  const [monto, setMonto] = useState(esVenta ? '' : String(montoOriginal));
  // Arqueo corregido del cierre: mapa tipo → texto tecleado, precargado con el vigente.
  const [arqueo, setArqueo] = useState<Record<string, string>>(() => {
    if (!esVenta) return {};
    const inicial: Record<string, string> = {};
    for (const linea of props.arqueoOriginal) {
      inicial[linea.tipoArqueo] = String(linea.monto);
    }
    return inicial;
  });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Accesibilidad compartida del modal (Escape, trampa de foco, foco de vuelta).
  // Mientras se envía NO se cierra (misma regla que el botón Cancelar).
  const refModal = useModal<HTMLDivElement>(() => {
    if (!guardando) onCerrar();
  });

  // Total del arqueo tecleado (los campos vacíos cuentan como cero): el operador ve
  // en vivo el total que va a quedar, igual que en el formulario de cierre.
  const totalArqueo = TIPOS_ARQUEO.reduce((acc, { tipo }) => {
    const n = parseFloat(arqueo[tipo] ?? '');
    return acc + (isNaN(n) ? 0 : n);
  }, 0);

  const montoNuevo = parseFloat(monto);
  const montoValido = !isNaN(montoNuevo) && montoNuevo >= 0;

  /** ¿El formulario está listo para enviarse? (el motivo SIEMPRE es obligatorio) */
  const puedeEnviar = (() => {
    if (!motivo.trim()) return false;
    if (modo === 'anular') return true;
    if (esVenta) return TIPOS_ARQUEO.some(({ tipo }) => (arqueo[tipo] ?? '').trim() !== '');
    return montoValido;
  })();

  const enviar = async () => {
    if (!puedeEnviar || guardando) return;
    setGuardando(true);
    setError(null);

    // Construir el cuerpo. En modo ANULAR se omiten monto y arqueo: el backend
    // interpreta su ausencia como anulación pura (solo reverso).
    let detallesCorregidos: LineaArqueo[] | undefined;
    if (modo === 'corregir' && esVenta) {
      const lineas: LineaArqueo[] = [];
      for (const { tipo } of TIPOS_ARQUEO) {
        const texto = (arqueo[tipo] ?? '').trim();
        if (texto === '') continue;
        const n = parseFloat(texto);
        if (isNaN(n) || n < 0) {
          setError(t('fin.corr.errMontoTipo', { tipo: t(`fin.arqueo.${tipo}`) }));
          setGuardando(false);
          return;
        }
        lineas.push({ tipoArqueo: tipo as TipoArqueo, monto: n });
      }
      detallesCorregidos = lineas;
    }

    try {
      await corregirMovimiento({
        entidad,
        movimientoId,
        motivo: motivo.trim(),
        ...(modo === 'corregir' && !esVenta ? { montoCorregido: montoNuevo } : {}),
        ...(detallesCorregidos ? { detallesCorregidos } : {}),
      });
      onCorregido(); // solo tras el 201
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fin.corr.errGenerico'));
      setGuardando(false);
    }
  };

  return (
    <div
      ref={refModal}
      className={styles.fondoModal}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-dialogo-correccion"
    >
      <div className={styles.modal}>
        <h2 className={styles.tituloModal} id="titulo-dialogo-correccion">
          {t('fin.corr.titulo')}
        </h2>
        <p className={styles.subtituloModal}>
          {descripcion}
          <br />
          {t('fin.corr.montoActual')}{' '}
          <strong className={styles.montoOriginal}>{formatearDinero(montoOriginal)}</strong>
        </p>

        <p className={styles.aviso}>{t('fin.corr.avisoInmutable')}</p>

        {/* Modo: corregir el importe o anular el movimiento entero */}
        <div className={styles.modos} role="radiogroup" aria-label={t('fin.corr.titulo')}>
          <label className={styles.opcionModo}>
            <input
              type="radio"
              name="modo-correccion"
              value="corregir"
              checked={modo === 'corregir'}
              onChange={() => setModo('corregir')}
              disabled={guardando}
            />
            <span>
              <strong>{t('fin.corr.modoCorregir')}</strong>
              <span className={styles.ayudaModo}>{t('fin.corr.modoCorregirAyuda')}</span>
            </span>
          </label>
          <label className={styles.opcionModo}>
            <input
              type="radio"
              name="modo-correccion"
              value="anular"
              checked={modo === 'anular'}
              onChange={() => setModo('anular')}
              disabled={guardando}
            />
            <span>
              <strong>{t('fin.corr.modoAnular')}</strong>
              <span className={styles.ayudaModo}>{t('fin.corr.modoAnularAyuda')}</span>
            </span>
          </label>
        </div>

        {/* Importe corregido: monto único (gasto/pago) o arqueo por tipo (cierre) */}
        {modo === 'corregir' && !esVenta && (
          <Entrada
            etiqueta={t('fin.corr.montoCorregido')}
            type="number"
            min="0"
            step="0.01"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            disabled={guardando}
            error={monto !== '' && !montoValido ? t('fin.corr.errMontoValido') : undefined}
          />
        )}

        {modo === 'corregir' && esVenta && (
          <div className={styles.arqueo}>
            <span className={styles.etiquetaModal}>{t('fin.corr.arqueoCorregido')}</span>
            <div className={styles.arqueoCampos}>
              {TIPOS_ARQUEO.map(({ tipo }) => (
                <Entrada
                  key={tipo}
                  etiqueta={t(`fin.arqueo.${tipo}`)}
                  type="number"
                  min="0"
                  step="0.01"
                  value={arqueo[tipo] ?? ''}
                  onChange={(e) => setArqueo((prev) => ({ ...prev, [tipo]: e.target.value }))}
                  disabled={guardando}
                />
              ))}
            </div>
            <div className={styles.totalArqueo}>
              <span>{t('fin.corr.totalCorregido')}</span>
              <strong>{formatearDinero(totalArqueo)}</strong>
            </div>
          </div>
        )}

        {/* Motivo: obligatorio, queda en la auditoría */}
        <div>
          <label htmlFor="motivo-correccion" className={styles.etiquetaModal}>
            {t('fin.corr.motivo')}
          </label>
          <textarea
            id="motivo-correccion"
            className={styles.textareaModal}
            placeholder={t('fin.corr.motivoPlaceholder')}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            disabled={guardando}
            autoFocus
          />
        </div>

        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}

        <div className={styles.botonesModal}>
          <Boton type="button" variante="secundario" onClick={onCerrar} disabled={guardando}>
            {t('comun.cancelar')}
          </Boton>
          <Boton
            type="button"
            variante={modo === 'anular' ? 'peligro' : 'primario'}
            cargando={guardando}
            disabled={!puedeEnviar}
            onClick={() => { void enviar(); }}
          >
            {modo === 'anular' ? t('fin.corr.confirmarAnular') : t('fin.corr.confirmarCorregir')}
          </Boton>
        </div>
      </div>
    </div>
  );
}
