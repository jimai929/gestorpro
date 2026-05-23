/**
 * Pantalla de inicio de sesión de GestorPro.
 *
 * - Valida que email y contraseña no estén vacíos antes de enviar.
 * - Muestra el error devuelto por el backend si las credenciales son incorrectas.
 * - Al autenticar correctamente navega a la raíz ("/").
 */

import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { useAuth } from './ContextoAuth';
import styles from './PantallaLogin.module.css';

export function PantallaLogin() {
  const { iniciarSesion, estaAutenticado } = useAuth();
  const navegar = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  // Si ya tiene sesión, redirigir con Navigate (no con navegar() durante el render)
  if (estaAutenticado) {
    return <Navigate to="/" replace />;
  }

  const manejarEnvio = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validación básica en cliente
    if (!email.trim()) {
      setError('El correo electrónico es obligatorio.');
      return;
    }
    if (!password) {
      setError('La contraseña es obligatoria.');
      return;
    }

    setEnviando(true);
    try {
      await iniciarSesion(email.trim(), password);
      navegar('/', { replace: true });
    } catch (err: unknown) {
      const mensaje =
        err instanceof Error ? err.message : 'Error al iniciar sesión. Intenta de nuevo.';
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
          <p className={styles.subtitulo}>Administración empresarial</p>
        </div>

        {/* Formulario */}
        <form onSubmit={(e) => void manejarEnvio(e)} noValidate className={styles.formulario}>
          <div className={styles.campo}>
            <label htmlFor="email" className={styles.etiqueta}>
              Correo electrónico
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
              Contraseña
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
            {enviando ? 'Entrando…' : 'Iniciar sesión'}
          </button>
        </form>

        <p className={styles.pie}>
          Solo personal autorizado. Contacta al administrador para obtener acceso.
        </p>
      </div>
    </div>
  );
}
