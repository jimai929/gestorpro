/**
 * Formulario para registrar una nueva factura de compra.
 * Permite seleccionar proveedor (con opción de crear uno nuevo inline),
 * seleccionar sede, ingresar número de factura, monto total y fechas.
 * Llama onRegistrada cuando el POST /compras es exitoso.
 */

import { useState, useEffect, type FormEvent } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { FormularioProveedor } from './FormularioProveedor';
import { obtenerProveedores, obtenerSedes, crearCompra } from './servicioCuentas';
import type { Proveedor, Sede, TipoCompra } from './tipos';
import styles from './FormularioFactura.module.css';

interface PropiedadesFormulario {
  onRegistrada: () => void;
}

export function FormularioFactura({ onRegistrada }: PropiedadesFormulario) {
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
        setError('No se pudieron cargar los datos. Recarga la página.');
      } finally {
        setCargandoSelects(false);
      }
    };
    void cargar();
  }, []);

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
      setError('El monto total debe ser un número positivo.');
      return;
    }

    if (tipo === 'credito' && !fechaVencimiento) {
      setError('Una compra a crédito requiere fecha de vencimiento.');
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
      setError(err instanceof Error ? err.message : 'Error al registrar la factura.');
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
        <h2 className={styles.titulo}>Registrar factura</h2>
      </div>

      <form onSubmit={(e) => { void manejarEnvio(e); }}>
        <div className={styles.cuadricula}>
          {/* Proveedor */}
          <div className={`${styles.grupoProveedor} ${styles.campoCompleto}`}>
            <label className={styles.etiqueta}>Proveedor *</label>
            <div className={styles.filaProveedor}>
              <select
                className={styles.selectProveedor}
                value={proveedorId}
                onChange={(e) => setProveedorId(e.target.value)}
                required
                disabled={cargandoSelects || guardando}
              >
                <option value="">
                  {cargandoSelects ? 'Cargando…' : 'Seleccionar proveedor'}
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
                  + Nuevo
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
            <label className={styles.etiqueta}>Sede *</label>
            <select
              className={styles.select}
              value={sedeId}
              onChange={(e) => setSedeId(e.target.value)}
              required
              disabled={cargandoSelects || guardando}
            >
              <option value="">
                {cargandoSelects ? 'Cargando…' : 'Seleccionar sede'}
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
            etiqueta="Número de factura *"
            value={numeroFactura}
            onChange={(e) => setNumeroFactura(e.target.value)}
            placeholder="Ej. F-2024-001"
            required
            disabled={guardando}
          />

          {/* Monto total */}
          <Entrada
            etiqueta="Monto total (B/.) *"
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
            <label className={styles.etiqueta}>Tipo de compra *</label>
            <select
              className={styles.select}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoCompra)}
              required
              disabled={guardando}
            >
              <option value="credito">Crédito (cuenta por pagar)</option>
              <option value="contado">Contado (pagada en el acto)</option>
            </select>
          </div>

          {/* Fecha de emisión */}
          <Entrada
            etiqueta="Fecha de emisión *"
            type="date"
            value={fechaEmision}
            onChange={(e) => setFechaEmision(e.target.value)}
            required
            disabled={guardando}
          />

          {/* Fecha de vencimiento: solo para crédito (el contado no vence) */}
          {tipo === 'credito' && (
            <Entrada
              etiqueta="Fecha de vencimiento *"
              type="date"
              value={fechaVencimiento}
              onChange={(e) => setFechaVencimiento(e.target.value)}
              required
              disabled={guardando}
            />
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {exito && <p className={styles.exito}>Factura registrada correctamente.</p>}

        <div className={styles.acciones}>
          <Boton
            type="submit"
            cargando={guardando}
            disabled={!formularioCompleto}
          >
            Registrar factura
          </Boton>
        </div>
      </form>
    </div>
  );
}
