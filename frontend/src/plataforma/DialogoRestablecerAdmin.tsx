/**
 * Diálogo modal para RESTABLECER la contraseña del admin PRINCIPAL de una empresa
 * (plataforma, solo super-admin), SIN entrar al tenant. Llama a
 * POST /empresas/:id/restablecer-admin.
 *
 * Flujo en DOS pasos: (1) CONFIRMACIÓN — la acción genera una contraseña temporal nueva,
 * REVOCA las sesiones del admin y le EXIGE cambiarla en su primer ingreso; (2) tras el 200
 * real, muestra la temporal EN CLARO (se devuelve UNA vez) para comunicarla al admin, con
 * el aviso de cambio obligatorio. NO se cierra ni anuncia éxito antes del 200; el error
 * queda visible y el diálogo permanece abierto para reintentar.
 */

import { useState } from 'react';
import { Boton } from '../core/ui/Boton';
import { useTraduccion } from '../core/i18n/ContextoIdioma';
import { restablecerAdminApi } from './servicioPlataforma';
import type { EmpresaListada } from './tipos';
import styles from './DialogoRestablecerAdmin.module.css';

interface Propiedades {
  /** Empresa cuyo admin principal se restablece. */
  empresa: EmpresaListada;
  /** Cierra el diálogo sin haber restablecido (antes del éxito). */
  onCerrar: () => void;
  /** Se invoca al cerrar TRAS un éxito. */
  onExito: () => void;
}

export function DialogoRestablecerAdmin({ empresa, onCerrar, onExito }: Propiedades) {
  const { t } = useTraduccion();
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Contraseña temporal devuelta por el backend. null = aún no restablecida (paso de
  // confirmación); string = éxito (paso de resultado que la muestra UNA vez).
  const [temporal, setTemporal] = useState<string | null>(null);
  const [copiada, setCopiada] = useState(false);

  const manejarConfirmar = async () => {
    setError(null);
    setGuardando(true);
    try {
      const res = await restablecerAdminApi(empresa.id);
      // Solo tras el 200 real pasamos al estado de éxito (no antes).
      setTemporal(res.contrasenaTemporal);
    } catch (err) {
      // Muestra el mensaje real del backend (404 sin admin, 409 desactivada…).
      setError(err instanceof Error ? err.message : t('plataforma.ra.errGenerico'));
    } finally {
      setGuardando(false);
    }
  };

  const copiar = () => {
    if (temporal) {
      // Best-effort: en algunos entornos (o sin permiso) no hay clipboard; no rompe el flujo.
      void navigator.clipboard?.writeText(temporal);
      setCopiada(true);
    }
  };

  return (
    <div
      className={styles.fondo}
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-restablecer-admin"
    >
      <div className={styles.dialogo}>
        {temporal !== null ? (
          <>
            {/* role=status: anuncia el éxito a lectores de pantalla. */}
            <div className={styles.exito} role="status">
              <h2 className={styles.titulo} id="titulo-restablecer-admin">
                {t('plataforma.ra.exitoTitulo')}
              </h2>
              <p className={styles.mensaje}>
                {t('plataforma.ra.exitoIntro', { empresa: empresa.nombre })}
              </p>
              <div className={styles.temporalCaja}>
                <code className={styles.temporal}>{temporal}</code>
                <Boton type="button" variante="secundario" onClick={copiar}>
                  {copiada ? t('plataforma.ra.copiada') : t('plataforma.ra.copiar')}
                </Boton>
              </div>
              {/* Aviso OBLIGATORIO: el admin debe cambiarla en su primer inicio de sesión. */}
              <p className={styles.aviso} role="alert">
                {t('plataforma.ra.avisoCambio')}
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
              <h2 className={styles.titulo} id="titulo-restablecer-admin">
                {t('plataforma.ra.titulo', { empresa: empresa.nombre })}
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

            <p className={styles.mensaje}>{t('plataforma.ra.intro')}</p>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <div className={styles.acciones}>
              <Boton type="button" variante="secundario" onClick={onCerrar} disabled={guardando}>
                {t('comun.cancelar')}
              </Boton>
              {/* disabled mientras guarda: evita doble clic / doble reset. */}
              <Boton
                type="button"
                variante="peligro"
                cargando={guardando}
                disabled={guardando}
                onClick={() => {
                  void manejarConfirmar();
                }}
              >
                {t('plataforma.ra.confirmar')}
              </Boton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
