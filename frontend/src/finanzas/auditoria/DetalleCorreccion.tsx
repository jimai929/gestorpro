/**
 * Detalle de un evento de corrección (solo lectura).
 *
 * Muestra la línea de tiempo del dinero — original → reverso → corrección/anulación
 * → monto vigente — más el detalle propio de la entidad (gasto / cierre / pago).
 * Desde aquí NO se puede volver a corregir: es una vista de auditoría.
 */

import { Boton } from '../../core/ui/Boton';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import type { RegistroAuditoria } from './tipos';
import styles from './DetalleCorreccion.module.css';

function formatearDinero(valor: number): string {
  return `B/. ${valor.toFixed(2)}`;
}

function formatearFecha(iso: string): string {
  const soloFecha = iso.slice(0, 10);
  const [anio, mes, dia] = soloFecha.split('-');
  return `${dia}/${mes}/${anio}`;
}

function formatearMomento(iso: string): string {
  const fecha = new Date(iso);
  if (Number.isNaN(fecha.getTime())) return formatearFecha(iso);
  return fecha.toLocaleString('es-PA', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

interface Propiedades {
  registro: RegistroAuditoria;
  onCerrar: () => void;
}

export function DetalleCorreccion({ registro, onCerrar }: Propiedades) {
  const { t } = useTraduccion();
  const esAnulacion = registro.accion === 'anulacion';

  return (
    <div className={styles.fondo} role="dialog" aria-modal="true" aria-labelledby="titulo-detalle-correccion">
      <div className={styles.panel}>
        <div className={styles.encabezado}>
          <div>
            <h2 className={styles.titulo} id="titulo-detalle-correccion">
              {t('fin.aud.detalleTitulo')}
            </h2>
            <p className={styles.subtitulo}>
              <span
                className={esAnulacion ? styles.badgeAnulado : styles.badgeCorregido}
              >
                {t(`fin.aud.accion.${registro.accion}`)}
              </span>
              <span className={styles.modulo}>{t(`fin.aud.entidad.${registro.entidad}`)}</span>
              <span className={styles.objeto}>{registro.descripcion}</span>
            </p>
          </div>
          <button
            type="button"
            className={styles.botonCerrar}
            onClick={onCerrar}
            aria-label={t('comun.cerrar')}
          >
            ×
          </button>
        </div>

        <div className={styles.cuerpo}>
          {/* ── Línea de tiempo del dinero ── */}
          <section className={styles.seccion}>
            <h3 className={styles.tituloSeccion}>{t('fin.aud.lineaTiempo')}</h3>
            <ol className={styles.timeline}>
              <li className={styles.pasoTimeline}>
                <span className={styles.pasoEtiqueta}>{t('fin.aud.pasoOriginal')}</span>
                <span className={styles.pasoMonto}>{formatearDinero(registro.montoOriginal)}</span>
                <span className={styles.pasoFecha}>{formatearFecha(registro.fechaOriginal)}</span>
              </li>
              <li className={styles.pasoTimeline}>
                <span className={styles.pasoEtiqueta}>{t('fin.aud.pasoReverso')}</span>
                <span className={`${styles.pasoMonto} ${styles.pasoNegativo}`}>
                  −{formatearDinero(registro.montoOriginal)}
                </span>
                <span className={styles.pasoFecha}>{formatearMomento(registro.fechaCorreccion)}</span>
              </li>
              {esAnulacion ? (
                <li className={styles.pasoTimeline}>
                  <span className={styles.pasoEtiqueta}>{t('fin.aud.pasoSinNuevo')}</span>
                  <span className={styles.pasoMonto}>—</span>
                  <span className={styles.pasoFecha} />
                </li>
              ) : (
                <li className={styles.pasoTimeline}>
                  <span className={styles.pasoEtiqueta}>{t('fin.aud.pasoCorreccion')}</span>
                  <span className={`${styles.pasoMonto} ${styles.pasoPositivo}`}>
                    {formatearDinero(registro.montoVigente)}
                  </span>
                  <span className={styles.pasoFecha}>{formatearMomento(registro.fechaCorreccion)}</span>
                </li>
              )}
              <li className={`${styles.pasoTimeline} ${styles.pasoFinal}`}>
                <span className={styles.pasoEtiqueta}>{t('fin.aud.pasoVigente')}</span>
                <span className={styles.pasoMonto}>{formatearDinero(registro.montoVigente)}</span>
                <span className={styles.pasoFecha} />
              </li>
            </ol>
          </section>

          {/* ── Datos del evento ── */}
          <section className={styles.seccion}>
            <h3 className={styles.tituloSeccion}>{t('fin.aud.datosCorreccion')}</h3>
            <dl className={styles.datos}>
              <div className={styles.dato}>
                <dt>{t('fin.aud.thMotivo')}</dt>
                <dd>{registro.motivo ?? '—'}</dd>
              </div>
              <div className={styles.dato}>
                <dt>{t('fin.aud.thUsuario')}</dt>
                <dd>{registro.registradoPor.nombre ?? '—'}</dd>
              </div>
              <div className={styles.dato}>
                <dt>{t('fin.aud.diferencia')}</dt>
                <dd>{formatearDinero(registro.diferencia)}</dd>
              </div>
              <div className={styles.dato}>
                <dt>{t('fin.aud.thRegistroOriginal')}</dt>
                <dd className={styles.mono}>{registro.registroOriginalId}</dd>
              </div>
              <div className={styles.dato}>
                <dt>{t('fin.aud.thReverso')}</dt>
                <dd className={styles.mono}>{registro.reversoId}</dd>
              </div>
              {registro.correccionId && (
                <div className={styles.dato}>
                  <dt>{t('fin.aud.thCorreccion')}</dt>
                  <dd className={styles.mono}>{registro.correccionId}</dd>
                </div>
              )}
            </dl>
          </section>

          {/* ── Detalle propio de la entidad ── */}
          <section className={styles.seccion}>
            <h3 className={styles.tituloSeccion}>{t('fin.aud.detalleEntidad')}</h3>
            {registro.detalleEntidad.entidad === 'gasto' && (
              <dl className={styles.datos}>
                <div className={styles.dato}>
                  <dt>{t('fin.gasto.thCategoria')}</dt>
                  <dd>{registro.detalleEntidad.categoria}</dd>
                </div>
                <div className={styles.dato}>
                  <dt>{t('fin.gasto.thDescripcion')}</dt>
                  <dd>{registro.detalleEntidad.descripcion ?? '—'}</dd>
                </div>
                <div className={styles.dato}>
                  <dt>{t('fin.gasto.thFecha')}</dt>
                  <dd>{formatearFecha(registro.detalleEntidad.fecha)}</dd>
                </div>
                <div className={styles.dato}>
                  <dt>{t('fin.gasto.thTipoPago')}</dt>
                  <dd>{registro.detalleEntidad.tipoPago ?? '—'}</dd>
                </div>
              </dl>
            )}

            {registro.detalleEntidad.entidad === 'venta' && (
              <>
                <dl className={styles.datos}>
                  <div className={styles.dato}>
                    <dt>{t('fin.dash.thSede')}</dt>
                    <dd>{registro.detalleEntidad.sede}</dd>
                  </div>
                  <div className={styles.dato}>
                    <dt>{t('fin.dash.thCajera')}</dt>
                    <dd>{registro.detalleEntidad.cajera}</dd>
                  </div>
                  <div className={styles.dato}>
                    <dt>{t('fin.dash.thTurno')}</dt>
                    <dd>{t(`fin.turno.${registro.detalleEntidad.turno}`)}</dd>
                  </div>
                  <div className={styles.dato}>
                    <dt>{t('fin.gasto.thFecha')}</dt>
                    <dd>{formatearFecha(registro.detalleEntidad.fecha)}</dd>
                  </div>
                </dl>
                <div className={styles.arqueoComparacion}>
                  <div>
                    <p className={styles.arqueoTitulo}>{t('fin.aud.arqueoOriginal')}</p>
                    <ul className={styles.arqueoLista}>
                      {registro.detalleEntidad.arqueoOriginal.map((d) => (
                        <li key={`o-${d.tipoArqueo}`}>
                          <span>{t(`fin.arqueo.${d.tipoArqueo}`)}</span>
                          <span>{formatearDinero(d.monto)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className={styles.arqueoTitulo}>{t('fin.aud.arqueoVigente')}</p>
                    {registro.detalleEntidad.arqueoVigente.length === 0 ? (
                      <p className={styles.arqueoVacio}>{t('fin.aud.arqueoAnulado')}</p>
                    ) : (
                      <ul className={styles.arqueoLista}>
                        {registro.detalleEntidad.arqueoVigente.map((d) => (
                          <li key={`v-${d.tipoArqueo}`}>
                            <span>{t(`fin.arqueo.${d.tipoArqueo}`)}</span>
                            <span>{formatearDinero(d.monto)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </>
            )}

            {registro.detalleEntidad.entidad === 'pago' && (
              <dl className={styles.datos}>
                <div className={styles.dato}>
                  <dt>{t('fin.pagos.thProveedor')}</dt>
                  <dd>{registro.detalleEntidad.proveedor}</dd>
                </div>
                <div className={styles.dato}>
                  <dt>{t('fin.pagos.thFactura')}</dt>
                  <dd>{registro.detalleEntidad.numeroFactura}</dd>
                </div>
                <div className={styles.dato}>
                  <dt>{t('fin.ec.saldoInicial')}</dt>
                  <dd>{formatearDinero(registro.detalleEntidad.montoFactura)}</dd>
                </div>
                <div className={styles.dato}>
                  <dt>{t('fin.gasto.thFecha')}</dt>
                  <dd>{formatearFecha(registro.detalleEntidad.fechaPago)}</dd>
                </div>
              </dl>
            )}
          </section>
        </div>

        <div className={styles.pie}>
          <Boton variante="secundario" onClick={onCerrar}>
            {t('comun.cerrar')}
          </Boton>
        </div>
      </div>
    </div>
  );
}
