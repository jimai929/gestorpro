/**
 * Pantalla de PLATAFORMA (solo super-admin): alta de empresas (tenants) + listado.
 * Se auto-envuelve en <LayoutPrincipal>, igual que el resto de pantallas.
 * El acceso lo controla <RutaSoloPlataforma> (UI) y el backend (soloPlataforma).
 */

import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { LayoutPrincipal } from '../core/ui/LayoutPrincipal';
import { useAuth } from '../core/auth/ContextoAuth';
import { useTraduccion } from '../core/i18n/ContextoIdioma';
import { FormularioCrearEmpresa } from './FormularioCrearEmpresa';
import { ListaEmpresas } from './ListaEmpresas';
import { listarEmpresasApi } from './servicioPlataforma';
import type { EmpresaListada } from './tipos';
import styles from './PantallaPlataforma.module.css';

export function PantallaPlataforma() {
  const { t } = useTraduccion();
  const { cambiarEmpresa } = useAuth();
  const navigate = useNavigate();

  const [empresas, setEmpresas] = useState<EmpresaListada[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [entrandoId, setEntrandoId] = useState<string | null>(null);
  const [errorEntrar, setErrorEntrar] = useState<string | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    // También el error de un "Entrar" fallido: recargar deja el estado visible fresco.
    setErrorEntrar(null);
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

  // "Entrar" a una empresa (cambiar-empresa): el contexto reemplaza token y usuario;
  // solo se navega tras el ÉXITO real (si el backend deniega, el error queda visible).
  const manejarEntrar = useCallback(
    async (empresaId: string) => {
      setEntrandoId(empresaId);
      setErrorEntrar(null);
      try {
        await cambiarEmpresa(empresaId);
        navigate('/');
      } catch (err) {
        setErrorEntrar(err instanceof Error ? err.message : t('plataforma.errEntrar'));
        setEntrandoId(null);
      }
    },
    [cambiarEmpresa, navigate, t],
  );

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
          // Un solo hueco de error visible: el de la carga o el del "Entrar" denegado.
          error={error ?? errorEntrar}
          onReintentar={() => void recargar()}
          onEntrar={(id) => void manejarEntrar(id)}
          entrandoId={entrandoId}
        />
      </div>
    </LayoutPrincipal>
  );
}
