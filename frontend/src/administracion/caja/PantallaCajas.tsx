/**
 * Pantalla de gestión de cajas registradoras (área de Administración).
 *
 * Lista cajas (activas e inactivas), permite alta, edición y baja lógica
 * (`activo`, nunca borrado: las ventas y el cierre las referencian). Filtra por
 * sede. Catálogo transversal por sede, más simple que empleados (sin secretos).
 *
 * API: GET /cajas?sedeId&incluirInactivas · POST /cajas · PUT /cajas/:id
 */

import { useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { FormularioCaja } from './FormularioCaja';
import { obtenerSedes } from '../sedes/servicioSedes';
import { obtenerCajas, editarCaja } from './servicioCajas';
import type { Caja } from './tipos';
import styles from './PantallaCajas.module.css';

export function PantallaCajas() {
  const [cajas, setCajas] = useState<Caja[]>([]);
  const [sedes, setSedes] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);

  const [filtroSede, setFiltroSede] = useState('');

  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false);
  const [cajaEditar, setCajaEditar] = useState<Caja | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const [lista, listaSedes] = await Promise.all([
        obtenerCajas({ incluirInactivas: true, sedeId: filtroSede || undefined }),
        obtenerSedes({ incluirInactivas: true }),
      ]);
      setCajas(lista);
      setSedes(Object.fromEntries(listaSedes.map((s) => [s.id, s.nombre])));
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : 'Error al cargar las cajas.');
    } finally {
      setCargando(false);
    }
  }, [filtroSede]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const manejarGuardado = () => {
    setMostrarFormNuevo(false);
    setCajaEditar(null);
    void cargar();
  };

  const abrirEdicion = (caja: Caja) => {
    setMostrarFormNuevo(false);
    setCajaEditar(caja);
  };

  const alternarActivo = async (caja: Caja) => {
    setActualizandoId(caja.id);
    setErrorCarga(null);
    try {
      await editarCaja(caja.id, { activo: !caja.activo });
      await cargar();
    } catch (err) {
      setErrorCarga(err instanceof Error ? err.message : 'No se pudo actualizar la caja.');
    } finally {
      setActualizandoId(null);
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
          <NavLink to="/cajas" className={claseNav}>Cajas</NavLink>
        </nav>

        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>Cajas</h1>
            <p className={styles.subtitulo}>Alta, edición y baja lógica de cajas registradoras</p>
          </div>
          <Boton
            onClick={() => {
              setCajaEditar(null);
              setMostrarFormNuevo((prev) => !prev);
            }}
          >
            {mostrarFormNuevo ? 'Cerrar formulario' : '+ Registrar caja'}
          </Boton>
        </div>

        {mostrarFormNuevo && (
          <FormularioCaja onGuardado={manejarGuardado} onCancelar={() => setMostrarFormNuevo(false)} />
        )}
        {cajaEditar && (
          <FormularioCaja
            caja={cajaEditar}
            onGuardado={manejarGuardado}
            onCancelar={() => setCajaEditar(null)}
          />
        )}

        <div className={styles.tarjeta}>
          <div className={styles.filtros}>
            <div className={styles.grupoFiltro}>
              <label className={styles.etiquetaFiltro}>Filtrar por sede</label>
              <select
                className={styles.selectFiltro}
                value={filtroSede}
                onChange={(e) => setFiltroSede(e.target.value)}
              >
                <option value="">Todas las sedes</option>
                {Object.entries(sedes).map(([id, nombre]) => (
                  <option key={id} value={id}>
                    {nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {errorCarga && (
            <div className={styles.errorCarga}>
              <span>{errorCarga}</span>
              <Boton variante="secundario" onClick={() => { void cargar(); }}>Reintentar</Boton>
            </div>
          )}

          {!errorCarga && cargando && <p className={styles.estadoCarga}>Cargando cajas…</p>}

          {!errorCarga && !cargando && cajas.length === 0 && (
            <p className={styles.estadoVacio}>No hay cajas registradas todavía.</p>
          )}

          {!errorCarga && !cargando && cajas.length > 0 && (
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>Número</th>
                  <th>Nombre</th>
                  <th>Sede</th>
                  <th>Estado</th>
                  <th className={styles.colAccion}></th>
                </tr>
              </thead>
              <tbody>
                {cajas.map((caja) => (
                  <tr key={caja.id} className={caja.activo ? undefined : styles.filaInactiva}>
                    <td>{caja.numero}</td>
                    <td>{caja.nombre}</td>
                    <td className={styles.tenue}>{sedes[caja.sedeId] ?? caja.sedeId}</td>
                    <td>
                      <span className={caja.activo ? styles.badgeActivo : styles.badgeInactivo}>
                        {caja.activo ? 'Activa' : 'Inactiva'}
                      </span>
                    </td>
                    <td className={styles.colAccion}>
                      <button type="button" className={styles.botonAccion} onClick={() => abrirEdicion(caja)}>
                        Editar
                      </button>
                      <button
                        type="button"
                        className={`${styles.botonAccion} ${caja.activo ? styles.botonPeligro : ''}`}
                        onClick={() => { void alternarActivo(caja); }}
                        disabled={actualizandoId === caja.id}
                      >
                        {caja.activo ? 'Desactivar' : 'Activar'}
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
