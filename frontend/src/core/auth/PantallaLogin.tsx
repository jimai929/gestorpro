/**
 * Pantalla de inicio de sesión de GestorPro.
 *
 * - Valida que email y contraseña no estén vacíos antes de enviar.
 * - Muestra el error devuelto por el backend si las credenciales son incorrectas.
 * - Al autenticar correctamente vuelve a la ruta que originó el login (state.desde
 *   de RutaProtegida, conservando el query de los deep-links) o a la raíz.
 */

import { FormEvent, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from './ContextoAuth';
import { useTraduccion } from '../i18n/ContextoIdioma';
import { SelectorIdioma } from '../i18n/SelectorIdioma';
import styles from './PantallaLogin.module.css';

export function PantallaLogin() {
  const { iniciarSesion, estaAutenticado } = useAuth();
  const { t } = useTraduccion();
  const navegar = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Destino tras autenticar: la ruta desde la que RutaProtegida redirigió aquí
  // (conservando el query de los deep-links), o la raíz. Solo se aceptan rutas
  // internas ("/x", no "//host" ni URLs absolutas).
  const desde = (location.state as { desde?: string } | null)?.desde;
  const destino = desde && desde.startsWith('/') && !desde.startsWith('//') ? desde : '/';

  // Si ya tiene sesión, redirigir con Navigate (no con navegar() durante el render)
  if (estaAutenticado) {
    return <Navigate to={destino} replace />;
  }

  const manejarEnvio = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validación básica en cliente
    if (!email.trim()) {
      setError(t('login.errorCorreo'));
      return;
    }
    if (!password) {
      setError(t('login.errorContrasena'));
      return;
    }

    setEnviando(true);
    try {
      await iniciarSesion(email.trim(), password);
      navegar(destino, { replace: true });
    } catch (err: unknown) {
      const mensaje =
        err instanceof Error ? err.message : t('login.errorGenerico');
      setError(mensaje);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className={styles.contenedor}>
      <div className={styles.tarjeta}>
        {/* Logo y título */}
        <div className={styles.encabezado}>
          <div className={styles.logo}>GP</div>
          <h1 className={styles.titulo}>GestorPro</h1>
          <p className={styles.subtitulo}>{t('login.subtitulo')}</p>
        </div>

        <div className={styles.selectorIdioma}>
          <SelectorIdioma />
        </div>

        {/* Formulario */}
        <form onSubmit={(e) => void manejarEnvio(e)} noValidate className={styles.formulario}>
          <div className={styles.campo}>
            <label htmlFor="email" className={styles.etiqueta}>
              {t('login.correo')}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className={styles.entrada}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={enviando}
              placeholder="usuario@empresa.com"
            />
          </div>

          <div className={styles.campo}>
            <label htmlFor="password" className={styles.etiqueta}>
              {t('login.contrasena')}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className={styles.entrada}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={enviando}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <div className={styles.error} role="alert">
              {error}
            </div>
          )}

          <button type="submit" className={styles.botonPrincipal} disabled={enviando}>
            {enviando ? t('login.entrando') : t('login.entrar')}
          </button>
        </form>

        <p className={styles.pie}>
          {t('login.pie')}
        </p>
      </div>
    </div>
  );
}
