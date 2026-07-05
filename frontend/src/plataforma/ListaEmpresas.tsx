/**
 * Tabla del listado de empresas (tenants) para el super-admin. Presentacional:
 * recibe datos/estado por props (el fetch lo hace PantallaPlataforma). Maneja los
 * estados de carga, error visible y vacío.
 */

import { useState } from 'react';
import { Boton } from '../core/ui/Boton';
import { useTraduccion } from '../core/i18n/ContextoIdioma';
import type { EmpresaListada } from './tipos';
import styles from './ListaEmpresas.module.css';

interface PropiedadesLista {
  empresas: EmpresaListada[] | null;
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
  /** Baja / reactivación lógica del tenant. El padre llama al backend y recarga. */
  onAlternarActivo: (empresa: EmpresaListada) => void;
  /** Empresa cuyo cambio de estado está en curso (congela las acciones). */
  actualizandoId?: string | null;
  /** Abre el diálogo de añadir membresía (usuario existente) en esa empresa. */
  onAnadirMembresia: (empresa: EmpresaListada) => void;
  /** Abre el diálogo de reset de contraseña del admin principal de esa empresa. */
  onRestablecerAdmin: (empresa: EmpresaListada) => void;
}

export function ListaEmpresas({
  empresas,
  cargando,
  error,
  onReintentar,
  onAlternarActivo,
  actualizandoId = null,
  onAnadirMembresia,
  onRestablecerAdmin,
}: PropiedadesLista) {
  const { t } = useTraduccion();
  // Cualquier acción en vuelo (cambiar estado) O una recarga en curso congela TODA la
  // tabla: un solo slot de estado en el padre no soporta mutaciones concurrentes, y
  // disparar un toggle sobre una lista a medio recargar mezclaría respuestas fuera de orden.
  const accionEnVuelo = actualizandoId !== null || cargando;

  // DESACTIVAR exige dos clics (armar → confirmar): expulsa al tenant COMPLETO — un
  // misclick no debe dar de baja una empresa. Reactivar no arma (no es destructivo).
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);
  // Abrir el diálogo de membresía DESARMA cualquier baja pendiente: el estado armado
  // ("¿Confirmar baja?") no caduca, y con un flujo modal interpuesto el operador podría
  // olvidarlo y desactivar el tenant con un solo clic posterior. Desarmar al abrir el
  // diálogo restaura la garantía de dos pasos.
  const manejarAnadirMembresia = (e: EmpresaListada) => {
    setConfirmandoId(null);
    onAnadirMembresia(e);
  };
  // Igual que añadir membresía: abrir el diálogo de reset DESARMA una baja pendiente.
  const manejarRestablecerAdmin = (e: EmpresaListada) => {
    setConfirmandoId(null);
    onRestablecerAdmin(e);
  };
  const manejarToggle = (e: EmpresaListada) => {
    if (!e.activo) {
      onAlternarActivo(e); // reactivar: directo
      return;
    }
    if (confirmandoId === e.id) {
      setConfirmandoId(null);
      onAlternarActivo(e); // segundo clic: confirmado
    } else {
      setConfirmandoId(e.id); // primer clic: solo arma
    }
  };

  return (
    <section className={styles.lista}>
      <div className={styles.encabezado}>
        <h2 className={styles.titulo}>{t('plataforma.listaTitulo')}</h2>
        <Boton
          variante="secundario"
          type="button"
          onClick={onReintentar}
          // También congelado con una mutación en vuelo: una recarga lanzada en
          // paralelo podría resolver ANTES que el PATCH y pintar el estado viejo.
          disabled={accionEnVuelo}
        >
          {t('comun.actualizar')}
        </Boton>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {cargando && !empresas && <p className={styles.info}>{t('comun.cargando')}</p>}

      {!error && !cargando && empresas && empresas.length === 0 && (
        <p className={styles.vacio}>{t('plataforma.listaVacia')}</p>
      )}

      {empresas && empresas.length > 0 && (
        <table className={styles.tabla}>
          <thead>
            <tr>
              <th>{t('plataforma.colNombre')}</th>
              <th>{t('plataforma.colSlug')}</th>
              <th>{t('plataforma.colAdmin')}</th>
              <th>{t('plataforma.colCreada')}</th>
              <th>{t('plataforma.colEstado')}</th>
              <th>{t('plataforma.colAcciones')}</th>
            </tr>
          </thead>
          <tbody>
            {empresas.map((e) => (
              <tr key={e.id}>
                <td>{e.nombre}</td>
                <td>{e.slug}</td>
                <td>{e.adminEmail ?? '—'}</td>
                <td>{new Date(e.creadoEn).toLocaleDateString()}</td>
                <td>{e.activo ? t('plataforma.estadoActiva') : t('plataforma.estadoInactiva')}</td>
                <td className={styles.celdaAcciones}>
                  {/* Añadir membresía: solo tiene sentido sobre una empresa activa
                      (el backend responde 409 sobre una desactivada). */}
                  <Boton
                    variante="secundario"
                    type="button"
                    onClick={() => manejarAnadirMembresia(e)}
                    disabled={!e.activo || accionEnVuelo}
                  >
                    {t('plataforma.anadirMembresia')}
                  </Boton>
                  {/* Reset de la contraseña del admin principal: solo sobre empresa activa
                      (el backend responde 409 sobre una desactivada). */}
                  <Boton
                    variante="secundario"
                    type="button"
                    onClick={() => manejarRestablecerAdmin(e)}
                    disabled={!e.activo || accionEnVuelo}
                  >
                    {t('plataforma.restablecerAdmin')}
                  </Boton>
                  {/* Baja / reactivación lógica (nunca se borra el tenant). */}
                  <Boton
                    variante={e.activo ? 'peligro' : 'secundario'}
                    type="button"
                    onClick={() => manejarToggle(e)}
                    disabled={accionEnVuelo}
                    cargando={actualizandoId === e.id}
                  >
                    {e.activo
                      ? confirmandoId === e.id
                        ? t('plataforma.confirmarBaja')
                        : t('plataforma.desactivar')
                      : t('plataforma.reactivar')}
                  </Boton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
