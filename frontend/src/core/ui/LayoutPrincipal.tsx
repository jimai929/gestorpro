/**
 * Layout base para pantallas autenticadas.
 *
 * Barra lateral fija a la IZQUIERDA (1b): navegación modular persistente + área de
 * cuenta abajo. En ≤768px la barra colapsa a un RAIL de solo iconos (con tooltip y
 * aria-label; objetivo táctil ≥44px) — esto YA es la adaptación responsive definitiva
 * de este archivo (M2 no vuelve a tocar LayoutPrincipal).
 *
 * El rail es el ancla visual OSCURA en ambas fases (claro/oscuro): usa los tokens
 * fijos --color-sidebar-* (ver global.css / docs/DESIGN_SYSTEM.md). El área de
 * contenido sigue el tema de la página.
 *
 * gating de navegación: solo UI de conveniencia (la frontera real es el backend).
 * Reutiliza el MISMO campo que los guards de ruta: `usuario.esSuperAdmin`
 * (RutaNegocio redirige al super-admin fuera del tenant; RutaSoloPlataforma exige
 * super-admin). No se escribe lógica de autorización paralela.
 */

import { ReactNode, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import {
  ShieldCheck, LayoutDashboard, SlidersHorizontal,
  Receipt, Truck, CreditCard, Tags, BarChart3,
  MapPin, Users, Monitor, UserCog,
  ClipboardCheck, CalendarDays, Banknote,
  KeyRound, LogOut,
} from 'lucide-react';
import { useAuth } from '../auth/ContextoAuth';
import { DialogoCambiarContrasena } from '../auth/DialogoCambiarContrasena';
import { useTraduccion } from '../i18n/ContextoIdioma';
import { SelectorIdioma } from '../i18n/SelectorIdioma';
import styles from './LayoutPrincipal.module.css';

interface PropiedadesLayout {
  children: ReactNode;
}

export function LayoutPrincipal({ children }: PropiedadesLayout) {
  const { usuario, cerrarSesion, cambiarEmpresa } = useAuth();
  const { t } = useTraduccion();
  const navigate = useNavigate();
  const [mostrarCambioContrasena, setMostrarCambioContrasena] = useState(false);
  const [errorVolver, setErrorVolver] = useState<string | null>(null);
  const [cambiandoEmpresa, setCambiandoEmpresa] = useState(false);

  // Empresa activa a mostrar: el usuario normal muestra el nombre de su empresa; el
  // super-admin (siempre en plataforma tras B4) muestra "Plataforma".
  const etiquetaEmpresa = usuario
    ? (usuario.empresaNombre ?? (usuario.esSuperAdmin ? t('plataforma.badge') : null))
    : null;

  // B4: el super-admin NUNCA está dentro de una empresa → no hay "Volver a plataforma".
  // Usuario con MÁS de una membresía activa: la etiqueta de empresa se vuelve un selector.
  const membresias = usuario?.membresias ?? [];
  const puedeCambiarDeEmpresa = !usuario?.esSuperAdmin && membresias.length > 1;

  // ── Navegación (gating por identidad — MISMO criterio que los guards) ──────────
  // Grupos de tenant visibles SOLO si NO es super-admin (RutaNegocio lo saca del
  // tenant); grupo de plataforma SOLO si es super-admin (RutaSoloPlataforma).
  const esSuperAdmin = !!usuario?.esSuperAdmin;
  // usuarios: sin guard de ruta propio (el backend responde 403 a no-admin). Misma
  // condición de UI que PantallaInicio; en 1b solo se OCULTA el enlace (no se toca la
  // página). Follow-up registrado: al migrar PantallaUsuarios, verificar degradación
  // 403 elegante si un no-admin teclea la URL a mano.
  const puedeVerUsuarios =
    usuario?.empresaId != null &&
    (usuario?.rol === 'administrador' || usuario?.esSuperAdmin);
  // Gestión (admin/supervisor con empresa activa): mismo criterio que los guards
  // `soloGestion` del backend. Gatea los enlaces de categorías de gasto y de
  // empleados; el empleado no los ve y el backend lo refuerza (403).
  const puedeGestionar =
    usuario?.empresaId != null &&
    (usuario?.rol === 'administrador' || usuario?.rol === 'supervisor');

  // Dos grupos por USO (no por módulo): PRINCIPAL = operación diaria; GESTIÓN =
  // catálogos y configuración. El gating por rol NO cambia: cada ítem conserva su
  // condición (categorías/empleados = puedeGestionar; usuarios = puedeVerUsuarios).
  const grupos = [];
  if (!esSuperAdmin) {
    grupos.push(
      {
        clave: 'nav.grupoPrincipal',
        variante: 'principal' as const,
        icono: LayoutDashboard,
        items: [
          { to: '/dashboard', clave: 'nav.dashboard', icono: BarChart3 },
          { to: '/cuentas-por-pagar', clave: 'nav.cuentasPorPagar', icono: Receipt },
          { to: '/gastos', clave: 'nav.gastos', icono: CreditCard },
          // Empleados es página de GESTIÓN (backend `soloGestion`): el empleado no la ve.
          ...(puedeGestionar
            ? [{ to: '/empleados', clave: 'nav.empleados', icono: Users }]
            : []),
          { to: '/asistencia/revision', clave: 'nav.colaRevision', icono: ClipboardCheck },
          { to: '/asistencia/jornadas', clave: 'nav.jornadas', icono: CalendarDays },
          { to: '/asistencia/cobros', clave: 'nav.cobros', icono: Banknote },
          { to: '/kiosco', clave: 'nav.kiosco', icono: Monitor },
        ],
      },
      {
        clave: 'nav.grupoGestion',
        variante: 'gestion' as const,
        icono: SlidersHorizontal,
        items: [
          { to: '/proveedores', clave: 'fin.navProveedores', icono: Truck },
          ...(puedeGestionar
            ? [{ to: '/categorias-gasto', clave: 'fin.navCategorias', icono: Tags }]
            : []),
          { to: '/sedes', clave: 'nav.sedes', icono: MapPin },
          { to: '/kioscos', clave: 'nav.kioscos', icono: Monitor },
          ...(puedeVerUsuarios
            ? [{ to: '/usuarios', clave: 'nav.usuarios', icono: UserCog }]
            : []),
        ],
      },
    );
  } else {
    grupos.push({
      clave: 'inicio.plataforma',
      variante: 'principal' as const,
      icono: ShieldCheck,
      items: [{ to: '/plataforma', clave: 'nav.plataforma', icono: ShieldCheck }],
    });
  }

  const manejarCambioDeEmpresa = async (empresaId: string) => {
    if (!usuario || empresaId === usuario.empresaId) return;
    setCambiandoEmpresa(true);
    setErrorVolver(null);
    try {
      await cambiarEmpresa(empresaId);
      // La pantalla actual puede no existir/denegarse bajo el rol de la otra empresa:
      // se navega al inicio.
      navigate('/');
    } catch (err) {
      setErrorVolver(err instanceof Error ? err.message : t('plataforma.errEntrar'));
    } finally {
      setCambiandoEmpresa(false);
    }
  };

  const manejarCerrarSesion = () => {
    void cerrarSesion();
  };

  // Tras cambiar la contraseña el backend ya revocó todas las sesiones: cerramos la
  // sesión local para que el usuario reingrese con su nueva contraseña.
  const manejarExitoCambio = () => {
    setMostrarCambioContrasena(false);
    void cerrarSesion();
  };

  return (
    <div className={styles.contenedor}>
      {/* ── Barra lateral izquierda ── */}
      <aside className={styles.sidebar}>
        <Link to="/" className={styles.marca} aria-label="Ir al inicio">
          <span className={styles.logoMini}>GP</span>
          <span className={styles.nombreApp}>GestorPro</span>
        </Link>

        <nav className={styles.nav} aria-label="Navegación principal">
          {grupos.map((grupo) => {
            const IconoGrupo = grupo.icono;
            return (
              <div key={grupo.clave} className={styles.grupo} data-grupo={grupo.variante}>
                <p className={styles.grupoTitulo}>
                  <IconoGrupo size={15} strokeWidth={1.75} aria-hidden className={styles.grupoIcono} />
                  <span className={styles.itemLabel}>{t(grupo.clave)}</span>
                </p>
                {grupo.items.map((item) => {
                  const IconoItem = item.icono;
                  const etiqueta = t(item.clave);
                  const contenido = (
                    <>
                      <IconoItem size={18} strokeWidth={1.75} aria-hidden className={styles.itemIcono} />
                      <span className={styles.itemLabel}>{etiqueta}</span>
                    </>
                  );
                  // Todos los enlaces del rail navegan EN LA MISMA pestaña (client-side).
                  // El kiosco (/kiosco) es una ruta pública a pantalla completa: entrar
                  // en la misma pestaña permite volver con el botón atrás del navegador.
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={({ isActive }) =>
                        [styles.item, isActive ? styles.itemActivo : ''].filter(Boolean).join(' ')
                      }
                      title={etiqueta}
                      aria-label={etiqueta}
                    >
                      {contenido}
                    </NavLink>
                  );
                })}
              </div>
            );
          })}
        </nav>

        <div className={styles.espaciador} />

        {/* ── Área de cuenta (abajo) ── */}
        {usuario && (
          <div className={styles.cuenta}>
            <div className={styles.infoUsuario}>
              {puedeCambiarDeEmpresa ? (
                <select
                  className={styles.selectorEmpresa}
                  aria-label={t('cuenta.cambiarEmpresa')}
                  value={usuario.empresaId ?? ''}
                  onChange={(e) => void manejarCambioDeEmpresa(e.target.value)}
                  disabled={cambiandoEmpresa}
                >
                  {membresias.map((m) => (
                    <option key={m.empresaId} value={m.empresaId}>
                      {m.empresaNombre}
                    </option>
                  ))}
                </select>
              ) : (
                etiquetaEmpresa && <span className={styles.empresaActual}>{etiquetaEmpresa}</span>
              )}
              <span className={styles.nombreUsuario}>{usuario.nombre}</span>
              <span className={styles.badgeRol}>{t(`rol.${usuario.rol}`)}</span>
            </div>

            <div className={styles.accionesCuenta}>
              <span className={styles.selectorIdioma}>
                <SelectorIdioma />
              </span>
              <button
                type="button"
                className={styles.botonAccion}
                onClick={() => setMostrarCambioContrasena(true)}
                title={t('cuenta.cambiarContrasena')}
                aria-label={t('cuenta.cambiarContrasena')}
              >
                <KeyRound size={18} strokeWidth={1.75} aria-hidden className={styles.itemIcono} />
                <span className={styles.itemLabel}>{t('cuenta.cambiarContrasena')}</span>
              </button>
              <button
                className={styles.botonSalir}
                onClick={manejarCerrarSesion}
                title={t('comun.cerrarSesion')}
                aria-label={t('comun.cerrarSesion')}
              >
                <LogOut size={18} strokeWidth={1.75} aria-hidden className={styles.itemIcono} />
                <span className={styles.itemLabel}>{t('comun.cerrarSesion')}</span>
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* ── Contenido principal ── */}
      <main className={styles.principal}>
        {/* Error del "volver a plataforma" VISIBLE (regla de mutaciones). */}
        {errorVolver && (
          <p className={styles.errorBarra} role="alert">
            {errorVolver}
          </p>
        )}
        {children}
      </main>

      {mostrarCambioContrasena && (
        <DialogoCambiarContrasena
          onCerrar={() => setMostrarCambioContrasena(false)}
          onExito={manejarExitoCambio}
        />
      )}
    </div>
  );
}
