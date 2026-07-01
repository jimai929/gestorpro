/**
 * Formulario de creación de empresa (tenant) + su primer administrador.
 * Mutación POST /empresas (solo super-admin). Sigue el patrón de mutación del
 * proyecto: error visible en UI, estado de carga, y el resultado/éxito SOLO tras
 * la confirmación real del backend (nunca limpia ni navega antes del await).
 *
 * Validación de cliente = refuerzo de UX. La frontera real de validación/seguridad
 * es el backend (schema + soloPlataforma).
 */

import { useState, type FormEvent } from 'react';
import { Boton } from '../core/ui/Boton';
import { Entrada } from '../core/ui/Entrada';
import { useTraduccion } from '../core/i18n/ContextoIdioma';
import { crearEmpresaApi } from './servicioPlataforma';
import type { EmpresaCreada } from './tipos';
import styles from './FormularioCrearEmpresa.module.css';

// Mismo patrón que el schema del backend (slug ^[a-z0-9-]+$). El backend NO valida
// la estructura del email (solo minLength:3), así que el front la refuerza aquí.
const PATRON_SLUG = /^[a-z0-9-]+$/;
const PATRON_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface ResultadoExito {
  empresa: EmpresaCreada;
  adminEmail: string;
}

/** `onCreada` (opcional): se llama tras crear con éxito, para que el contenedor
 *  refresque la lista de empresas. Opcional → el formulario sigue usándose suelto. */
export function FormularioCrearEmpresa({ onCreada }: { onCreada?: () => void } = {}) {
  const { t } = useTraduccion();

  const [nombre, setNombre] = useState('');
  const [slug, setSlug] = useState('');
  const [adminNombre, setAdminNombre] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<ResultadoExito | null>(null);

  const reiniciar = () => {
    setNombre('');
    setSlug('');
    setAdminNombre('');
    setAdminEmail('');
    setAdminPassword('');
    setError(null);
    setExito(null);
  };

  const manejarEnvio = async (evento: FormEvent) => {
    evento.preventDefault();
    setError(null);

    // Validación de cliente (UX). Cualquier fallo corta ANTES de llamar al backend.
    if (!nombre.trim() || !adminNombre.trim()) {
      setError(t('plataforma.errCamposObligatorios'));
      return;
    }
    if (!PATRON_SLUG.test(slug)) {
      setError(t('plataforma.errSlug'));
      return;
    }
    if (!PATRON_EMAIL.test(adminEmail)) {
      setError(t('plataforma.errEmail'));
      return;
    }
    if (adminPassword.length < 8) {
      setError(t('plataforma.errPassword'));
      return;
    }

    setGuardando(true);
    try {
      const empresa = await crearEmpresaApi({
        nombre: nombre.trim(),
        slug: slug.trim(),
        adminNombre: adminNombre.trim(),
        adminEmail: adminEmail.trim(),
        adminPassword,
      });
      // Éxito SOLO tras el await: mostramos el resultado (no se navega ni se limpia
      // a ciegas, para que el super-admin vea la empresa y el correo del admin).
      setExito({ empresa, adminEmail: adminEmail.trim() });
      onCreada?.(); // refresca la lista de empresas del contenedor (si la hay)
    } catch (err) {
      // Muestra el mensaje real del backend. cliente.ts ya normaliza ambos shapes a
      // err.message: dominio { mensaje } (409) y validación de schema { message } (400).
      setError(err instanceof Error ? err.message : t('plataforma.errGenerico'));
    } finally {
      setGuardando(false);
    }
  };

  if (exito) {
    return (
      <div className={styles.exito}>
        <div className={styles.exitoIcono} aria-hidden="true">
          ✅
        </div>
        <h2 className={styles.exitoTitulo}>{t('plataforma.exitoTitulo')}</h2>
        <dl className={styles.exitoDatos}>
          <div className={styles.exitoFila}>
            <dt>{t('plataforma.empresa')}</dt>
            <dd>{exito.empresa.nombre}</dd>
          </div>
          <div className={styles.exitoFila}>
            <dt>{t('plataforma.slug')}</dt>
            <dd>{exito.empresa.slug}</dd>
          </div>
          <div className={styles.exitoFila}>
            <dt>{t('plataforma.adminEmail')}</dt>
            <dd>{exito.adminEmail}</dd>
          </div>
        </dl>
        <p className={styles.exitoAviso}>{t('plataforma.exitoAviso')}</p>
        <Boton type="button" onClick={reiniciar}>
          {t('plataforma.crearOtra')}
        </Boton>
      </div>
    );
  }

  return (
    <form
      className={styles.formulario}
      onSubmit={(e) => {
        void manejarEnvio(e);
      }}
      noValidate
    >
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <Entrada
        etiqueta={t('plataforma.nombre')}
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        required
        disabled={guardando}
      />
      <Entrada
        etiqueta={t('plataforma.slug')}
        value={slug}
        onChange={(e) => setSlug(e.target.value)}
        ayuda={t('plataforma.slugAyuda')}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        disabled={guardando}
      />
      <Entrada
        etiqueta={t('plataforma.adminNombre')}
        value={adminNombre}
        onChange={(e) => setAdminNombre(e.target.value)}
        required
        disabled={guardando}
      />
      <Entrada
        etiqueta={t('plataforma.adminEmail')}
        type="email"
        value={adminEmail}
        onChange={(e) => setAdminEmail(e.target.value)}
        required
        disabled={guardando}
      />
      <Entrada
        etiqueta={t('plataforma.adminPassword')}
        type="password"
        value={adminPassword}
        onChange={(e) => setAdminPassword(e.target.value)}
        ayuda={t('plataforma.passwordAyuda')}
        required
        disabled={guardando}
      />

      <div className={styles.acciones}>
        <Boton type="submit" cargando={guardando}>
          {t('plataforma.crear')}
        </Boton>
      </div>
    </form>
  );
}
