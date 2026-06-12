/**
 * Pantalla de gestión de kioscos (área de Administración).
 *
 * Lista los kioscos activos (con su sede) y permite darlos de alta. El backend
 * solo expone alta y el listado público de activos: no hay edición ni baja de
 * kiosco, así que la tabla no muestra acciones por fila.
 *
 * Rutas de API: GET /kioscos · POST /kioscos (alta, solo admin).
 */

import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { FormularioKiosco } from './FormularioKiosco';
import { obtenerKioscos } from './servicioKioscos';
import type { Kiosco } from './tipos';
import styles from './PantallaKioscos.module.css';

export function PantallaKioscos() {
  const [kioscos, setKioscos] = useState<Kiosco[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      setKioscos(await obtenerKioscos());
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : 'Error al cargar los kioscos.');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const manejarGuardado = () => {
    setMostrarFormNuevo(false);
    void cargar();
  };

  const claseNav = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.enlaceNav} ${styles.enlaceNavActivo}` : styles.enlaceNav;

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        <nav className={styles.navAdmin} aria-label="Administración">
          <NavLink to="/sedes" className={claseNav}>Sedes</NavLink>
          <NavLink to="/empleados" className={claseNav}>Empleados</NavLink>
          <NavLink to="/kioscos" className={claseNav}>Kioscos</NavLink>
        </nav>

        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>Kioscos</h1>
            <p className={styles.subtitulo}>Alta de kioscos de fichaje por sede</p>
          </div>
          <Boton onClick={() => setMostrarFormNuevo((prev) => !prev)}>
            {mostrarFormNuevo ? 'Cerrar formulario' : '+ Registrar kiosco'}
          </Boton>
        </div>

        {mostrarFormNuevo && (
          <FormularioKiosco onGuardado={manejarGuardado} onCancelar={() => setMostrarFormNuevo(false)} />
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

          {!errorCarga && cargando && <p className={styles.estadoCarga}>Cargando kioscos…</p>}

          {!errorCarga && !cargando && kioscos.length === 0 && (
            <p className={styles.estadoVacio}>No hay kioscos registrados todavía.</p>
          )}

          {!errorCarga && !cargando && kioscos.length > 0 && (
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Sede</th>
                </tr>
              </thead>
              <tbody>
                {kioscos.map((kiosco) => (
                  <tr key={kiosco.id}>
                    <td>{kiosco.nombre}</td>
                    <td className={styles.contacto}>{kiosco.sede?.nombre ?? kiosco.sedeId}</td>
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
