/**
 * Diálogo modal para AÑADIR una MEMBRESÍA a un usuario EXISTENTE (por email) en la
 * empresa elegida, con rol per-tenant (plataforma, solo super-admin).
 *
 * Llama a POST /empresas/:id/membresias. Sigue el patrón de mutación del proyecto:
 * error visible en UI, estado de carga, y NO se cierra ni anuncia éxito antes del
 * 201 real del backend. La membresía nueva NUNCA es predeterminada: el usuario la
 * verá en su selector de empresa al volver a entrar.
 */

import { useState, type FormEvent } from 'react';
import { Boton } from '../core/ui/Boton';
import { useModal } from '../core/ui/useModal';
import { Entrada } from '../core/ui/Entrada';
import { useTraduccion } from '../core/i18n/ContextoIdioma';
import { crearMembresiaApi } from './servicioPlataforma';
import type { EmpresaListada, RolMembresia } from './tipos';
import styles from './DialogoAnadirMembresia.module.css';

// LOOKUP, no creación: refuerzo de forma MÍNIMO (algo@algo, sin exigir punto), para
// no dejar inalcanzable una cuenta con email no-canónico que el login/alta sí aceptan
// (p.ej. 'jefe@interno'). La comparación real es exacta en el backend.
const PATRON_EMAIL = /^\S+@\S+$/;

/** Roles asignables (misma lista blanca que el backend). */
const ROLES_MEMBRESIA: RolMembresia[] = ['empleado', 'administrador'];

interface Propiedades {
  /** Empresa DESTINO de la membresía. */
  empresa: EmpresaListada;
  /** Cierra el diálogo sin cambios (antes del éxito). */
  onCerrar: () => void;
  /** Se invoca al cerrar TRAS un éxito. */
  onExito: () => void;
}

export function DialogoAnadirMembresia({ empresa, onCerrar, onExito }: Propiedades) {
  const { t } = useTraduccion();
  const [email, setEmail] = useState('');
  const [rol, setRol] = useState<RolMembresia>('empleado');
  const [guardando, setGuardando] = useState(false);
  // Accesibilidad compartida del modal; mientras guarda NO se cierra.
  const refModal = useModal<HTMLDivElement>(() => {
    if (!guardando) onCerrar();
  });
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);

  const manejarEnvio = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);

    // Validación en cliente (el backend la repite; feedback inmediato).
    if (!PATRON_EMAIL.test(email.trim())) {
      setError(t('plataforma.errEmail'));
      return;
    }

    setGuardando(true);
    try {
      await crearMembresiaApi(empresa.id, email.trim(), rol);
      // Solo tras el 201 real pasamos al estado de éxito (no antes).
      setExito(true);
    } catch (err) {
      // Muestra el mensaje real del backend (404 email inexistente, 409 duplicada…).
      setError(err instanceof Error ? err.message : t('plataforma.am.errGenerico'));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div
      ref={refModal}
      className={styles.fondo}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-anadir-membresia"
    >
      <div className={styles.dialogo}>
        {exito ? (
          <>
            {/* role=status: anuncia el éxito a lectores de pantalla. */}
            <div className={styles.exito} role="status">
              <h2 className={styles.titulo} id="titulo-anadir-membresia">
                {t('plataforma.am.exitoTitulo')}
              </h2>
              <p className={styles.mensaje}>
                {t('plataforma.am.exitoMensaje', { email: email.trim(), empresa: empresa.nombre })}
              </p>
            </div>
            <div className={styles.acciones}>
              <Boton type="button" autoFocus onClick={onExito}>
                {t('comun.cerrar')}
              </Boton>
            </div>
          </>
        ) : (
          <>
            <div className={styles.encabezado}>
              <h2 className={styles.titulo} id="titulo-anadir-membresia">
                {t('plataforma.am.titulo', { empresa: empresa.nombre })}
              </h2>
              <button
                type="button"
                className={styles.botonCerrar}
                onClick={onCerrar}
                aria-label={t('comun.cerrar')}
                disabled={guardando}
              >
                ×
              </button>
            </div>

            <p className={styles.mensaje}>{t('plataforma.am.intro')}</p>

            <form className={styles.formulario} onSubmit={(e) => { void manejarEnvio(e); }} noValidate>
              <div className={styles.campos}>
                <Entrada
                  etiqueta={t('plataforma.am.email')}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  ayuda={t('plataforma.am.emailAyuda')}
                  disabled={guardando}
                  autoFocus
                />
                <div className={styles.grupoSelect}>
                  <label className={styles.etiqueta} htmlFor="anadir-membresia-rol">
                    {t('plataforma.am.rol')}
                  </label>
                  <select
                    id="anadir-membresia-rol"
                    className={styles.select}
                    value={rol}
                    onChange={(e) => setRol(e.target.value as RolMembresia)}
                    disabled={guardando}
                  >
                    {ROLES_MEMBRESIA.map((r) => (
                      <option key={r} value={r}>
                        {t(`rol.${r}`)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {error && <p className={styles.error} role="alert">{error}</p>}

              <div className={styles.acciones}>
                <Boton type="button" variante="secundario" onClick={onCerrar} disabled={guardando}>
                  {t('comun.cancelar')}
                </Boton>
                <Boton type="submit" cargando={guardando} disabled={guardando || !email}>
                  {t('plataforma.am.anadir')}
                </Boton>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
