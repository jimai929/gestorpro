/**
 * Pantalla de PLATAFORMA (solo super-admin): alta de empresas (tenants) + listado.
 * Se auto-envuelve en <LayoutPrincipal>, igual que el resto de pantallas.
 * El acceso lo controla <RutaSoloPlataforma> (UI) y el backend (soloPlataforma).
 */

import { useCallback, useEffect, useState } from 'react';
import { LayoutPrincipal } from '../core/ui/LayoutPrincipal';
import { useTraduccion } from '../core/i18n/ContextoIdioma';
import { FormularioCrearEmpresa } from './FormularioCrearEmpresa';
import { ListaEmpresas } from './ListaEmpresas';
import { listarEmpresasApi } from './servicioPlataforma';
import type { EmpresaListada } from './tipos';
import styles from './PantallaPlataforma.module.css';

export function PantallaPlataforma() {
  const { t } = useTraduccion();

  const [empresas, setEmpresas] = useState<EmpresaListada[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setEmpresas(await listarEmpresasApi());
    } catch (err) {
      // Error visible (mismo criterio que las mutaciones): muestra el mensaje del backend.
      setError(err instanceof Error ? err.message : t('plataforma.listaError'));
    } finally {
      setCargando(false);
    }
  }, [t]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return (
    <LayoutPrincipal>
      <div className={styles.contenedor}>
        <header className={styles.encabezado}>
          <h1 className={styles.titulo}>{t('plataforma.titulo')}</h1>
          <p className={styles.subtitulo}>{t('plataforma.subtitulo')}</p>
        </header>

        <div className={styles.tarjeta}>
          {/* Al crear una empresa, se refresca la lista para que aparezca. */}
          <FormularioCrearEmpresa onCreada={() => void recargar()} />
        </div>

        <ListaEmpresas
          empresas={empresas}
          cargando={cargando}
          error={error}
          onReintentar={() => void recargar()}
        />
      </div>
    </LayoutPrincipal>
  );
}
