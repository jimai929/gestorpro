/**
 * Pantalla de gestión de proveedores.
 *
 * Lista todos los proveedores (activos e inactivos), permite darlos de alta,
 * editarlos (nombre, RUC, teléfono, persona de contacto) y darlos de baja /
 * reactivarlos. La baja es LÓGICA (campo `activo`): nunca se borra, porque hay
 * facturas que referencian al proveedor. Los proveedores inactivos dejan de
 * aparecer en el selector del formulario de factura.
 *
 * Rutas de API que utiliza:
 *   GET  /proveedores       → lista completa
 *   POST /proveedores       → alta
 *   PUT  /proveedores/:id    → edición y baja/alta lógica
 */

import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { FormularioProveedor } from './FormularioProveedor';
import { obtenerProveedores, editarProveedor } from './servicioCuentas';
import type { Proveedor } from './tipos';
import styles from './PantallaProveedores.module.css';

export function PantallaProveedores() {
  const [proveedores, setProveedores] = useState<Proveedor[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  // UI: formulario de alta visible y proveedor en edición (excluyentes).
  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false);
  const [proveedorEditar, setProveedorEditar] = useState<Proveedor | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setProveedores(await obtenerProveedores());
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : 'Error al cargar los proveedores.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** Tras crear o editar: cerrar los formularios y refrescar la lista. */
  const manejarGuardado = () => {
    setMostrarFormNuevo(false);
    setProveedorEditar(null);
    void cargar();
  };

  const abrirEdicion = (proveedor: Proveedor) => {
    setMostrarFormNuevo(false);
    setProveedorEditar(proveedor);
  };

  /** Baja o alta lógica (activar/desactivar) sin borrar. */
  const alternarActivo = async (proveedor: Proveedor) => {
    setActualizandoId(proveedor.id);
    setErrorCarga(null);
    try {
      await editarProveedor(proveedor.id, { activo: !proveedor.activo });
      await cargar();
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : 'No se pudo actualizar el proveedor.');
    } finally {
      setActualizandoId(null);
    }
  };

  const claseNav = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.enlaceNav} ${styles.enlaceNavActivo}` : styles.enlaceNav;

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        {/* Barra de navegación de finanzas */}
        <nav className={styles.navFinanzas} aria-label="Módulos de finanzas">
          <NavLink to="/cuentas-por-pagar" className={claseNav}>
            Cuentas por pagar
          </NavLink>
          <NavLink to="/proveedores" className={claseNav}>
            Proveedores
          </NavLink>
          <NavLink to="/gastos" className={claseNav}>
            Gastos
          </NavLink>
          <NavLink to="/dashboard" className={claseNav}>
            Dashboard
          </NavLink>
        </nav>

        {/* Encabezado */}
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>Proveedores</h1>
            <p className={styles.subtitulo}>Alta, edición y baja de proveedores</p>
          </div>
          <Boton
            onClick={() => {
              setProveedorEditar(null);
              setMostrarFormNuevo((prev) => !prev);
            }}
          >
            {mostrarFormNuevo ? 'Cerrar formulario' : '+ Registrar proveedor'}
          </Boton>
        </div>

        {/* Formulario de alta */}
        {mostrarFormNuevo && (
          <FormularioProveedor
            onGuardado={manejarGuardado}
            onCancelar={() => setMostrarFormNuevo(false)}
          />
        )}

        {/* Formulario de edición */}
        {proveedorEditar && (
          <FormularioProveedor
            proveedor={proveedorEditar}
            onGuardado={manejarGuardado}
            onCancelar={() => setProveedorEditar(null)}
          />
        )}

        {/* Tabla de proveedores */}
        <div className={styles.tarjeta}>
          {errorCarga && (
            <div className={styles.errorCarga}>
              <span>{errorCarga}</span>
              <Boton variante="secundario" onClick={() => { void cargar(); }}>
                Reintentar
              </Boton>
            </div>
          )}

          {!errorCarga && cargando && (
            <p className={styles.estadoCarga}>Cargando proveedores…</p>
          )}

          {!errorCarga && !cargando && proveedores.length === 0 && (
            <p className={styles.estadoVacio}>No hay proveedores registrados todavía.</p>
          )}

          {!errorCarga && !cargando && proveedores.length > 0 && (
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>RUC / Identificación</th>
                  <th>Teléfono</th>
                  <th>Persona de contacto</th>
                  <th>Estado</th>
                  <th className={styles.colAccion}></th>
                </tr>
              </thead>
              <tbody>
                {proveedores.map((p) => (
                  <tr key={p.id} className={p.activo ? undefined : styles.filaInactiva}>
                    <td>{p.nombre}</td>
                    <td className={styles.contacto}>
                      {p.identificacionFiscal ?? <span className={styles.vacio}>—</span>}
                    </td>
                    <td className={styles.contacto}>
                      {p.telefono ?? <span className={styles.vacio}>—</span>}
                    </td>
                    <td className={styles.contacto}>
                      {p.personaContacto ?? <span className={styles.vacio}>—</span>}
                    </td>
                    <td>
                      <span className={p.activo ? styles.badgeActivo : styles.badgeInactivo}>
                        {p.activo ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className={styles.colAccion}>
                      <button
                        type="button"
                        className={styles.botonAccion}
                        onClick={() => abrirEdicion(p)}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className={`${styles.botonAccion} ${p.activo ? styles.botonPeligro : ''}`}
                        onClick={() => { void alternarActivo(p); }}
                        disabled={actualizandoId === p.id}
                      >
                        {p.activo ? 'Desactivar' : 'Activar'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </LayoutPrincipal>
  );
}
