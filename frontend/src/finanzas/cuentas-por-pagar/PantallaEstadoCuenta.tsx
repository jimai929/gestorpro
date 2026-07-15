/**
 * Estado de cuenta de proveedor — ruta /estado-cuenta.
 *
 * Documento de conciliación: se elige proveedor y período, se genera y queda una
 * cuenta que se puede leer, imprimir (o guardar como PDF desde el navegador) y
 * exportar a CSV. Muestra el saldo inicial (deuda anterior real, no cero), cada
 * movimiento con su saldo corriente y el saldo final.
 *
 * Las correcciones no se ocultan: un pago corregido descuenta su importe corregido y
 * uno anulado no descuenta nada — igual que en el resto del módulo; el registro
 * original nunca se sobrescribe.
 *
 * API: GET /cuentas-por-pagar/estado-cuenta · GET /proveedores.
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Printer, Download, PieChart } from 'lucide-react';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { obtenerEstadoCuenta, obtenerProveedores } from './servicioCuentas';
import { descargarCsvEstadoCuenta } from './csvEstadoCuenta';
import { formatearDinero, formatearFecha } from './utilidades';
import type { EstadoCuentaProveedor, Proveedor, MovimientoEstadoCuenta } from './tipos';
import styles from './PantallaEstadoCuenta.module.css';

/** Clave i18n del badge de estado de un movimiento corregido/anulado. */
const CLAVE_ESTADO: Record<string, string> = {
  vigente: 'fin.corr.estadoVigente',
  corregido: 'fin.corr.estadoCorregido',
  anulado: 'fin.corr.estadoAnulado',
};

/** Fecha de hoy en YYYY-MM-DD (para el pie "generado el"). */
function hoyIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function PantallaEstadoCuenta() {
  const { t } = useTraduccion();

  // Tema oscuro en pantalla.
  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', 'dark');
    return () => {
      if (previo === null) raiz.removeAttribute('data-theme');
      else raiz.setAttribute('data-theme', previo);
    };
  }, []);

  // Al IMPRIMIR se quita `data-theme` para que los tokens caigan al tema claro (papel
  // blanco, texto oscuro) sin escribir un solo color literal; se restaura al terminar.
  useEffect(() => {
    const alImprimir = () => document.documentElement.removeAttribute('data-theme');
    const alTerminar = () => document.documentElement.setAttribute('data-theme', 'dark');
    window.addEventListener('beforeprint', alImprimir);
    window.addEventListener('afterprint', alTerminar);
    return () => {
      window.removeEventListener('beforeprint', alImprimir);
      window.removeEventListener('afterprint', alTerminar);
    };
  }, []);

  // Catálogo de proveedores del selector.
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [errorProveedores, setErrorProveedores] = useState<string | null>(null);

  // Formulario. El proveedor puede venir en la URL (?proveedorId=) desde la
  // antigüedad, así al llegar ya queda seleccionado (falta elegir el período).
  const [searchParams] = useSearchParams();
  const [proveedorId, setProveedorId] = useState(searchParams.get('proveedorId') ?? '');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');

  // Resultado
  const [estado, setEstado] = useState<EstadoCuentaProveedor | null>(null);
  const [generadoEn, setGeneradoEn] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // El estado de cuenta en pantalla corresponde a unos filtros CONCRETOS: si el
  // usuario los cambia, deja de ser el informe de lo que se ve arriba. No se borra
  // (sigue siendo útil), pero se marca como desactualizado para que nadie lo lea
  // como si fuera el del proveedor/período nuevos.
  const [desactualizado, setDesactualizado] = useState(false);

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

  const puedeGenerar = proveedorId !== '' && desde !== '' && hasta !== '' && !cargando;

  const generar = async () => {
    // Sin proveedor NO se consulta (el backend lo exige y aquí no se finge una carga).
    if (!puedeGenerar) return;
    setCargando(true);
    setError(null);
    try {
      const resultado = await obtenerEstadoCuenta({ proveedorId, desde, hasta });
      setEstado(resultado);
      setGeneradoEn(hoyIso());
      setDesactualizado(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('fin.ec.errGenerar'));
    } finally {
      setCargando(false);
    }
  };

  /** Cambiar un filtro marca el informe visible como "hay que regenerar". */
  const alCambiarFiltro = <T,>(fijar: (v: T) => void) => (valor: T) => {
    fijar(valor);
    if (estado) setDesactualizado(true);
  };

  const imprimir = () => {
    // Impresión del NAVEGADOR (desde su diálogo se elige "Guardar como PDF"). No se
    // genera ningún PDF en el servidor ni se añade una librería para ello.
    window.print();
  };

  const exportarCsv = () => {
    if (!estado) return;
    descargarCsvEstadoCuenta(estado, t);
  };

  const filaMovimiento = (m: MovimientoEstadoCuenta, indice: number) => (
    <tr
      key={`${m.pagoId ?? m.compraId}-${indice}`}
      className={m.estado === 'anulado' ? styles.filaAnulada : undefined}
    >
      <td>{formatearFecha(m.fecha)}</td>
      <td className={styles.celdaDocumento}>{m.documento}</td>
      <td>
        <div className={styles.concepto}>
          <span>{m.concepto}</span>
          {m.estado && m.estado !== 'vigente' && (
            <span
              className={m.estado === 'anulado' ? styles.badgeAnulado : styles.badgeCorregido}
            >
              {t(CLAVE_ESTADO[m.estado] ?? 'fin.corr.estadoVigente')}
            </span>
          )}
          {m.motivoCorreccion && (
            <span className={styles.motivo}>{m.motivoCorreccion}</span>
          )}
          {m.registradoPor && (
            <span className={styles.registradoPor}>
              {t('fin.ec.registradoPor', { nombre: m.registradoPor })}
            </span>
          )}
        </div>
      </td>
      <td className={styles.debito}>{m.debito ? formatearDinero(m.debito) : '—'}</td>
      <td className={styles.credito}>{m.credito ? formatearDinero(m.credito) : '—'}</td>
      <td className={styles.saldo}>{formatearDinero(m.saldo)}</td>
    </tr>
  );

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        {/* ── Encabezado de pantalla (no se imprime) ── */}
        <div className={`${styles.encabezado} ${styles.noImprimir}`}>
          <div>
            <h1 className={styles.tituloPagina}>{t('fin.ec.titulo')}</h1>
            <p className={styles.subtitulo}>{t('fin.ec.subtitulo')}</p>
            {/* Volver a la mesa de trabajo de antigüedad. */}
            <Link to="/cuentas-por-pagar/antiguedad" className={styles.enlaceVolver}>
              <PieChart size={14} strokeWidth={1.75} aria-hidden /> {t('fin.ant.verAntiguedad')}
            </Link>
          </div>
          {estado && (
            <div className={styles.accionesDocumento}>
              <Boton variante="secundario" onClick={imprimir}>
                <Printer size={16} strokeWidth={1.75} aria-hidden /> {t('fin.ec.imprimir')}
              </Boton>
              <Boton variante="secundario" onClick={exportarCsv}>
                <Download size={16} strokeWidth={1.75} aria-hidden /> {t('fin.ec.exportarCsv')}
              </Boton>
            </div>
          )}
        </div>

        {/* ── Filtros (no se imprimen) ── */}
        <div className={`${styles.filtros} ${styles.noImprimir}`}>
          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="ec-proveedor">
              {t('fin.ec.proveedor')}
            </label>
            <select
              id="ec-proveedor"
              className={styles.selectFiltro}
              value={proveedorId}
              onChange={(e) => alCambiarFiltro(setProveedorId)(e.target.value)}
            >
              <option value="">{t('fin.ec.selProveedor')}</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="ec-desde">
              {t('comun.desde')}
            </label>
            <input
              id="ec-desde"
              type="date"
              className={styles.inputFiltro}
              value={desde}
              onChange={(e) => alCambiarFiltro(setDesde)(e.target.value)}
            />
          </div>

          <div className={styles.grupoFiltro}>
            <label className={styles.etiquetaFiltro} htmlFor="ec-hasta">
              {t('comun.hasta')}
            </label>
            <input
              id="ec-hasta"
              type="date"
              className={styles.inputFiltro}
              value={hasta}
              onChange={(e) => alCambiarFiltro(setHasta)(e.target.value)}
            />
          </div>

          <Boton onClick={() => { void generar(); }} disabled={!puedeGenerar} cargando={cargando}>
            {t('fin.ec.generar')}
          </Boton>
        </div>

        {errorProveedores && (
          <div className={`${styles.errorSuave} ${styles.noImprimir}`}>
            <span>{errorProveedores}</span>
            <Boton variante="secundario" onClick={() => { void cargarProveedores(); }}>
              {t('fin.reintentar')}
            </Boton>
          </div>
        )}

        {error && (
          <div className={`${styles.errorCarga} ${styles.noImprimir}`} role="alert">
            <span>{error}</span>
            <Boton variante="secundario" onClick={() => { void generar(); }} disabled={!puedeGenerar}>
              {t('fin.reintentar')}
            </Boton>
          </div>
        )}

        {!estado && !cargando && !error && (
          <p className={`${styles.estadoVacio} ${styles.noImprimir}`}>{t('fin.ec.instruccion')}</p>
        )}

        {desactualizado && estado && (
          <div className={`${styles.avisoDesactualizado} ${styles.noImprimir}`} role="status">
            {t('fin.ec.desactualizado')}
          </div>
        )}

        {/* ── DOCUMENTO (lo único que se imprime) ── */}
        {estado && (
          <div className={styles.documento}>
            <div className={styles.cabeceraDocumento}>
              <div>
                {estado.empresa && (
                  <p className={styles.empresa}>{estado.empresa.nombre}</p>
                )}
                <h2 className={styles.tituloDocumento}>{t('fin.ec.titulo')}</h2>
              </div>
              <div className={styles.metaDocumento}>
                <p>
                  <strong>{t('fin.ec.periodo')}:</strong>{' '}
                  {formatearFecha(estado.periodo.desde)} — {formatearFecha(estado.periodo.hasta)}
                </p>
                {generadoEn && (
                  <p>
                    <strong>{t('fin.ec.generadoEl')}:</strong> {formatearFecha(generadoEn)}
                  </p>
                )}
              </div>
            </div>

            <div className={styles.datosProveedor}>
              <p className={styles.nombreProveedor}>{estado.proveedor.nombre}</p>
              <p className={styles.contactoProveedor}>
                {estado.proveedor.identificacionFiscal && (
                  <span>
                    {t('fin.prov.idFiscal')}: {estado.proveedor.identificacionFiscal}
                  </span>
                )}
                {estado.proveedor.telefono && (
                  <span>
                    {t('fin.prov.telefono')}: {estado.proveedor.telefono}
                  </span>
                )}
                {estado.proveedor.personaContacto && (
                  <span>
                    {t('fin.prov.contacto')}: {estado.proveedor.personaContacto}
                  </span>
                )}
              </p>
            </div>

            {/* Resumen */}
            <div className={styles.resumen}>
              <div className={styles.tarjetaResumen}>
                <span className={styles.etiquetaResumen}>{t('fin.ec.saldoInicial')}</span>
                <span className={styles.valorResumen}>{formatearDinero(estado.saldoInicial)}</span>
              </div>
              <div className={styles.tarjetaResumen}>
                <span className={styles.etiquetaResumen}>{t('fin.ec.resCompras')}</span>
                <span className={styles.valorResumen}>{formatearDinero(estado.resumen.compras)}</span>
              </div>
              <div className={styles.tarjetaResumen}>
                <span className={styles.etiquetaResumen}>{t('fin.ec.resPagos')}</span>
                <span className={styles.valorResumen}>{formatearDinero(estado.resumen.pagos)}</span>
              </div>
              <div className={styles.tarjetaResumen}>
                <span className={styles.etiquetaResumen}>{t('fin.ec.resCorrecciones')}</span>
                <span
                  className={
                    estado.resumen.correccionesAnulaciones !== 0
                      ? styles.valorResumenAlerta
                      : styles.valorResumen
                  }
                >
                  {formatearDinero(estado.resumen.correccionesAnulaciones)}
                </span>
              </div>
              <div className={styles.tarjetaResumenFinal}>
                <span className={styles.etiquetaResumen}>{t('fin.ec.saldoFinal')}</span>
                <span className={styles.valorResumenFinal}>
                  {formatearDinero(estado.saldoFinal)}
                </span>
              </div>
            </div>

            {/* Detalle */}
            <div className={styles.contenedorTabla}>
              <table className={styles.tabla}>
                <thead>
                  <tr>
                    <th>{t('fin.ec.thFecha')}</th>
                    <th>{t('fin.ec.thDocumento')}</th>
                    <th>{t('fin.ec.thConcepto')}</th>
                    <th className={styles.colImporte}>{t('fin.ec.thDebito')}</th>
                    <th className={styles.colImporte}>{t('fin.ec.thCredito')}</th>
                    <th className={styles.colImporte}>{t('fin.ec.thSaldo')}</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Saldo inicial: siempre presente, aunque no haya movimientos. */}
                  <tr className={styles.filaSaldoInicial}>
                    <td>{formatearFecha(estado.periodo.desde)}</td>
                    <td>—</td>
                    <td>{t('fin.ec.saldoInicial')}</td>
                    <td className={styles.debito}>—</td>
                    <td className={styles.credito}>—</td>
                    <td className={styles.saldo}>{formatearDinero(estado.saldoInicial)}</td>
                  </tr>

                  {estado.movimientos.map(filaMovimiento)}

                  {estado.movimientos.length === 0 && (
                    <tr>
                      <td colSpan={6} className={styles.sinMovimientos}>
                        {t('fin.ec.sinMovimientos')}
                      </td>
                    </tr>
                  )}

                  <tr className={styles.filaSaldoFinal}>
                    <td>{formatearFecha(estado.periodo.hasta)}</td>
                    <td>—</td>
                    <td>{t('fin.ec.saldoFinal')}</td>
                    <td className={styles.debito}>—</td>
                    <td className={styles.credito}>—</td>
                    <td className={styles.saldo}>{formatearDinero(estado.saldoFinal)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className={`${styles.notaImpresion} ${styles.noImprimir}`}>
              {t('fin.ec.notaPdf')}
            </p>
          </div>
        )}
      </div>
    </LayoutPrincipal>
  );
}
