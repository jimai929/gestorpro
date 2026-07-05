/**
 * Pantalla de PLATAFORMA (solo super-admin): alta de empresas (tenants) + listado.
 * Se auto-envuelve en <LayoutPrincipal>, igual que el resto de pantallas.
 * El acceso lo controla <RutaSoloPlataforma> (UI) y el backend (soloPlataforma).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { LayoutPrincipal } from '../core/ui/LayoutPrincipal';
import { useTraduccion } from '../core/i18n/ContextoIdioma';
import { FormularioCrearEmpresa } from './FormularioCrearEmpresa';
import { ListaEmpresas } from './ListaEmpresas';
import { DialogoAnadirMembresia } from './DialogoAnadirMembresia';
import { DialogoRestablecerAdmin } from './DialogoRestablecerAdmin';
import { cambiarEstadoEmpresaApi, listarEmpresasApi } from './servicioPlataforma';
import type { EmpresaListada, EstadoEmpresa } from './tipos';
import styles from './PantallaPlataforma.module.css';

export function PantallaPlataforma() {
  const { t } = useTraduccion();

  const [empresas, setEmpresas] = useState<EmpresaListada[] | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // B4: el super-admin NO entra a empresas; solo queda el error de mutaciones de plataforma.
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);
  // Empresa destino del diálogo "Añadir membresía" (null = cerrado).
  const [empresaMembresia, setEmpresaMembresia] = useState<EmpresaListada | null>(null);
  // Empresa destino del diálogo "Restablecer admin" (null = cerrado).
  const [empresaResetAdmin, setEmpresaResetAdmin] = useState<EmpresaListada | null>(null);

  // Guardia contra respuestas fuera de orden (mismo patrón que PantallaUsuarios): solo
  // la recarga MÁS RECIENTE escribe estado. Sin esto, una recarga vieja que resolviera
  // tras el refresh post-PATCH pintaría "Activa" una empresa recién desactivada.
  const versionCarga = useRef(0);

  const recargar = useCallback(async () => {
    const version = ++versionCarga.current;
    setCargando(true);
    setError(null);
    // También el error de un cambio de estado fallido: recargar refresca todo.
    setErrorAccion(null);
    try {
      const lista = await listarEmpresasApi();
      if (version !== versionCarga.current) return; // llegó tarde: hay una carga más nueva
      setEmpresas(lista);
    } catch (err) {
      if (version !== versionCarga.current) return;
      // Error visible (mismo criterio que las mutaciones): muestra el mensaje del backend.
      setError(err instanceof Error ? err.message : t('plataforma.listaError'));
    } finally {
      if (version === versionCarga.current) {
        setCargando(false);
      }
    }
  }, [t]);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  // Transición de estado del tenant (B3: activa | suspendida | cancelada). Error
  // visible; solo se recarga tras el éxito real del backend (que además expulsa las
  // sesiones del tenant al suspender/cancelar). Cancelada es terminal: el 409 del
  // backend queda visible aquí igual que cualquier otro error.
  const cambiarEstado = useCallback(
    async (empresa: EmpresaListada, estado: EstadoEmpresa) => {
      setActualizandoId(empresa.id);
      setErrorAccion(null);
      try {
        await cambiarEstadoEmpresaApi(empresa.id, estado);
        await recargar();
      } catch (err) {
        setErrorAccion(err instanceof Error ? err.message : t('plataforma.errActualizar'));
      } finally {
        setActualizandoId(null);
      }
    },
    [recargar, t],
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
          // Un solo hueco de error visible: carga o cambio de estado.
          error={error ?? errorAccion}
          onReintentar={() => void recargar()}
          onCambiarEstado={(e, estado) => void cambiarEstado(e, estado)}
          actualizandoId={actualizandoId}
          onAnadirMembresia={(e) => setEmpresaMembresia(e)}
          onRestablecerAdmin={(e) => setEmpresaResetAdmin(e)}
        />

        {empresaMembresia && (
          <DialogoAnadirMembresia
            /* key: al cambiar de empresa destino React REMONTA el diálogo (estado
               limpio). Sin ella, pasar de un éxito con A a la fila de B conservaría
               exito=true y anunciaría una membresía que no se creó. */
            key={empresaMembresia.id}
            empresa={empresaMembresia}
            onCerrar={() => setEmpresaMembresia(null)}
            /* La lista de empresas no cambia con una membresía nueva: basta cerrar. */
            onExito={() => setEmpresaMembresia(null)}
          />
        )}

        {empresaResetAdmin && (
          <DialogoRestablecerAdmin
            /* key por empresa: remonta el diálogo (estado limpio: sin temporal vieja)
               al cambiar de fila objetivo. */
            key={empresaResetAdmin.id}
            empresa={empresaResetAdmin}
            onCerrar={() => setEmpresaResetAdmin(null)}
            /* El listado no cambia con un reset de contraseña: basta cerrar. */
            onExito={() => setEmpresaResetAdmin(null)}
          />
        )}
      </div>
    </LayoutPrincipal>
  );
}
