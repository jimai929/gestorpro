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
import { NavLink } from 'react-router';
import QRCode from 'qrcode';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
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
      setErrorCarga(err instanceof Error ? err.message : 'Error al cargar los empleados.');
      return false;
    } finally {
      setCargando(false);
    }
  }, []);

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
      .catch(() => setQrImagenError('No se pudo generar la imagen del QR.'));
  }, []);

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
    // si la lista se recargó bien: no abrir el modal QR sobre una tabla en estado
    // de error. El empleado YA se creó; con la recarga fallida se ve su error y
    // botón de reintento. Tras reintentar con éxito, la fila aparece y el QR se
    // abre desde su botón "QR".
    void cargar().then((recargaOk) => {
      if (recargaOk && 'qrToken' in resultado) {
        setQrError(null);
        setQr({ empleadoId: resultado.id, nombre: resultado.nombre, token: resultado.qrToken });
      } else if ('qrToken' in resultado) {
        // Recarga fallida tras el alta: decir que el alta SÍ se completó, para que
        // el admin no la dé por fallida y la repita. El QR queda en el botón "QR".
        setAvisoAlta('El empleado se creó correctamente. Su fila aparecerá al recargar la lista; el QR está en su botón "QR".');
      } else if (!recargaOk) {
        // Simetría para la EDICIÓN (H17): el PUT sí se aplicó aunque la recarga fallara.
        setAvisoAlta('Los cambios se guardaron correctamente. La fila se actualizará al recargar la lista.');
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
      setErrorCarga(err instanceof Error ? err.message : 'No se pudo actualizar el empleado.');
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
      setErrorCarga(err instanceof Error ? err.message : 'No se pudo obtener el QR.');
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
      setQrError(err instanceof Error ? err.message : 'No se pudo regenerar el QR.');
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
      setPinError('El PIN debe ser de 4 dígitos.');
      return;
    }
    setGuardandoPin(true);
    try {
      await resetearPin(pinDe.id, pinValor);
      setPinDe(null);
      setPinValor('');
    } catch (err) {
      setPinError(err instanceof Error ? err.message : 'No se pudo resetear el PIN.');
    } finally {
      setGuardandoPin(false);
    }
  };

  const claseNav = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.enlaceNav} ${styles.enlaceNavActivo}` : styles.enlaceNav;

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        <nav className={styles.navAdmin} aria-label="Administración">
          <NavLink to="/sedes" className={claseNav}>Sedes</NavLink>
          <NavLink to="/empleados" className={claseNav}>Empleados</NavLink>
        </nav>

        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>Empleados</h1>
            <p className={styles.subtitulo}>Alta, edición, baja lógica y secretos (QR / PIN)</p>
          </div>
          <Boton
            onClick={() => {
              setEmpleadoEditar(null);
              setMostrarFormNuevo((prev) => !prev);
            }}
          >
            {mostrarFormNuevo ? 'Cerrar formulario' : '+ Registrar empleado'}
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
              <Boton variante="secundario" onClick={() => { void cargar(); }}>Reintentar</Boton>
            </div>
          )}

          {!errorCarga && cargando && <p className={styles.estadoCarga}>Cargando empleados…</p>}

          {!errorCarga && !cargando && empleados.length === 0 && (
            <p className={styles.estadoVacio}>No hay empleados registrados todavía.</p>
          )}

          {!errorCarga && !cargando && empleados.length > 0 && (
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Nombre</th>
                  <th>Sede</th>
                  <th>Roles</th>
                  <th>Salario</th>
                  <th>Estado</th>
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
                        {emp.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className={styles.colAccion}>
                      <button type="button" className={styles.botonAccion} onClick={() => abrirEdicion(emp)}>
                        Editar
                      </button>
                      <button type="button" className={styles.botonAccion} onClick={() => { void verQr(emp); }}>
                        QR
                      </button>
                      <button type="button" className={styles.botonAccion} onClick={() => { setPinError(null); setPinValor(''); setPinDe(emp); }}>
                        Reset PIN
                      </button>
                      <button
                        type="button"
                        className={`${styles.botonAccion} ${emp.activo ? styles.botonPeligro : ''}`}
                        onClick={() => { void alternarActivo(emp); }}
                        disabled={actualizandoId === emp.id}
                      >
                        {emp.activo ? 'Desactivar' : 'Activar'}
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
            <h2 className={styles.modalTitulo}>QR de {qr.nombre}</h2>
            <div className={styles.qrCaja}>
              {qrImagen ? (
                <img src={qrImagen} alt={`QR de ${qr.nombre}`} className={styles.qrImagen} />
              ) : qrImagenError ? (
                <div className={styles.error}>
                  {qrImagenError}{' '}
                  <Boton variante="secundario" onClick={() => generarImagen(qr.token)}>
                    Reintentar
                  </Boton>
                </div>
              ) : (
                <p>Generando…</p>
              )}
            </div>
            <p className={styles.qrToken}>{qr.token}</p>
            <p className={styles.qrNota}>Regenerar invalida el QR anterior al instante.</p>
            {qrError && <p className={styles.error}>{qrError}</p>}
            <div className={styles.modalAcciones}>
              <Boton variante="secundario" onClick={cerrarQr}>Cerrar</Boton>
              <Boton variante="secundario" onClick={imprimirQr} disabled={!qrImagen}>Imprimir</Boton>
              <Boton cargando={regenerando} onClick={() => { void rotarQr(); }}>Regenerar QR</Boton>
            </div>
          </div>
        </div>
      )}

      {/* Modal de reset de PIN */}
      {pinDe && (
        <div className={styles.overlay} role="dialog" aria-modal="true">
          <div className={styles.modal}>
            <h2 className={styles.modalTitulo}>Resetear PIN — {pinDe.nombre}</h2>
            {pinError && <p className={styles.error}>{pinError}</p>}
            <Entrada
              etiqueta="Nuevo PIN (4 dígitos)"
              value={pinValor}
              onChange={(e) => setPinValor(e.target.value.replace(/\D/g, '').slice(0, 4))}
              placeholder="••••"
              inputMode="numeric"
              maxLength={4}
              ayuda="Evita secuencias (1234) y repeticiones (0000)."
              disabled={guardandoPin}
            />
            <div className={styles.modalAcciones}>
              <Boton variante="secundario" onClick={() => { setPinDe(null); setPinValor(''); }} disabled={guardandoPin}>
                Cancelar
              </Boton>
              <Boton cargando={guardandoPin} disabled={pinValor.length !== 4} onClick={() => { void guardarPin(); }}>
                Guardar PIN
              </Boton>
            </div>
          </div>
        </div>
      )}
    </LayoutPrincipal>
  );
}
