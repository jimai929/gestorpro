/**
 * Pantalla de gestión de sedes (área de Administración).
 *
 * Lista todas las sedes (activas e inactivas), permite darlas de alta, editarlas
 * (nombre y modo de excepción del fichaje) y darlas de baja / reactivarlas. La
 * baja es LÓGICA (`activo`): nunca se borra, porque compras, gastos, empleados,
 * cajas, etc. la referencian. Las sedes inactivas dejan de aparecer en los
 * selectores de los formularios.
 *
 * Rutas de API: GET /sedes?incluirInactivas=true · POST /sedes · PUT /sedes/:id
 */

import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { FormularioSede } from './FormularioSede';
import { obtenerSedes, editarSede } from './servicioSedes';
import { MODOS_EXCEPCION, type Sede } from './tipos';
import styles from './PantallaSedes.module.css';

const ETIQUETA_MODO: Record<string, string> = Object.fromEntries(
  MODOS_EXCEPCION.map((m) => [m.valor, m.etiqueta]),
);

export function PantallaSedes() {
  const [sedes, setSedes] = useState<Sede[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [mostrarFormNueva, setMostrarFormNueva] = useState(false);
  const [sedeEditar, setSedeEditar] = useState<Sede | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setSedes(await obtenerSedes({ incluirInactivas: true }));
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : 'Error al cargar las sedes.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const manejarGuardado = () => {
    setMostrarFormNueva(false);
    setSedeEditar(null);
    void cargar();
  };

  const abrirEdicion = (sede: Sede) => {
    setMostrarFormNueva(false);
    setSedeEditar(sede);
  };

  const alternarActivo = async (sede: Sede) => {
    setActualizandoId(sede.id);
    setErrorCarga(null);
    try {
      await editarSede(sede.id, { activo: !sede.activo });
      await cargar();
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : 'No se pudo actualizar la sede.');
    } finally {
      setActualizandoId(null);
    }
  };

  const claseNav = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.enlaceNav} ${styles.enlaceNavActivo}` : styles.enlaceNav;

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        {/* Barra de navegación de administración */}
        <nav className={styles.navAdmin} aria-label="Administración">
          <NavLink to="/sedes" className={claseNav}>
            Sedes
          </NavLink>
          <NavLink to="/empleados" className={claseNav}>
            Empleados
          </NavLink>
        </nav>

        {/* Encabezado */}
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>Sedes</h1>
            <p className={styles.subtitulo}>Alta, edición y baja de sedes</p>
          </div>
          <Boton
            onClick={() => {
              setSedeEditar(null);
              setMostrarFormNueva((prev) => !prev);
            }}
          >
            {mostrarFormNueva ? 'Cerrar formulario' : '+ Registrar sede'}
          </Boton>
        </div>

        {mostrarFormNueva && (
          <FormularioSede onGuardado={manejarGuardado} onCancelar={() => setMostrarFormNueva(false)} />
        )}

        {sedeEditar && (
          <FormularioSede
            sede={sedeEditar}
            onGuardado={manejarGuardado}
            onCancelar={() => setSedeEditar(null)}
          />
        )}

        <div className={styles.tarjeta}>
          {errorCarga && (
            <div className={styles.errorCarga}>
              <span>{errorCarga}</span>
              <Boton variante="secundario" onClick={() => { void cargar(); }}>
                Reintentar
              </Boton>
            </div>
          )}

          {!errorCarga && cargando && <p className={styles.estadoCarga}>Cargando sedes…</p>}

          {!errorCarga && !cargando && sedes.length === 0 && (
            <p className={styles.estadoVacio}>No hay sedes registradas todavía.</p>
          )}

          {!errorCarga && !cargando && sedes.length > 0 && (
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Modo de excepción</th>
                  <th>Estado</th>
                  <th className={styles.colAccion}></th>
                </tr>
              </thead>
              <tbody>
                {sedes.map((sede) => (
                  <tr key={sede.id} className={sede.activo ? undefined : styles.filaInactiva}>
                    <td>{sede.nombre}</td>
                    <td className={styles.contacto}>
                      {ETIQUETA_MODO[sede.modoExcepcion] ?? sede.modoExcepcion}
                    </td>
                    <td>
                      <span className={sede.activo ? styles.badgeActivo : styles.badgeInactivo}>
                        {sede.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className={styles.colAccion}>
                      <button type="button" className={styles.botonAccion} onClick={() => abrirEdicion(sede)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className={`${styles.botonAccion} ${sede.activo ? styles.botonPeligro : ''}`}
                        onClick={() => { void alternarActivo(sede); }}
                        disabled={actualizandoId === sede.id}
                      >
                        {sede.activo ? 'Desactivar' : 'Activar'}
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
