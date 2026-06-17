/**
 * Formulario para registrar una nueva factura de compra.
 * Permite seleccionar proveedor (con opción de crear uno nuevo inline),
 * seleccionar sede, ingresar número de factura, monto total y fechas.
 * Llama onRegistrada cuando el POST /compras es exitoso.
 */

import { useState, useEffect, type FormEvent } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { FormularioProveedor } from './FormularioProveedor';
import { obtenerProveedores, obtenerSedes, crearCompra } from './servicioCuentas';
import type { Proveedor, Sede, TipoCompra } from './tipos';
import styles from './FormularioFactura.module.css';

interface PropiedadesFormulario {
  onRegistrada: () => void;
}

export function FormularioFactura({ onRegistrada }: PropiedadesFormulario) {
  const { t } = useTraduccion();
  // Datos de selects
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [cargandoSelects, setCargandoSelects] = useState(true);

  // Campos del formulario
  const [proveedorId, setProveedorId] = useState('');
  const [sedeId, setSedeId] = useState('');
  const [numeroFactura, setNumeroFactura] = useState('');
  const [montoTotal, setMontoTotal] = useState('');
  const [tipo, setTipo] = useState<TipoCompra>('credito');
  const [fechaEmision, setFechaEmision] = useState('');
  const [fechaVencimiento, setFechaVencimiento] = useState('');

  // Estado de UI
  const [mostrarFormProveedor, setMostrarFormProveedor] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  // Cargar selects al montar
  useEffect(() => {
    const cargar = async () => {
      try {
        const [listaProv, listaSedes] = await Promise.all([
          obtenerProveedores({ soloActivos: true }),
          obtenerSedes(),
        ]);
        setProveedores(listaProv);
        setSedes(listaSedes);
      } catch {
        setError(t('fin.factura.errCargarDatos'));
      } finally {
        setCargandoSelects(false);
      }
    };
    void cargar();
  }, [t]);

  /** Cuando se crea un proveedor nuevo, lo agrega a la lista y lo selecciona. */
  const manejarProveedorCreado = (proveedor: Proveedor) => {
    setProveedores((prev) => [...prev, proveedor]);
    setProveedorId(proveedor.id);
    setMostrarFormProveedor(false);
  };

  const manejarEnvio = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);
    setExito(false);

    const monto = parseFloat(montoTotal);
    if (isNaN(monto) || monto <= 0) {
      setError(t('fin.factura.errMontoPositivo'));
      return;
    }

    if (tipo === 'credito' && !fechaVencimiento) {
      setError(t('fin.factura.errVencimiento'));
      return;
    }

    setGuardando(true);
    try {
      await crearCompra({
        proveedorId,
        sedeId,
        numeroFactura: numeroFactura.trim(),
        montoTotal: monto,
        tipo,
        fechaEmision,
        // El contado no tiene vencimiento (se paga en el acto).
        ...(tipo === 'credito' ? { fechaVencimiento } : {}),
      });
      // Limpiar formulario tras éxito
      setProveedorId('');
      setSedeId('');
      setNumeroFactura('');
      setMontoTotal('');
      setTipo('credito');
      setFechaEmision('');
      setFechaVencimiento('');
      setExito(true);
      onRegistrada();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fin.factura.errRegistrar'));
    } finally {
      setGuardando(false);
    }
  };

  const formularioCompleto =
    proveedorId &&
    sedeId &&
    numeroFactura.trim() &&
    montoTotal &&
    fechaEmision &&
    (tipo === 'contado' || fechaVencimiento);

  return (
    <div className={styles.tarjeta}>
      <div className={styles.encabezado}>
        <h2 className={styles.titulo}>{t('fin.factura.registrar')}</h2>
      </div>

      <form onSubmit={(e) => { void manejarEnvio(e); }}>
        <div className={styles.cuadricula}>
          {/* Proveedor */}
          <div className={`${styles.grupoProveedor} ${styles.campoCompleto}`}>
            <label className={styles.etiqueta}>{t('fin.factura.proveedor')}</label>
            <div className={styles.filaProveedor}>
              <select
                className={styles.selectProveedor}
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                required
                disabled={cargandoSelects || guardando}
              >
                <option value="">
                  {cargandoSelects ? t('comun.cargando') : t('fin.factura.selProveedor')}
                </option>
                {proveedores.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre}
                    {p.identificacionFiscal ? ` — ${p.identificacionFiscal}` : ''}
                  </option>
                ))}
              </select>
              {!mostrarFormProveedor && (
                <Boton
                  type="button"
                  variante="secundario"
                  onClick={() => setMostrarFormProveedor(true)}
                  disabled={guardando}
                >
                  {t('fin.factura.btnNuevo')}
                </Boton>
              )}
            </div>
          </div>

          {/* Formulario inline de nuevo proveedor */}
          {mostrarFormProveedor && (
            <div className={styles.campoCompleto}>
              <FormularioProveedor
                onGuardado={manejarProveedorCreado}
                onCancelar={() => setMostrarFormProveedor(false)}
              />
            </div>
          )}

          {/* Sede */}
          <div className={styles.grupoProveedor}>
            <label className={styles.etiqueta}>{t('fin.factura.sede')}</label>
            <select
              className={styles.select}
              value={sedeId}
              onChange={(e) => setSedeId(e.target.value)}
              required
              disabled={cargandoSelects || guardando}
            >
              <option value="">
                {cargandoSelects ? t('comun.cargando') : t('fin.factura.selSede')}
              </option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Número de factura */}
          <Entrada
            etiqueta={t('fin.factura.numero')}
            value={numeroFactura}
            onChange={(e) => setNumeroFactura(e.target.value)}
            placeholder={t('fin.factura.numeroPlaceholder')}
            required
            disabled={guardando}
          />

          {/* Monto total */}
          <Entrada
            etiqueta={t('fin.factura.montoTotal')}
            type="number"
            value={montoTotal}
            onChange={(e) => setMontoTotal(e.target.value)}
            placeholder="0.00"
            min="0.01"
            step="0.01"
            required
            disabled={guardando}
          />

          {/* Tipo de compra: contado (pagada en el acto) o crédito (deuda) */}
          <div className={styles.grupoProveedor}>
            <label className={styles.etiqueta}>{t('fin.factura.tipoCompra')}</label>
            <select
              className={styles.select}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoCompra)}
              required
              disabled={guardando}
            >
              <option value="credito">{t('fin.factura.tipoCredito')}</option>
              <option value="contado">{t('fin.factura.tipoContado')}</option>
            </select>
          </div>

          {/* Fecha de emisión */}
          <Entrada
            etiqueta={t('fin.factura.fechaEmision')}
            type="date"
            value={fechaEmision}
            onChange={(e) => setFechaEmision(e.target.value)}
            required
            disabled={guardando}
          />

          {/* Fecha de vencimiento: solo para crédito (el contado no vence) */}
          {tipo === 'credito' && (
            <Entrada
              etiqueta={t('fin.factura.fechaVencimiento')}
              type="date"
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
              required
              disabled={guardando}
            />
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {exito && <p className={styles.exito}>{t('fin.factura.exito')}</p>}

        <div className={styles.acciones}>
          <Boton
            type="submit"
            cargando={guardando}
            disabled={!formularioCompleto}
          >
            {t('fin.factura.registrar')}
          </Boton>
        </div>
      </form>
    </div>
  );
}
