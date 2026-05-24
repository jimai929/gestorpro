/**
 * Diálogo modal para registrar un abono sobre una factura.
 * Muestra la información de la cuenta y un campo de monto.
 * Llama onPagado cuando el POST /pagos es exitoso.
 */

import { useState, type FormEvent } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { registrarPago } from './servicioCuentas';
import { formatearDinero } from './utilidades';
import type { CuentaPorPagar } from './tipos';
import styles from './DialogoPago.module.css';

interface PropiedadesDialogo {
  cuenta: CuentaPorPagar;
  onPagado: () => void;
  onCerrar: () => void;
}

export function DialogoPago({ cuenta, onPagado, onCerrar }: PropiedadesDialogo) {
  const [monto, setMonto] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manejarEnvio = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);

    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      setError('Ingresa un monto válido mayor que cero.');
      return;
    }
    if (montoNum > cuenta.saldo) {
      setError(`El monto no puede exceder el saldo (${formatearDinero(cuenta.saldo)}).`);
      return;
    }

    setGuardando(true);
    try {
      await registrarPago({ compraId: cuenta.compraId, monto: montoNum });
      onPagado();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al registrar el abono.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className={styles.fondo} role="dialog" aria-modal="true" aria-labelledby="titulo-dialogo">
      <div className={styles.dialogo}>
        <div className={styles.encabezado}>
          <h2 className={styles.titulo} id="titulo-dialogo">Registrar abono</h2>
          <button
            type="button"
            className={styles.botonCerrar}
            onClick={onCerrar}
            aria-label="Cerrar"
            disabled={guardando}
          >
            ×
          </button>
        </div>

        {/* Información de la factura */}
        <div className={styles.info}>
          <div className={styles.infoFila}>
            <span className={styles.infoEtiqueta}>Proveedor:</span>
            <span className={styles.infoValor}>{cuenta.proveedorNombre}</span>
          </div>
          <div className={styles.infoFila}>
            <span className={styles.infoEtiqueta}>Factura:</span>
            <span className={styles.infoValor}>{cuenta.numeroFactura}</span>
          </div>
          <div className={styles.infoFila}>
            <span className={styles.infoEtiqueta}>Total factura:</span>
            <span className={styles.infoValor}>{formatearDinero(cuenta.montoTotal)}</span>
          </div>
          <div className={styles.infoFila}>
            <span className={styles.infoEtiqueta}>Ya pagado:</span>
            <span className={styles.infoValor}>{formatearDinero(cuenta.totalPagado)}</span>
          </div>
          <div className={styles.infoFila}>
            <span className={styles.infoEtiqueta}>Saldo pendiente:</span>
            <span className={`${styles.infoValor} ${styles.saldoDestacado}`}>
              {formatearDinero(cuenta.saldo)}
            </span>
          </div>
        </div>

        {/* Formulario de abono */}
        <form onSubmit={(e) => { void manejarEnvio(e); }}>
          <Entrada
            etiqueta="Monto del abono (B/.) *"
            type="number"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
            min="0.01"
            max={cuenta.saldo}
            step="0.01"
            required
            disabled={guardando}
            autoFocus
          />

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.acciones}>
            <Boton
              type="button"
              variante="secundario"
              onClick={onCerrar}
              disabled={guardando}
            >
              Cancelar
            </Boton>
            <Boton
              type="submit"
              cargando={guardando}
              disabled={!monto}
            >
              Registrar abono
            </Boton>
          </div>
        </form>
      </div>
    </div>
  );
}
