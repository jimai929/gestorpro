/**
 * Pantalla de inicio (placeholder).
 * Muestra el nombre y rol del usuario autenticado y un botón de cerrar sesión.
 * Se reemplazará por el dashboard de finanzas en la Fase 3.
 */

import { useEffect } from 'react';
import { useAuth } from './core/auth/ContextoAuth';
import { useTraduccion } from './core/i18n/ContextoIdioma';
import { LayoutPrincipal } from './core/ui/LayoutPrincipal';
import { Link } from 'react-router';
import { Wallet, Building2, Clock, ShieldCheck } from 'lucide-react';
import styles from './PantallaInicio.module.css';

export function PantallaInicio() {
  const { usuario } = useAuth();
  const { t } = useTraduccion();

  useEffect(() => {
    const raiz = document.documentElement;
    const previo = raiz.getAttribute('data-theme');
    raiz.setAttribute('data-theme', 'dark');
    return () => {
      if (previo === null) raiz.removeAttribute('data-theme');
      else raiz.setAttribute('data-theme', previo);
    };
  }, []);

  if (!usuario) return null;

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        <div className={styles.bienvenida}>
          <div className={styles.avatar}>
            {usuario.nombre.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className={styles.saludo}>{t('inicio.bienvenido', { nombre: usuario.nombre })}</h1>
            <p className={styles.detalle}>
              {t('inicio.sesionActivaComo')}{' '}
              <strong>{t(`rol.${usuario.rol}`)}</strong>
            </p>
            <p className={styles.email}>{usuario.email}</p>
          </div>
        </div>

        <div className={styles.tarjetasModulos}>
          <div className={styles.tarjeta}>
            <Wallet className={styles.iconoModulo} size={26} strokeWidth={1.75} aria-hidden />
            <h2 className={styles.tituloModulo}>{t('inicio.finanzas')}</h2>
            <p className={styles.descripcionModulo}>
              {t('inicio.finanzasDesc')}
            </p>
            <div className={styles.enlacesModulo}>
              <Link to="/cuentas-por-pagar" className={styles.enlaceModulo}>
                {t('nav.cuentasPorPagar')} →
              </Link>
              <Link to="/gastos" className={styles.enlaceModulo}>
                {t('nav.gastos')} →
              </Link>
              <Link to="/dashboard" className={styles.enlaceModulo}>
                {t('nav.dashboard')} →
              </Link>
            </div>
          </div>

          <div className={styles.tarjeta}>
            <Building2 className={styles.iconoModulo} size={26} strokeWidth={1.75} aria-hidden />
            <h2 className={styles.tituloModulo}>{t('inicio.administracion')}</h2>
            <p className={styles.descripcionModulo}>
              {t('inicio.administracionDesc')}
            </p>
            <div className={styles.enlacesModulo}>
              <Link to="/sedes" className={styles.enlaceModulo}>
                {t('nav.sedes')} →
              </Link>
              <Link to="/empleados" className={styles.enlaceModulo}>
                {t('nav.empleados')} →
              </Link>
              <Link to="/kioscos" className={styles.enlaceModulo}>
                {t('nav.kioscos')} →
              </Link>
              {/* Gestión de usuarios: solo admin (o super-admin DENTRO de una empresa:
                  en plataforma, empresaId null, el backend responde 403 — sería un
                  enlace muerto). Solo UI: la frontera real es el backend. */}
              {usuario.empresaId !== null &&
                (usuario.rol === 'administrador' || usuario.esSuperAdmin) && (
                  <Link to="/usuarios" className={styles.enlaceModulo}>
                    {t('nav.usuarios')} →
                  </Link>
                )}
            </div>
          </div>

          <div className={styles.tarjeta}>
            <Clock className={styles.iconoModulo} size={26} strokeWidth={1.75} aria-hidden />
            <h2 className={styles.tituloModulo}>{t('inicio.asistencia')}</h2>
            <p className={styles.descripcionModulo}>
              {t('inicio.asistenciaDesc')}
            </p>
            <div className={styles.enlacesModulo}>
              <Link to="/asistencia/revision" className={styles.enlaceModulo}>
                {t('nav.colaRevision')} →
              </Link>
              <Link to="/asistencia/jornadas" className={styles.enlaceModulo}>
                {t('nav.jornadas')} →
              </Link>
              <Link to="/asistencia/cobros" className={styles.enlaceModulo}>
                {t('nav.cobros')} →
              </Link>
              <Link
                to="/kiosco"
                className={styles.enlaceModulo}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('nav.kioscoNuevoTab')} →
              </Link>
            </div>
          </div>

          {/* Plataforma — solo super-admin. La frontera real es el backend; esto es UI. */}
          {usuario.esSuperAdmin && (
            <div className={styles.tarjeta}>
              <ShieldCheck className={styles.iconoModulo} size={26} strokeWidth={1.75} aria-hidden />
              <h2 className={styles.tituloModulo}>{t('inicio.plataforma')}</h2>
              <p className={styles.descripcionModulo}>{t('inicio.plataformaDesc')}</p>
              <div className={styles.enlacesModulo}>
                <Link to="/plataforma" className={styles.enlaceModulo}>
                  {t('nav.plataforma')} →
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </LayoutPrincipal>
  );
}
