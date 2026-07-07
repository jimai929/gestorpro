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
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { BadgeEstado } from './BadgeEstado';
import { FormularioFactura } from './FormularioFactura';
import { DialogoPago } from './DialogoPago';
import { obtenerCuentasPorPagar } from './servicioCuentas';
import { formatearDinero, formatearFecha } from './utilidades';
import type { CuentaPorPagar } from './tipos';
import styles from './PantallaCuentasPorPagar.module.css';

const OPCIONES_ESTADO: { valor: string; etiquetaKey: string }[] = [
  { valor: '', etiquetaKey: 'fin.cxp.todosEstados' },
  { valor: 'debido', etiquetaKey: 'fin.estadoCuenta.debido' },
  { valor: 'vencida', etiquetaKey: 'fin.cxp.vencidas' },
  { valor: 'parcial', etiquetaKey: 'fin.cxp.parciales' },
  { valor: 'pagado', etiquetaKey: 'fin.cxp.pagadas' },
];

export function PantallaCuentasPorPagar() {
  const { t } = useTraduccion();

  // ── Tema oscuro grafito ──────────────────────────────────────────────────
  // Esta pantalla se muestra SIEMPRE en grafito oscuro. Monta data-theme="dark"
  // en <html> mientras está montada y restaura el valor previo al desmontar.
  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', 'dark');
    return () => {
      if (previo === null) raiz.removeAttribute('data-theme');
      else raiz.setAttribute('data-theme', previo);
    };
  }, []);

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
        err instanceof Error ? err.message : t('fin.cxp.errCargar'),
      );
    } finally {
      setCargando(false);
    }
  }, [filtroEstado, t]);

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
        <nav className={styles.navFinanzas} aria-label={t('fin.ariaNavFinanzas')}>
          <NavLink
            to="/cuentas-por-pagar"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            {t('nav.cuentasPorPagar')}
          </NavLink>
          <NavLink
            to="/proveedores"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            {t('fin.navProveedores')}
          </NavLink>
          <NavLink
            to="/gastos"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            {t('nav.gastos')}
          </NavLink>
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              isActive
                ? `${styles.enlaceNav} ${styles.enlaceNavActivo}`
                : styles.enlaceNav
            }
          >
            {t('nav.dashboard')}
          </NavLink>
        </nav>

        {/* Encabezado */}
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>{t('nav.cuentasPorPagar')}</h1>
            <p className={styles.subtitulo}>
              {t('fin.cxp.subtitulo')}
            </p>
          </div>
          <Boton
            onClick={() => setMostrarFormFactura((prev) => !prev)}
          >
            {mostrarFormFactura ? t('fin.cerrarFormulario') : t('fin.cxp.btnRegistrar')}
          </Boton>
        </div>

        {/* Formulario de nueva factura */}
        {mostrarFormFactura && (
          <FormularioFactura onRegistrada={manejarFacturaRegistrada} />
        )}

        {/* Filtros */}
        <div className={styles.filtros}>
          <span className={styles.etiquetaFiltro}>{t('fin.cxp.filtrarPorEstado')}</span>
          {OPCIONES_ESTADO.map((op) => (
            <button
              key={op.valor}
              type="button"
              className={styles.selectFiltro}
              style={
                filtroEstado === op.valor
                  ? {
                      borderColor: 'var(--color-primary)',
                      background: 'var(--color-primary-bg)',
                      color: 'var(--color-primary-text)',
                    }
                  : {}
              }
              onClick={() => setFiltroEstado(op.valor)}
            >
              {t(op.etiquetaKey)}
            </button>
          ))}
        </div>

        {/* Tabla de cuentas */}
        <div className={styles.tarjeta}>
          {errorCarga && (
            <div className={styles.errorCarga}>
              <span>{errorCarga}</span>
              <Boton variante="secundario" onClick={() => { void cargarCuentas(); }}>
                {t('fin.reintentar')}
              </Boton>
            </div>
          )}

          {!errorCarga && cargando && (
            <p className={styles.estadoCarga}>{t('fin.cxp.cargandoLista')}</p>
          )}

          {!errorCarga && !cargando && cuentas.length === 0 && (
            <p className={styles.estadoVacio}>
              {filtroEstado
                ? t('fin.cxp.vacioFiltrado', { estado: filtroEstado })
                : t('fin.cxp.vacio')}
            </p>
          )}

          {!errorCarga && !cargando && cuentas.length > 0 && (
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>{t('fin.cxp.thProveedor')}</th>
                  <th>{t('fin.cxp.thFactura')}</th>
                  <th>{t('fin.cxp.thTotal')}</th>
                  <th>{t('fin.cxp.thPagado')}</th>
                  <th>{t('fin.cxp.thSaldo')}</th>
                  <th>{t('fin.cxp.thVencimiento')}</th>
                  <th>{t('fin.estado')}</th>
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
                          {t('fin.cxp.abonar')}
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
