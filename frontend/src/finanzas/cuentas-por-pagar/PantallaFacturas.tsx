/**
 * Todas las facturas (contado y crédito) — ruta /cuentas-por-pagar/facturas.
 *
 * Antes de esta pantalla, una factura de tipo `contado` (pagada en el acto)
 * era invisible en todo el frontend tras registrarse: la vista
 * `cuenta_por_pagar` la excluye a propósito (nunca genera deuda), así que no
 * aparecía en Cuentas por Pagar, ni en antigüedad, ni en el estado de cuenta
 * del proveedor — solo se sumaba, indistinguible, en el total agregado del
 * dashboard. Esta pantalla lista TODAS las facturas con su estado real, para
 * poder encontrar cualquiera por proveedor/número sin importar cómo se pagó.
 *
 * Rutas de API: GET /compras · GET /proveedores.
 */

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { BadgeEstado } from './BadgeEstado';
import { obtenerCompras, obtenerProveedores } from './servicioCuentas';
import { formatearDinero, formatearFecha } from './utilidades';
import type { Factura, Proveedor, TipoCompra, EstadoCuenta } from './tipos';
import styles from './PantallaFacturas.module.css';

const OPCIONES_TIPO: Array<{ valor: TipoCompra | ''; etiquetaKey: string }> = [
  { valor: '', etiquetaKey: 'fin.facturas.todosTipos' },
  { valor: 'contado', etiquetaKey: 'fin.factura.tipoContado' },
  { valor: 'credito', etiquetaKey: 'fin.factura.tipoCredito' },
];

const OPCIONES_ESTADO: Array<{ valor: EstadoCuenta | ''; etiquetaKey: string }> = [
  { valor: '', etiquetaKey: 'fin.cxp.todosEstados' },
  { valor: 'debido', etiquetaKey: 'fin.estadoCuenta.debido' },
  { valor: 'vencida', etiquetaKey: 'fin.cxp.vencidas' },
  { valor: 'parcial', etiquetaKey: 'fin.cxp.parciales' },
  { valor: 'pagado', etiquetaKey: 'fin.cxp.pagadas' },
];

export function PantallaFacturas() {
  const { t } = useTraduccion();

  // Tema oscuro grafito mientras esta pantalla esté montada (mismo patrón que
  // el resto del módulo de cuentas por pagar).
  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', 'dark');
    return () => {
      if (previo === null) raiz.removeAttribute('data-theme');
      else raiz.setAttribute('data-theme', previo);
    };
  }, []);

  // Filtros — inicializados desde la URL y sincronizados a ella (sobreviven a
  // recargas/volver y son compartibles por enlace, mismo patrón que la
  // pantalla principal de cuentas por pagar). Un valor inválido en la URL
  // cae a "todos".
  const [searchParams, setSearchParams] = useSearchParams();
  const proveedorIdUrl = searchParams.get('proveedorId') ?? '';
  const tipoUrl = searchParams.get('tipo') ?? '';
  const estadoUrl = searchParams.get('estado') ?? '';
  const [proveedorId, setProveedorId] = useState(proveedorIdUrl);
  const [tipo, setTipo] = useState<TipoCompra | ''>(
    OPCIONES_TIPO.some((op) => op.valor === tipoUrl) ? (tipoUrl as TipoCompra | '') : '',
  );
  const [estado, setEstado] = useState<EstadoCuenta | ''>(
    OPCIONES_ESTADO.some((op) => op.valor === estadoUrl) ? (estadoUrl as EstadoCuenta | '') : '',
  );

  useEffect(() => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (proveedorId) p.set('proveedorId', proveedorId);
        else p.delete('proveedorId');
        if (tipo) p.set('tipo', tipo);
        else p.delete('tipo');
        if (estado) p.set('estado', estado);
        else p.delete('estado');
        return p;
      },
      { replace: true },
    );
  }, [proveedorId, tipo, estado, setSearchParams]);

  // Catálogo de proveedores para el filtro (no crítico: si falla, se avisa y
  // el resto de la pantalla sigue usable sin ese filtro).
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [errorProveedores, setErrorProveedores] = useState<string | null>(null);
  const cargarProveedores = useCallback(async () => {
    setErrorProveedores(null);
    try {
      setProveedores(await obtenerProveedores());
    } catch (err) {
      setErrorProveedores(err instanceof Error ? err.message : t('fin.prov.errCargar'));
    }
  }, [t]);
  useEffect(() => {
    void cargarProveedores();
  }, [cargarProveedores]);

  // Lista de facturas
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const cargarFacturas = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setFacturas(
        await obtenerCompras({
          ...(proveedorId ? { proveedorId } : {}),
          ...(tipo ? { tipo } : {}),
          ...(estado ? { estado } : {}),
        }),
      );
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : t('fin.facturas.errCargar'));
    } finally {
      setCargando(false);
    }
  }, [proveedorId, tipo, estado, t]);

  useEffect(() => {
    void cargarFacturas();
  }, [cargarFacturas]);

  const hayFiltros = proveedorId !== '' || tipo !== '' || estado !== '';

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>{t('fin.facturas.titulo')}</h1>
            <p className={styles.subtitulo}>{t('fin.facturas.subtitulo')}</p>
          </div>
        </div>

        {/* ── Filtros ── */}
        <div className={styles.filtros}>
          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="filtro-facturas-proveedor">
              {t('fin.pagos.proveedor')}
            </label>
            <select
              id="filtro-facturas-proveedor"
              className={styles.selectFiltro}
              value={proveedorId}
              onChange={(e) => setProveedorId(e.target.value)}
            >
              <option value="">{t('fin.pagos.todosProveedores')}</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="filtro-facturas-tipo">
              {t('fin.facturas.filtrarPorTipo')}
            </label>
            <select
              id="filtro-facturas-tipo"
              className={styles.selectFiltro}
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoCompra | '')}
            >
              {OPCIONES_TIPO.map((op) => (
                <option key={op.valor} value={op.valor}>
                  {t(op.etiquetaKey)}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="filtro-facturas-estado">
              {t('fin.estado')}
            </label>
            <select
              id="filtro-facturas-estado"
              className={styles.selectFiltro}
              value={estado}
              onChange={(e) => setEstado(e.target.value as EstadoCuenta | '')}
            >
              {OPCIONES_ESTADO.map((op) => (
                <option key={op.valor} value={op.valor}>
                  {t(op.etiquetaKey)}
                </option>
              ))}
            </select>
          </div>
        </div>

        {errorProveedores && (
          <div className={styles.errorSuave}>
            <span>{errorProveedores}</span>
            <Boton variante="secundario" onClick={() => { void cargarProveedores(); }}>
              {t('fin.reintentar')}
            </Boton>
          </div>
        )}

        {/* ── Tabla ── */}
        <div className={styles.tarjeta}>
          {errorCarga && (
            <div className={styles.errorCarga} role="alert">
              <span>{errorCarga}</span>
              <Boton variante="secundario" onClick={() => { void cargarFacturas(); }}>
                {t('fin.reintentar')}
              </Boton>
            </div>
          )}

          {!errorCarga && cargando && (
            <p className={styles.estadoCarga}>{t('fin.facturas.cargandoLista')}</p>
          )}

          {!errorCarga && !cargando && facturas.length === 0 && (
            <p className={styles.estadoVacio}>
              {hayFiltros ? t('fin.facturas.vacioFiltrado') : t('fin.facturas.vacio')}
            </p>
          )}

          {!errorCarga && !cargando && facturas.length > 0 && (
            <div className={styles.contenedorTabla}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>{t('fin.cxp.thProveedor')}</th>
                    <th>{t('fin.cxp.thFactura')}</th>
                    <th>{t('fin.cxp.thTipo')}</th>
                    <th>{t('fin.cxp.thTotal')}</th>
                    <th>{t('fin.cxp.thPagado')}</th>
                    <th>{t('fin.cxp.thSaldo')}</th>
                    <th>{t('fin.cxp.thVencimiento')}</th>
                    <th>{t('fin.estado')}</th>
                  </tr>
                </thead>
                <tbody>
                  {facturas.map((f) => (
                    <tr key={f.compraId}>
                      <td>{f.proveedorNombre}</td>
                      <td>{f.numeroFactura}</td>
                      <td className={styles.celdaSecundaria}>
                        {t(f.tipo === 'contado' ? 'fin.factura.tipoContado' : 'fin.factura.tipoCredito')}
                      </td>
                      <td className={styles.monto}>{formatearDinero(f.montoTotal)}</td>
                      <td className={styles.monto}>{formatearDinero(f.totalPagado)}</td>
                      <td className={styles.monto}>{formatearDinero(f.saldo)}</td>
                      {/* La contado no tiene vencimiento (se paga en el acto): formatearFecha
                          no acepta null, así que el guard va aquí, no en la utilidad. */}
                      <td>{f.fechaVencimiento ? formatearFecha(f.fechaVencimiento) : '—'}</td>
                      <td>
                        <BadgeEstado estado={f.estado} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </LayoutPrincipal>
  );
}
