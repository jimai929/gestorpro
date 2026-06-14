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
import { obtenerKioscos, regenerarTokenKiosco } from './servicioKioscos';
import type { Kiosco, KioscoConToken } from './tipos';
import styles from './PantallaKioscos.module.css';

export function PantallaKioscos() {
  const [kioscos, setKioscos] = useState<Kiosco[]>([]);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false);
  // Token revelado UNA vez tras el alta o la regeneración (no se puede recuperar).
  const [tokenRevelado, setTokenRevelado] = useState<{ nombre: string; token: string } | null>(null);
  const [regenerandoId, setRegenerandoId] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

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

  const manejarGuardado = (kiosco: KioscoConToken) => {
    setMostrarFormNuevo(false);
    setErrorAccion(null);
    setTokenRevelado({ nombre: kiosco.nombre, token: kiosco.token });
    void cargar();
  };

  const regenerar = async (kiosco: Kiosco) => {
    setRegenerandoId(kiosco.id);
    setErrorAccion(null);
    try {
      const { token } = await regenerarTokenKiosco(kiosco.id);
      setTokenRevelado({ nombre: kiosco.nombre, token });
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : 'Error al regenerar el token.');
    } finally {
      setRegenerandoId(null);
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

        {tokenRevelado && (
          <div
            className={styles.tarjeta}
            style={{ border: '2px solid #2563eb', background: '#eff6ff' }}
          >
            <p style={{ fontWeight: 600, margin: 0 }}>
              Token del kiosco «{tokenRevelado.nombre}»
            </p>
            <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>
              Cópielo y configúrelo en el dispositivo (pantalla del kiosco). Por
              seguridad, <strong>solo se muestra una vez</strong>.
            </p>
            <code
              style={{
                display: 'block',
                padding: '0.5rem',
                background: '#fff',
                borderRadius: 4,
                wordBreak: 'break-all',
                userSelect: 'all',
              }}
            >
              {tokenRevelado.token}
            </code>
            <div style={{ marginTop: '0.5rem' }}>
              <Boton variante="secundario" onClick={() => setTokenRevelado(null)}>
                Cerrar
              </Boton>
            </div>
          </div>
        )}

        {errorAccion && <div className={styles.errorCarga}><span>{errorAccion}</span></div>}

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
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {kioscos.map((kiosco) => (
                  <tr key={kiosco.id}>
                    <td>{kiosco.nombre}</td>
                    <td className={styles.contacto}>{kiosco.sede?.nombre ?? kiosco.sedeId}</td>
                    <td>
                      <Boton
                        variante="secundario"
                        cargando={regenerandoId === kiosco.id}
                        onClick={() => { void regenerar(kiosco); }}
                      >
                        Regenerar token
                      </Boton>
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
