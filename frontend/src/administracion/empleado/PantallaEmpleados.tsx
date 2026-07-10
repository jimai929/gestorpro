/**
 * Pantalla de gestión de empleados (área de Administración).
 *
 * Lista empleados (activos e inactivos), permite alta, edición y baja lógica
 * (`activo`, nunca borrado: fichajes, jornadas, saldos y los snapshots de
 * `cerradoPor` lo referencian). Gestiona los secretos: muestra/imprime el QR
 * (imagen escaneable), lo regenera (revoca el anterior) y resetea el PIN. Los
 * empleados inactivos no aparecen en los selectores (cobro, cierre).
 *
 * API: GET /empleados?incluirInactivos · POST /empleados · PUT /empleados/:id ·
 *      GET|POST /empleados/:id/qr · POST /empleados/:id/pin
 */

import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router';
import QRCode from 'qrcode';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { useAuth } from '../../core/auth/ContextoAuth';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { FormularioEmpleado } from './FormularioEmpleado';
import { obtenerSedes } from '../sedes/servicioSedes';
import {
  obtenerEmpleados,
  editarEmpleado,
  obtenerQr,
  regenerarQr,
  resetearPin,
} from './servicioEmpleados';
import type { Empleado, EmpleadoCreado } from './tipos';
import styles from './PantallaEmpleados.module.css';

interface EstadoQr {
  empleadoId: string;
  nombre: string;
  token: string;
}

export function PantallaEmpleados() {
  const { t } = useTraduccion();
  const { usuario } = useAuth();
  // UI de conveniencia alineada con los guards del backend (la frontera real):
  //  - gestión (crear/editar/activar) = `soloGestion` → administrador o supervisor;
  //  - secretos (QR / reset de PIN)   = `soloAdmin`  → solo administrador.
  const puedeGestionar = usuario?.rol === 'administrador' || usuario?.rol === 'supervisor';
  const esAdministrador = usuario?.rol === 'administrador';

  // Tema oscuro mientras esta pantalla esté montada; restaura el previo al salir.
  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', 'dark');
    return () => {
      if (previo === null) raiz.removeAttribute('data-theme');
      else raiz.setAttribute('data-theme', previo);
    };
  }, []);

  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [sedes, setSedes] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false);
  const [empleadoEditar, setEmpleadoEditar] = useState<Empleado | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);
  // Aviso de alta exitosa cuando la recarga posterior falló (ver manejarGuardado).
  const [avisoAlta, setAvisoAlta] = useState<string | null>(null);

  // Modal de QR (imagen escaneable).
  const [qr, setQr] = useState<EstadoQr | null>(null);
  const [qrImagen, setQrImagen] = useState<string | null>(null);
  // Fallo del DIBUJO de la imagen (no de la API): sin él, `qrImagen` null no
  // distingue "generando" de "falló" y el modal se queda en "Generando…" eterno.
  const [qrImagenError, setQrImagenError] = useState<string | null>(null);
  const [regenerando, setRegenerando] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);

  // Modal de reset de PIN.
  const [pinDe, setPinDe] = useState<Empleado | null>(null);
  const [pinValor, setPinValor] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
  const [guardandoPin, setGuardandoPin] = useState(false);

  // Devuelve `true` si la recarga tuvo éxito, para que quien la dispara tras una
  // mutación (p. ej. el alta) decida si seguir (abrir el QR) o no abrir nada
  // sobre una tabla en estado de error.
  const cargar = useCallback(async (): Promise<boolean> => {
    if (!puedeGestionar) return false; // el empleado se redirige: no cargar nada
    setCargando(true);
    setErrorCarga(null);
    try {
      const [lista, listaSedes] = await Promise.all([
        obtenerEmpleados({ incluirInactivos: true }),
        obtenerSedes({ incluirInactivas: true }),
      ]);
      setEmpleados(lista);
      setSedes(Object.fromEntries(listaSedes.map((s) => [s.id, s.nombre])));
      setAvisoAlta(null); // la fila ya es visible: el aviso de alta deja de hacer falta
      return true;
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : t('adm.emp.errCargar'));
      return false;
    } finally {
      setCargando(false);
    }
  }, [t, puedeGestionar]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Dibuja el token como imagen. Resetea al empezar: distingue "generando" de
  // "falló" (con reintento que NO rota el token) y no deja en pantalla el QR
  // anterior (ya revocado) mientras se dibuja el nuevo tras un Regenerar.
  const generarImagen = useCallback((token: string) => {
    setQrImagen(null);
    setQrImagenError(null);
    void QRCode.toDataURL(token, { width: 240, margin: 1 })
      .then(setQrImagen)
      .catch(() => setQrImagenError(t('adm.emp.errQrImagen')));
  }, [t]);

  // Render del QR como imagen cuando cambia el token mostrado.
  useEffect(() => {
    if (!qr) {
      setQrImagen(null);
      setQrImagenError(null);
      return;
    }
    generarImagen(qr.token);
  }, [qr, generarImagen]);

  const manejarGuardado = (resultado: Empleado | EmpleadoCreado) => {
    setMostrarFormNuevo(false);
    setEmpleadoEditar(null);
    // Tras un alta, mostrar el QR del nuevo empleado para imprimirlo — pero solo
    // si la lista se recargó bien (no abrir el modal QR sobre una tabla en estado
    // de error) y solo para el ADMINISTRADOR: el modal es de secretos (Regenerar
    // llama a rutas `soloAdmin`), así que a un supervisor no se le abre; su
    // feedback es la fila nueva en la tabla. El empleado YA se creó; con la
    // recarga fallida se ve su error y botón de reintento.
    void cargar().then((recargaOk) => {
      if (recargaOk && 'qrToken' in resultado && esAdministrador) {
        setQrError(null);
        setQr({ empleadoId: resultado.id, nombre: resultado.nombre, token: resultado.qrToken });
      } else if (!recargaOk && 'qrToken' in resultado) {
        // Recarga fallida tras el alta: decir que el alta SÍ se completó, para que
        // quien gestiona (admin o supervisor) no la dé por fallida y la repita.
        setAvisoAlta(t('adm.emp.avisoAltaOk'));
      } else if (!recargaOk) {
        // Simetría para la EDICIÓN (H17): el PUT sí se aplicó aunque la recarga fallara.
        setAvisoAlta(t('adm.emp.avisoEdicionOk'));
      }
    });
  };

  const abrirEdicion = (emp: Empleado) => {
    setMostrarFormNuevo(false);
    setEmpleadoEditar(emp);
  };

  const alternarActivo = async (emp: Empleado) => {
    setActualizandoId(emp.id);
    setErrorCarga(null);
    try {
      await editarEmpleado(emp.id, { activo: !emp.activo });
      await cargar();
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : t('adm.emp.errActualizar'));
    } finally {
      setActualizandoId(null);
    }
  };

  const verQr = async (emp: Empleado) => {
    setErrorCarga(null);
    try {
      const { qrToken } = await obtenerQr(emp.id);
      setQrError(null);
      setQr({ empleadoId: emp.id, nombre: emp.nombre, token: qrToken });
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : t('adm.emp.errObtenerQr'));
    }
  };

  const cerrarQr = () => {
    setQr(null);
    setQrError(null);
  };

  const rotarQr = async () => {
    if (!qr) return;
    setRegenerando(true);
    setQrError(null);
    try {
      const { qrToken } = await regenerarQr(qr.empleadoId);
      setQr({ ...qr, token: qrToken });
    } catch (err) {
      // No tragar el error: en una rotación de secreto, el admin DEBE saber que
      // el QR anterior NO se revocó (el mostrado sigue siendo el válido).
      setQrError(err instanceof Error ? err.message : t('adm.emp.errRegenerarQr'));
    } finally {
      setRegenerando(false);
    }
  };

  const imprimirQr = () => {
    if (!qrImagen || !qr) return;
    const v = window.open('', '_blank', 'width=420,height=560');
    if (!v) return;
    v.document.write(
      `<html><head><title>QR ${qr.nombre}</title></head>` +
        `<body style="text-align:center;font-family:sans-serif;padding:28px;">` +
        `<h2 style="margin:0 0 12px;">${qr.nombre}</h2>` +
        `<img src="${qrImagen}" style="width:260px;height:260px;" />` +
        `<p style="color:#6b7280;font-size:11px;word-break:break-all;margin-top:12px;">${qr.token}</p>` +
        `<scr` + `ipt>window.onload=function(){window.print();}</scr` + `ipt>` +
        `</body></html>`,
    );
    v.document.close();
  };

  const guardarPin = async () => {
    if (!pinDe) return;
    setPinError(null);
    if (!/^\d{4}$/.test(pinValor)) {
      setPinError(t('adm.emp.errPin'));
      return;
    }
    setGuardandoPin(true);
    try {
      await resetearPin(pinDe.id, pinValor);
      setPinDe(null);
      setPinValor('');
    } catch (err) {
      setPinError(err instanceof Error ? err.message : t('adm.emp.errResetPin'));
    } finally {
      setGuardandoPin(false);
    }
  };

  // Página de GESTIÓN: un empleado que llegue por URL directa se redirige (sin acceso).
  if (!puedeGestionar) {
    return <Navigate to="/" replace />;
  }

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>{t('nav.empleados')}</h1>
            <p className={styles.subtitulo}>{t('adm.emp.subtitulo')}</p>
          </div>
          <Boton
            onClick={() => {
              setEmpleadoEditar(null);
              setMostrarFormNuevo((prev) => !prev);
            }}
          >
            {mostrarFormNuevo ? t('adm.cerrarFormulario') : t('adm.emp.btnRegistrar')}
          </Boton>
        </div>

        {mostrarFormNuevo && (
          <FormularioEmpleado onGuardado={manejarGuardado} onCancelar={() => setMostrarFormNuevo(false)} />
        )}
        {empleadoEditar && (
          <FormularioEmpleado
            empleado={empleadoEditar}
            onGuardado={manejarGuardado}
            onCancelar={() => setEmpleadoEditar(null)}
          />
        )}

        <div className={styles.tarjeta}>
          {avisoAlta && <div className={styles.avisoInfo}>{avisoAlta}</div>}
          {errorCarga && (
            <div className={styles.errorCarga}>
              <span>{errorCarga}</span>
              <Boton variante="secundario" onClick={() => { void cargar(); }}>{t('adm.reintentar')}</Boton>
            </div>
          )}

          {!errorCarga && cargando && <p className={styles.estadoCarga}>{t('adm.emp.cargandoLista')}</p>}

          {!errorCarga && !cargando && empleados.length === 0 && (
            <p className={styles.estadoVacio}>{t('adm.emp.vacio')}</p>
          )}

          {!errorCarga && !cargando && empleados.length > 0 && (
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>{t('adm.emp.thNumero')}</th>
                  <th>{t('adm.emp.thNombre')}</th>
                  <th>{t('adm.emp.thSede')}</th>
                  <th>{t('adm.emp.thRoles')}</th>
                  <th>{t('adm.emp.thSalario')}</th>
                  <th>{t('adm.estado')}</th>
                  <th className={styles.colAccion}></th>
                </tr>
              </thead>
              <tbody>
                {empleados.map((emp) => (
                  <tr key={emp.id} className={emp.activo ? undefined : styles.filaInactiva}>
                    <td>{emp.numero}</td>
                    <td>{emp.nombre}</td>
                    <td className={styles.tenue}>{sedes[emp.sedeId] ?? emp.sedeId}</td>
                    <td>
                      {emp.roles.length === 0 ? (
                        <span className={styles.tenue}>—</span>
                      ) : (
                        <span className={styles.chips}>
                          {emp.roles.map((r) => (
                            <span key={r.id} className={styles.chip}>{r.nombre}</span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className={styles.tenue}>B/. {emp.salarioFijo.toFixed(2)}</td>
                    <td>
                      <span className={emp.activo ? styles.badgeActivo : styles.badgeInactivo}>
                        {emp.activo ? t('adm.emp.activo') : t('adm.emp.inactivo')}
                      </span>
                    </td>
                    <td className={styles.colAccion}>
                      <button type="button" className={styles.botonAccion} onClick={() => abrirEdicion(emp)}>
                        {t('comun.editar')}
                      </button>
                      {/* Secretos (QR/PIN): solo administrador — el backend responde 403
                          a cualquier otro rol (`soloAdmin`), así que no se ofrecen. */}
                      {esAdministrador && (
                        <>
                          <button type="button" className={styles.botonAccion} onClick={() => { void verQr(emp); }}>
                            {t('adm.emp.qr')}
                          </button>
                          <button type="button" className={styles.botonAccion} onClick={() => { setPinError(null); setPinValor(''); setPinDe(emp); }}>
                            {t('adm.emp.resetPin')}
                          </button>
                        </>
                      )}
                      <button
                        type="button"
                        className={`${styles.botonAccion} ${emp.activo ? styles.botonPeligro : ''}`}
                        onClick={() => { void alternarActivo(emp); }}
                        disabled={actualizandoId === emp.id}
                      >
                        {emp.activo ? t('adm.emp.desactivar') : t('adm.emp.activar')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal de QR */}
      {qr && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <h2 className={styles.modalTitulo}>{t('adm.emp.qrTitulo', { nombre: qr.nombre })}</h2>
            <div className={styles.qrCaja}>
              {qrImagen ? (
                <img src={qrImagen} alt={t('adm.emp.qrTitulo', { nombre: qr.nombre })} className={styles.qrImagen} />
              ) : qrImagenError ? (
                <div className={styles.error}>
                  {qrImagenError}{' '}
                  <Boton variante="secundario" onClick={() => generarImagen(qr.token)}>
                    {t('adm.reintentar')}
                  </Boton>
                </div>
              ) : (
                <p>{t('adm.emp.generando')}</p>
              )}
            </div>
            <p className={styles.qrToken}>{qr.token}</p>
            <p className={styles.qrNota}>{t('adm.emp.qrNota')}</p>
            {qrError && <p className={styles.error}>{qrError}</p>}
            <div className={styles.modalAcciones}>
              <Boton variante="secundario" onClick={cerrarQr}>{t('comun.cerrar')}</Boton>
              <Boton variante="secundario" onClick={imprimirQr} disabled={!qrImagen}>{t('adm.emp.imprimir')}</Boton>
              <Boton cargando={regenerando} onClick={() => { void rotarQr(); }}>{t('adm.emp.regenerarQr')}</Boton>
            </div>
          </div>
        </div>
      )}

      {/* Modal de reset de PIN */}
      {pinDe && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <h2 className={styles.modalTitulo}>{t('adm.emp.resetPinTitulo', { nombre: pinDe.nombre })}</h2>
            {pinError && <p className={styles.error}>{pinError}</p>}
            <Entrada
              etiqueta={t('adm.emp.nuevoPin')}
              value={pinValor}
              onChange={(e) => setPinValor(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              inputMode="numeric"
              maxLength={4}
              ayuda={t('adm.emp.pinAyuda')}
              disabled={guardandoPin}
            />
            <div className={styles.modalAcciones}>
              <Boton variante="secundario" onClick={() => { setPinDe(null); setPinValor(''); }} disabled={guardandoPin}>
                {t('comun.cancelar')}
              </Boton>
              <Boton cargando={guardandoPin} disabled={pinValor.length !== 4} onClick={() => { void guardarPin(); }}>
                {t('adm.emp.guardarPin')}
              </Boton>
            </div>
          </div>
        </div>
      )}
    </LayoutPrincipal>
  );
}
