/**
 * Formulario para registrar un nuevo gasto.
 *
 * Regla de coherencia de empleado:
 *   - Cuando la categoría seleccionada tiene esPagoEmpleado === true,
 *     se muestran los campos empleadoId (obligatorio) y tipoPago (opcional).
 *   - Cuando esPagoEmpleado === false, esos campos se ocultan y NO se envían.
 *
 * El backend valida la misma regla y devuelve 400 con { mensaje } si falla.
 */

import { useState, useEffect, type FormEvent } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { obtenerCategoriasGasto, obtenerSedes, registrarGasto } from './servicioGastos';
import { fechaHoy } from './utilidades';
import type { CategoriaGasto, Sede } from './tipos';
import styles from './FormularioGasto.module.css';

interface PropiedadesFormulario {
  onRegistrado: () => void;
}

const OPCIONES_TIPO_PAGO = [
  { valor: '', etiquetaKey: 'fin.gasto.tipoPago.sinEspecificar' },
  { valor: 'quincenal', etiquetaKey: 'fin.gasto.tipoPago.quincenal' },
  { valor: 'mensual', etiquetaKey: 'fin.gasto.tipoPago.mensual' },
  { valor: 'semanal', etiquetaKey: 'fin.gasto.tipoPago.semanal' },
  { valor: 'adelanto', etiquetaKey: 'fin.gasto.tipoPago.adelanto' },
  { valor: 'liquidacion', etiquetaKey: 'fin.gasto.tipoPago.liquidacion' },
  { valor: 'otro', etiquetaKey: 'fin.gasto.tipoPago.otro' },
];

export function FormularioGasto({ onRegistrado }: PropiedadesFormulario) {
  const { t } = useTraduccion();
  // Datos de selects
  const [categorias, setCategorias] = useState<CategoriaGasto[]>([]);
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [cargandoSelects, setCargandoSelects] = useState(true);

  // Campos del formulario
  const [categoriaId, setCategoriaId] = useState('');
  const [sedeId, setSedeId] = useState('');
  const [monto, setMonto] = useState('');
  const [fechaOperacion, setFechaOperacion] = useState(fechaHoy());
  const [descripcion, setDescripcion] = useState('');
  const [empleadoId, setEmpleadoId] = useState('');
  const [tipoPago, setTipoPago] = useState('');

  // Estado de UI
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  // Categoría actualmente seleccionada (para determinar esPagoEmpleado)
  const categoriaSeleccionada = categorias.find((c) => c.id === categoriaId) ?? null;
  const esCategoriaPagoEmpleado = categoriaSeleccionada?.esPagoEmpleado === true;

  // Cargar selects al montar
  useEffect(() => {
    const cargar = async () => {
      try {
        const [listaCategorias, listaSedes] = await Promise.all([
          obtenerCategoriasGasto(),
          obtenerSedes(),
        ]);
        setCategorias(listaCategorias);
        setSedes(listaSedes);
      } catch {
        setError(t('fin.factura.errCargarDatos'));
      } finally {
        setCargandoSelects(false);
      }
    };
    void cargar();
  }, [t]);

  // Limpiar campos de empleado al cambiar de categoría
  useEffect(() => {
    setEmpleadoId('');
    setTipoPago('');
  }, [categoriaId]);

  const limpiarFormulario = () => {
    setCategoriaId('');
    setSedeId('');
    setMonto('');
    setFechaOperacion(fechaHoy());
    setDescripcion('');
    setEmpleadoId('');
    setTipoPago('');
  };

  const manejarEnvio = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);
    setExito(false);

    const montoNum = parseFloat(monto);
    if (isNaN(montoNum) || montoNum <= 0) {
      setError(t('fin.gasto.errMontoPositivo'));
      return;
    }

    // Construir el cuerpo respetando la regla de coherencia:
    // solo enviar empleadoId y tipoPago cuando la categoría lo requiere.
    const cuerpo = {
      categoriaId,
      sedeId,
      monto: montoNum,
      fechaOperacion,
      ...(descripcion.trim() ? { descripcion: descripcion.trim() } : {}),
      ...(esCategoriaPagoEmpleado && empleadoId.trim()
        ? { empleadoId: empleadoId.trim() }
        : {}),
      ...(esCategoriaPagoEmpleado && tipoPago
        ? { tipoPago }
        : {}),
    };

    setGuardando(true);
    try {
      await registrarGasto(cuerpo);
      limpiarFormulario();
      setExito(true);
      onRegistrado();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fin.gasto.errRegistrar'));
    } finally {
      setGuardando(false);
    }
  };

  const formularioCompleto =
    categoriaId &&
    sedeId &&
    monto &&
    fechaOperacion &&
    // Si es pago de empleado, empleadoId es obligatorio
    (!esCategoriaPagoEmpleado || empleadoId.trim());

  return (
    <div className={styles.tarjeta}>
      <div className={styles.encabezado}>
        <h2 className={styles.titulo}>{t('fin.gasto.registrar')}</h2>
      </div>

      <form onSubmit={(e) => { void manejarEnvio(e); }}>
        <div className={styles.cuadricula}>
          {/* Categoría */}
          <div className={styles.grupoSelect}>
            <label className={styles.etiqueta}>{t('fin.gasto.categoria')}</label>
            <select
              className={styles.select}
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
              required
              disabled={cargandoSelects || guardando}
            >
              <option value="">
                {cargandoSelects ? t('comun.cargando') : t('fin.gasto.selCategoria')}
              </option>
              {categorias.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </div>

          {/* Sede */}
          <div className={styles.grupoSelect}>
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

          {/* Monto */}
          <Entrada
            etiqueta={t('fin.gasto.monto')}
            type="number"
            value={monto}
            onChange={(e) => setMonto(e.target.value)}
            placeholder="0.00"
            min="0.01"
            step="0.01"
            required
            disabled={guardando}
          />

          {/* Fecha de operación */}
          <Entrada
            etiqueta={t('fin.gasto.fechaOperacion')}
            type="date"
            value={fechaOperacion}
            onChange={(e) => setFechaOperacion(e.target.value)}
            required
            disabled={guardando}
          />

          {/* Descripción (opcional, ancho completo) */}
          <div className={styles.campoCompleto}>
            <Entrada
              etiqueta={t('fin.gasto.descripcion')}
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={t('fin.gasto.descripcionPlaceholder')}
              disabled={guardando}
            />
          </div>

          {/* ── Bloque de empleado: solo visible cuando esPagoEmpleado === true ── */}
          {esCategoriaPagoEmpleado && (
            <div className={styles.bloqueEmpleado}>
              <p className={styles.etiquetaBloque}>{t('fin.gasto.datosEmpleado')}</p>

              <Entrada
                etiqueta={t('fin.gasto.idEmpleado')}
                value={empleadoId}
                onChange={(e) => setEmpleadoId(e.target.value)}
                placeholder={t('fin.gasto.idEmpleadoPlaceholder')}
                required
                disabled={guardando}
              />

              <div className={styles.grupoSelect}>
                <label className={styles.etiqueta}>{t('fin.gasto.tipoPagoLabel')}</label>
                <select
                  className={styles.select}
                  value={tipoPago}
                  onChange={(e) => setTipoPago(e.target.value)}
                  disabled={guardando}
                >
                  {OPCIONES_TIPO_PAGO.map((op) => (
                    <option key={op.valor} value={op.valor}>
                      {t(op.etiquetaKey)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </div>

        {error && <p className={styles.error}>{error}</p>}
        {exito && <p className={styles.exito}>{t('fin.gasto.exito')}</p>}

        <div className={styles.acciones}>
          <Boton
            type="submit"
            cargando={guardando}
            disabled={!formularioCompleto}
          >
            {t('fin.gasto.registrar')}
          </Boton>
        </div>
      </form>
    </div>
  );
}
