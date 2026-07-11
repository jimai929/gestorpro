/**
 * Pantalla de gestión de kioscos (área de Administración).
 *
 * Lista los kioscos activos de la EMPRESA ACTUAL (con su sede) y permite darlos de
 * alta. No hay edición ni baja de kiosco; la única acción por fila es regenerar su
 * token de dispositivo.
 *
 * Rutas de API: GET /kioscos/gestion (listado tenant-scoped, autenticado) ·
 * POST /kioscos (alta, solo admin) · POST /kioscos/:id/token (rotación, solo admin).
 */

import { useState, useEffect, useCallback } from 'react';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { FormularioKiosco } from './FormularioKiosco';
import { obtenerKioscos, regenerarTokenKiosco } from './servicioKioscos';
import type { Kiosco, KioscoConToken } from './tipos';
import styles from './PantallaKioscos.module.css';

export function PantallaKioscos() {
  const { t } = useTraduccion();
  // Monta el tema oscuro mientras esta pantalla está visible; restaura el
  // valor previo al desmontar para no dejar dark residual en páginas claras.
  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', 'dark');
    return () => {
      if (previo === null) raiz.removeAttribute('data-theme');
      else raiz.setAttribute('data-theme', previo);
    };
  }, []);
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

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
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
            style={{ border: '2px solid var(--color-primary)', background: 'var(--color-primary-bg)' }}
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
                background: 'var(--color-surface)',
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
