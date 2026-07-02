/**
 * Formulario de alta de usuario del tenant (POST /usuarios, solo administrador).
 * Sigue el patrón de mutación del proyecto: error visible en UI, estado de carga,
 * y el resultado/éxito SOLO tras la confirmación real del backend.
 *
 * Validación de cliente = refuerzo de UX. La frontera real de validación/seguridad
 * es el backend (schema con lista blanca de roles + guard de administrador).
 */

import { useState, type FormEvent } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { crearUsuarioApi } from './servicioUsuarios';
import type { RolAsignable, UsuarioCreado } from './tipos';
import styles from './FormularioCrearUsuario.module.css';

// Mismos refuerzos que el schema del backend (email con forma real, mínimo 8).
const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LONGITUD_MINIMA = 8;

/** Roles asignables por un admin de tenant (misma lista blanca que el backend). */
const ROLES_ASIGNABLES: RolAsignable[] = ['empleado', 'administrador'];

interface Propiedades {
  /** Se llama tras crear con éxito, para que el contenedor refresque la lista. */
  onCreado?: () => void;
  onCancelar?: () => void;
}

export function FormularioCrearUsuario({ onCreado, onCancelar }: Propiedades = {}) {
  const { t } = useTraduccion();

  const [nombre, setNombre] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState<RolAsignable>('empleado');

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<UsuarioCreado | null>(null);

  const reiniciar = () => {
    setNombre('');
    setEmail('');
    setPassword('');
    setRol('empleado');
    setError(null);
    setExito(null);
  };

  const manejarEnvio = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);

    // Validación de cliente (UX). Cualquier fallo corta ANTES de llamar al backend.
    if (!nombre.trim() || !email.trim() || !password) {
      setError(t('adm.usu.errCampos'));
      return;
    }
    if (!PATRON_EMAIL.test(email.trim())) {
      setError(t('adm.usu.errEmail'));
      return;
    }
    if (password.length < LONGITUD_MINIMA) {
      setError(t('adm.usu.errPassword'));
      return;
    }

    setGuardando(true);
    try {
      const creado = await crearUsuarioApi({
        nombre: nombre.trim(),
        email: email.trim(),
        password,
        rol,
      });
      // Éxito SOLO tras el await: se muestra el resultado (no se limpia a ciegas,
      // para que el admin vea el correo creado y recuerde comunicar la temporal).
      setExito(creado);
      onCreado?.();
    } catch (err) {
      // Muestra el mensaje real del backend (p. ej. 409 email en uso).
      setError(err instanceof Error ? err.message : t('adm.usu.errGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  if (exito) {
    return (
      <div className={styles.exito} role="status">
        <h2 className={styles.exitoTitulo}>{t('adm.usu.exitoTitulo')}</h2>
        <dl className={styles.exitoDatos}>
          <div className={styles.exitoFila}>
            <dt>{t('adm.usu.thNombre')}</dt>
            <dd>{exito.nombre}</dd>
          </div>
          <div className={styles.exitoFila}>
            <dt>{t('adm.usu.thEmail')}</dt>
            <dd>{exito.email}</dd>
          </div>
          <div className={styles.exitoFila}>
            <dt>{t('adm.usu.thRol')}</dt>
            <dd>{t(`rol.${exito.rol}`)}</dd>
          </div>
        </dl>
        <p className={styles.exitoAviso}>{t('adm.usu.exitoAviso')}</p>
        <Boton type="button" onClick={reiniciar}>
          {t('adm.usu.crearOtro')}
        </Boton>
      </div>
    );
  }

  return (
    <form className={styles.formulario} onSubmit={(e) => { void manejarEnvio(e); }} noValidate>
      <p className={styles.titulo}>{t('adm.usu.nuevo')}</p>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <Entrada
        etiqueta={t('adm.usu.nombre')}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        required
        disabled={guardando}
      />
      <Entrada
        etiqueta={t('adm.usu.email')}
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        disabled={guardando}
      />
      <Entrada
        etiqueta={t('adm.usu.contrasenaTemporal')}
        type="password"
        autoComplete="new-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        ayuda={t('adm.usu.contrasenaAyuda')}
        required
        disabled={guardando}
      />
      <div className={styles.grupoSelect}>
        <label className={styles.etiqueta} htmlFor="crear-usuario-rol">
          {t('adm.usu.rol')}
        </label>
        <select
          id="crear-usuario-rol"
          className={styles.select}
          value={rol}
          onChange={(e) => setRol(e.target.value as RolAsignable)}
          disabled={guardando}
        >
          {ROLES_ASIGNABLES.map((r) => (
            <option key={r} value={r}>
              {t(`rol.${r}`)}
            </option>
          ))}
        </select>
      </div>

      <div className={styles.acciones}>
        {onCancelar && (
          <Boton type="button" variante="secundario" onClick={onCancelar} disabled={guardando}>
            {t('comun.cancelar')}
          </Boton>
        )}
        <Boton type="submit" cargando={guardando}>
          {t('adm.usu.crear')}
        </Boton>
      </div>
    </form>
  );
}
