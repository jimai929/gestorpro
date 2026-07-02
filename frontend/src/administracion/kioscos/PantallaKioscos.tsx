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
import { useAuthOpcional } from '../../core/auth/ContextoAuth';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { FormularioKiosco } from './FormularioKiosco';
import { obtenerKioscos, regenerarTokenKiosco } from './servicioKioscos';
import type { Kiosco, KioscoConToken } from './tipos';
import styles from './PantallaKioscos.module.css';

export function PantallaKioscos() {
  const { t } = useTraduccion();
  // GET /usuarios exige administrador incluso para LEER (a diferencia del resto de la
  // nav): el enlace se oculta a quien solo vería un 403. Hook tolerante: sin proveedor
  // (tests de la pantalla) simplemente no se muestra. La frontera real es el backend.
  const usuarioSesion = useAuthOpcional()?.usuario ?? null;
  const puedeGestionarUsuarios =
    usuarioSesion !== null &&
    usuarioSesion.empresaId !== null &&
    (usuarioSesion.rol === 'administrador' || usuarioSesion.esSuperAdmin);
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
      setErrorCarga(err instanceof Error ? err.message : t('adm.kiosco.errCargar'));
    } finally {
      setCargando(false);
    }
  }, [t]);

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
      setErrorAccion(err instanceof Error ? err.message : t('adm.kiosco.errRegenerar'));
    } finally {
      setRegenerandoId(null);
    }
  };

  const claseNav = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.enlaceNav} ${styles.enlaceNavActivo}` : styles.enlaceNav;

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        <nav className={styles.navAdmin} aria-label={t('adm.ariaNav')}>
          <NavLink to="/sedes" className={claseNav}>{t('nav.sedes')}</NavLink>
          <NavLink to="/empleados" className={claseNav}>{t('nav.empleados')}</NavLink>
          <NavLink to="/kioscos" className={claseNav}>{t('nav.kioscos')}</NavLink>
          {puedeGestionarUsuarios && (
            <NavLink to="/usuarios" className={claseNav}>{t('nav.usuarios')}</NavLink>
          )}
        </nav>

        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>{t('nav.kioscos')}</h1>
            <p className={styles.subtitulo}>{t('adm.kiosco.subtitulo')}</p>
          </div>
          <Boton onClick={() => setMostrarFormNuevo((prev) => !prev)}>
            {mostrarFormNuevo ? t('adm.cerrarFormulario') : t('adm.kiosco.btnRegistrar')}
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
              {t('adm.kiosco.tokenTitulo', { nombre: tokenRevelado.nombre })}
            </p>
            <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>
              {t('adm.kiosco.tokenInstruccionA')}<strong>{t('adm.kiosco.tokenSoloUnaVez')}</strong>.
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
                {t('comun.cerrar')}
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
                {t('adm.reintentar')}
              </Boton>
            </div>
          )}

          {!errorCarga && cargando && <p className={styles.estadoCarga}>{t('adm.kiosco.cargandoLista')}</p>}

          {!errorCarga && !cargando && kioscos.length === 0 && (
            <p className={styles.estadoVacio}>{t('adm.kiosco.vacio')}</p>
          )}

          {!errorCarga && !cargando && kioscos.length > 0 && (
            <table className={styles.tabla}>
              <thead>
                <tr>
                  <th>{t('adm.kiosco.thNombre')}</th>
                  <th>{t('adm.kiosco.thSede')}</th>
                  <th>{t('adm.kiosco.thAcciones')}</th>
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
                        {t('adm.kiosco.regenerarToken')}
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
