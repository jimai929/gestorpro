/**
 * Pantalla de gestión de usuarios del tenant (área de Administración, Fase 4c).
 *
 * Lista las cuentas de acceso de la empresa, permite darlas de alta (con contraseña
 * temporal) y restablecer la contraseña de un usuario (soporte). Solo administrador:
 * el backend lo refuerza con `autorizar('administrador')` en cada endpoint; esta
 * pantalla es experiencia de UI (un no-admin que navegue directo verá el 403 visible).
 *
 * Rutas de API: GET /usuarios · POST /usuarios · PATCH /usuarios/:id ·
 * POST /usuarios/:id/restablecer-contrasena
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { NavLink } from 'react-router';
import { LayoutPrincipal } from '../../core/ui/LayoutPrincipal';
import { Boton } from '../../core/ui/Boton';
import { useAuth } from '../../core/auth/ContextoAuth';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { FormularioCrearUsuario } from './FormularioCrearUsuario';
import { DialogoRestablecerContrasena } from './DialogoRestablecerContrasena';
import { ListaUsuarios } from './ListaUsuarios';
import { cambiarEstadoUsuarioApi, cambiarRolUsuarioApi, listarUsuariosApi } from './servicioUsuarios';
import type { RolAsignable, UsuarioListado } from './tipos';
import styles from './PantallaUsuarios.module.css';

export function PantallaUsuarios() {
  const { t } = useTraduccion();
  const { usuario: usuarioSesion } = useAuth();

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

  const [usuarios, setUsuarios] = useState<UsuarioListado[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [mostrarFormNuevo, setMostrarFormNuevo] = useState(false);
  const [usuarioRestablecer, setUsuarioRestablecer] = useState<UsuarioListado | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);

  // Guardia contra respuestas fuera de orden: cada carga toma un número de versión y
  // solo la MÁS RECIENTE escribe estado. Sin esto, una carga inicial lenta que resuelve
  // DESPUÉS del refresh post-mutación pisaría la lista fresca (el usuario recién creado
  // "desaparecería" de la tabla) o taparía la tabla con su error tardío.
  const versionCarga = useRef(0);

  const cargar = useCallback(async () => {
    const version = ++versionCarga.current;
    setCargando(true);
    setError(null);
    // También el error de una acción fallida: recargar deja el estado visible fresco.
    setErrorAccion(null);
    try {
      const lista = await listarUsuariosApi();
      if (version !== versionCarga.current) return; // llegó tarde: ya hay una carga más nueva
      setUsuarios(lista);
    } catch (err) {
      if (version !== versionCarga.current) return;
      // Error visible (incluye el 403 de un no-admin que navegó directo).
      setError(err instanceof Error ? err.message : t('adm.usu.errCargar'));
    } finally {
      if (version === versionCarga.current) {
        setCargando(false);
      }
    }
  }, [t]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  // Cierra el diálogo de restablecer TRAS el éxito y refresca (el badge "temporal
  // pendiente" del usuario restablecido aparece en la lista).
  const manejarRestablecido = () => {
    setUsuarioRestablecer(null);
    void cargar();
  };

  // Baja / reactivación lógica. El error queda visible (409 multi-empresa, 404…);
  // solo se recarga tras el éxito real del backend.
  const alternarActivo = async (u: UsuarioListado) => {
    setActualizandoId(u.id);
    setErrorAccion(null);
    try {
      await cambiarEstadoUsuarioApi(u.id, !u.activo);
      await cargar();
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : t('adm.usu.errActualizar'));
    } finally {
      setActualizandoId(null);
    }
  };

  // Cambio de rol de la membresía (M3b). Mismo patrón que alternarActivo: error visible
  // (400 propia cuenta, 404, 403…), recarga solo tras el éxito real del backend.
  const cambiarRol = async (u: UsuarioListado, rol: RolAsignable) => {
    setActualizandoId(u.id);
    setErrorAccion(null);
    try {
      await cambiarRolUsuarioApi(u.id, rol);
      await cargar();
    } catch (err) {
      setErrorAccion(err instanceof Error ? err.message : t('adm.usu.errActualizar'));
    } finally {
      setActualizandoId(null);
    }
  };

  // Solo un administrador de la sesión ve el control de cambio de rol (el super-admin
  // post-B4 nunca opera dentro de un tenant; un supervisor/empleado no debe cambiar roles).
  const puedeCambiarRol = usuarioSesion?.rol === 'administrador';

  const claseNav = ({ isActive }: { isActive: boolean }) =>
    isActive ? `${styles.enlaceNav} ${styles.enlaceNavActivo}` : styles.enlaceNav;

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        {/* Barra de navegación de administración */}
        <nav className={styles.navAdmin} aria-label={t('adm.ariaNav')}>
          <NavLink to="/sedes" className={claseNav}>{t('nav.sedes')}</NavLink>
          <NavLink to="/empleados" className={claseNav}>{t('nav.empleados')}</NavLink>
          <NavLink to="/kioscos" className={claseNav}>{t('nav.kioscos')}</NavLink>
          {/* Misma condición que el resto de la app: solo quien puede LEER /usuarios
              ve la pestaña (un no-admin que navegue directo verá el 403 en la tabla). */}
          {usuarioSesion !== null &&
            usuarioSesion.empresaId !== null &&
            (usuarioSesion.rol === 'administrador' || usuarioSesion.esSuperAdmin) && (
              <NavLink to="/usuarios" className={claseNav}>{t('nav.usuarios')}</NavLink>
            )}
        </nav>

        {/* Encabezado */}
        <div className={styles.encabezado}>
          <div>
            <h1 className={styles.tituloPagina}>{t('nav.usuarios')}</h1>
            <p className={styles.subtitulo}>{t('adm.usu.subtitulo')}</p>
          </div>
          <Boton onClick={() => setMostrarFormNuevo((prev) => !prev)}>
            {mostrarFormNuevo ? t('adm.cerrarFormulario') : t('adm.usu.btnRegistrar')}
          </Boton>
        </div>

        {mostrarFormNuevo && (
          <div className={styles.tarjetaFormulario}>
            <FormularioCrearUsuario
              onCreado={() => void cargar()}
              onCancelar={() => setMostrarFormNuevo(false)}
            />
          </div>
        )}

        <ListaUsuarios
          usuarios={usuarios}
          cargando={cargando}
          // Un solo hueco de error visible: el de la carga o el de la última acción.
          error={error ?? errorAccion}
          onReintentar={() => void cargar()}
          onRestablecer={(u) => setUsuarioRestablecer(u)}
          onAlternarActivo={(u) => void alternarActivo(u)}
          onCambiarRol={(u, rol) => void cambiarRol(u, rol)}
          puedeCambiarRol={puedeCambiarRol}
          actualizandoId={actualizandoId}
          idActual={usuarioSesion?.id ?? null}
        />

        {usuarioRestablecer && (
          <DialogoRestablecerContrasena
            /* key: al cambiar de usuario objetivo React REMONTA el diálogo (estado
               limpio). Sin ella, pasar de un éxito con A a la fila de B conservaría
               exito=true y anunciaría "restablecida" una contraseña que no se tocó. */
            key={usuarioRestablecer.id}
            usuario={usuarioRestablecer}
            onCerrar={() => setUsuarioRestablecer(null)}
            onExito={manejarRestablecido}
          />
        )}
      </div>
    </LayoutPrincipal>
  );
}
