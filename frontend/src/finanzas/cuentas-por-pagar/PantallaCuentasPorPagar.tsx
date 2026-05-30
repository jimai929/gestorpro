/**
 * Pantalla principal del módulo de cuentas por pagar.
 *
 * Muestra:
 * - Lista de cuentas por pagar con estado coloreado.
 * - Formulario para registrar una nueva factura.
 * - Diálogo para registrar un abono sobre una factura.
 *
 * Rutas de API que utiliza:
 *   GET  /cuentas-por-pagar   → lista con saldo y estado
 *   GET  /proveedores         → para el formulario de factura
 *   GET  /sedes               → para el formulario de factura
 *   POST /compras             → registrar factura
 *   POST /proveedores         → crear proveedor
 *   POST /pagos               → registrar abono
 */

import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { BadgeEstado } from './BadgeEstado';
import { FormularioFactura } from './FormularioFactura';
import { DialogoPago } from './DialogoPago';
import { obtenerCuentasPorPagar } from './servicioCuentas';
import { formatearDinero, formatearFecha } from './utilidades';
import type { CuentaPorPagar } from './tipos';
import styles from './PantallaCuentasPorPagar.module.css';

const OPCIONES_ESTADO: { valor: string; etiqueta: string }[] = [
  { valor: '', etiqueta: 'Todos los estados' },
  { valor: 'debido', etiqueta: 'Por pagar' },
  { valor: 'vencida', etiqueta: 'Vencidas' },
  { valor: 'parcial', etiqueta: 'Parciales' },
  { valor: 'pagado', etiqueta: 'Pagadas' },
];

export function PantallaCuentasPorPagar() {
  // Lista de cuentas
  const [cuentas, setCuentas] = useState<CuentaPorPagar[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // Filtros
  const [filtroEstado, setFiltroEstado] = useState('');

  // Estado de UI
  const [mostrarFormFactura, setMostrarFormFactura] = useState(false);
  const [cuentaParaPago, setCuentaParaPago] = useState<CuentaPorPagar | null>(null);

  /** Carga (o recarga) la lista de cuentas por pagar. */
  const cargarCuentas = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const lista = await obtenerCuentasPorPagar(
        filtroEstado ? { estado: filtroEstado } : undefined,
      );
      setCuentas(lista);
    } catch (err) {
      setErrorCarga(
        err instanceof Error ? err.message : 'Error al cargar las cuentas por pagar.',
      );
    } finally {
      setCargando(false);
    }
  }, [filtroEstado]);

  // Cargar al montar y al cambiar filtros
  useEffect(() => {
    void cargarCuentas();
  }, [cargarCuentas]);

  /** Tras registrar una factura, refrescar la lista. */
  const manejarFacturaRegistrada = () => {
    setMostrarFormFactura(false);
    void cargarCuentas();
  };

  /** Tras registrar un abono, cerrar el diálogo y refrescar. */
  const manejarPagoRegistrado = () => {
    setCuentaParaPago(null);
    void cargarCuentas();
  };

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        {/* Barra de navegación de finanzas */}
        <nav className={styles.navFinanzas} aria-label="Módulos de finanzas">
          <NavLink
            to="/cuentas-por-pagar"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            Cuentas por pagar
          </NavLink>
          <NavLink
            to="/proveedores"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            Proveedores
          </NavLink>
          <NavLink
            to="/gastos"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            Gastos
          </NavLink>
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            Dashboard
          </NavLink>
        </nav>

        {/* Encabezado */}
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>Cuentas por pagar</h1>
            <p className={styles.subtitulo}>
              Gestión de facturas y abonos a proveedores
            </p>
          </div>
          <Boton
            onClick={() => setMostrarFormFactura((prev) => !prev)}
          >
            {mostrarFormFactura ? 'Cerrar formulario' : '+ Registrar factura'}
          </Boton>
        </div>

        {/* Formulario de nueva factura */}
        {mostrarFormFactura && (
          <FormularioFactura onRegistrada={manejarFacturaRegistrada} />
        )}

        {/* Filtros */}
        <div className={styles.filtros}>
          <span className={styles.etiquetaFiltro}>Filtrar por estado:</span>
          {OPCIONES_ESTADO.map((op) => (
            <button
              key={op.valor}
              type="button"
              className={styles.selectFiltro}
              style={
                filtroEstado === op.valor
                  ? { borderColor: '#1a56db', background: '#eff6ff', color: '#1a56db' }
                  : {}
              }
              onClick={() => setFiltroEstado(op.valor)}
            >
              {op.etiqueta}
            </button>
          ))}
        </div>

        {/* Tabla de cuentas */}
        <div className={styles.tarjeta}>
          {errorCarga && (
            <div className={styles.errorCarga}>
              <span>{errorCarga}</span>
              <Boton variante="secundario" onClick={() => { void cargarCuentas(); }}>
                Reintentar
              </Boton>
            </div>
          )}

          {!errorCarga && cargando && (
            <p className={styles.estadoCarga}>Cargando cuentas…</p>
          )}

          {!errorCarga && !cargando && cuentas.length === 0 && (
            <p className={styles.estadoVacio}>
              No hay cuentas por pagar
              {filtroEstado ? ` con estado "${filtroEstado}"` : ''}.
            </p>
          )}

          {!errorCarga && !cargando && cuentas.length > 0 && (
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Proveedor</th>
                  <th>Factura</th>
                  <th>Total</th>
                  <th>Pagado</th>
                  <th>Saldo</th>
                  <th>Vencimiento</th>
                  <th>Estado</th>
                  <th className={styles.colAccion}></th>
                </tr>
              </thead>
              <tbody>
                {cuentas.map((cuenta) => (
                  <tr key={cuenta.compraId}>
                    <td>{cuenta.proveedorNombre}</td>
                    <td>{cuenta.numeroFactura}</td>
                    <td className={styles.monto}>{formatearDinero(cuenta.montoTotal)}</td>
                    <td className={styles.monto}>{formatearDinero(cuenta.totalPagado)}</td>
                    <td className={`${styles.monto} ${styles.saldoPendiente}`}>
                      {formatearDinero(cuenta.saldo)}
                    </td>
                    <td>{formatearFecha(cuenta.fechaVencimiento)}</td>
                    <td>
                      <BadgeEstado estado={cuenta.estado} />
                    </td>
                    <td className={styles.colAccion}>
                      {cuenta.estado !== 'pagado' && (
                        <button
                          type="button"
                          className={styles.botonAbonar}
                          onClick={() => setCuentaParaPago(cuenta)}
                        >
                          Abonar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Diálogo de pago */}
      {cuentaParaPago && (
        <DialogoPago
          cuenta={cuentaParaPago}
          onPagado={manejarPagoRegistrado}
          onCerrar={() => setCuentaParaPago(null)}
        />
      )}
    </LayoutPrincipal>
  );
}
