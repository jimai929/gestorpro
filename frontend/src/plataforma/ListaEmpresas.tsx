/**
 * Tabla del listado de empresas (tenants) para el super-admin. Presentacional:
 * recibe datos/estado por props (el fetch lo hace PantallaPlataforma). Maneja los
 * estados de carga, error visible y vacío.
 */

import { useEffect, useState } from 'react';
import { Boton } from '../core/ui/Boton';
import { useTraduccion } from '../core/i18n/ContextoIdioma';
import type { EmpresaListada, EstadoEmpresa } from './tipos';
import styles from './ListaEmpresas.module.css';

interface PropiedadesLista {
  empresas: EmpresaListada[] | null;
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
  /** Transición de estado del tenant (B3). El padre llama al backend y recarga. */
  onCambiarEstado: (empresa: EmpresaListada, estado: EstadoEmpresa) => void;
  /** Empresa cuyo cambio de estado está en curso (congela las acciones). */
  actualizandoId?: string | null;
  /** Abre el diálogo de añadir membresía (usuario existente) en esa empresa. */
  onAnadirMembresia: (empresa: EmpresaListada) => void;
  /** Abre el diálogo de reset de contraseña del admin principal de esa empresa. */
  onRestablecerAdmin: (empresa: EmpresaListada) => void;
}

/** Acción destructiva armable (dos clics): suspender o cancelar. */
type AccionArmable = 'suspender' | 'cancelar';

export function ListaEmpresas({
  empresas,
  cargando,
  error,
  onReintentar,
  onCambiarEstado,
  actualizandoId = null,
  onAnadirMembresia,
  onRestablecerAdmin,
}: PropiedadesLista) {
  const { t } = useTraduccion();
  // Cualquier acción en vuelo (cambiar estado) O una recarga en curso congela TODA la
  // tabla: un solo slot de estado en el padre no soporta mutaciones concurrentes, y
  // disparar una transición sobre una lista a medio recargar mezclaría respuestas
  // fuera de orden.
  const accionEnVuelo = actualizandoId !== null || cargando;

  // SUSPENDER y CANCELAR exigen dos clics (armar → confirmar): expulsan al tenant
  // COMPLETO (y cancelar es TERMINAL) — un misclick no debe tumbar una empresa. Un solo
  // slot {id, accion}: armar una acción desarma cualquier otra (nunca dos armadas a la vez).
  // Reactivar no arma (no es destructivo).
  const [confirmando, setConfirmando] = useState<{ id: string; accion: AccionArmable } | null>(null);
  // Datos nuevos DESARMAN: un armado no debe sobrevivir a una recarga de la lista —
  // con cancelar siendo TERMINAL, un armado zombi convertiría el siguiente clic en
  // cancelación directa de un solo paso.
  useEffect(() => {
    setConfirmando(null);
  }, [empresas]);
  // Abrir un diálogo (membresía / reset) DESARMA cualquier acción pendiente: el estado
  // armado no caduca, y con un flujo modal interpuesto el operador podría olvidarlo y
  // ejecutar la transición con un solo clic posterior. Desarmar restaura los dos pasos.
  const manejarAnadirMembresia = (e: EmpresaListada) => {
    setConfirmando(null);
    onAnadirMembresia(e);
  };
  const manejarRestablecerAdmin = (e: EmpresaListada) => {
    setConfirmando(null);
    onRestablecerAdmin(e);
  };
  // Reactivar es directo (no destructivo), pero TAMBIÉN desarma: igual que los
  // diálogos, ninguna interacción intermedia puede dejar vivo un armado ajeno.
  const manejarReactivar = (e: EmpresaListada) => {
    setConfirmando(null);
    onCambiarEstado(e, 'activa');
  };
  const manejarArmable = (e: EmpresaListada, accion: AccionArmable) => {
    if (confirmando?.id === e.id && confirmando.accion === accion) {
      setConfirmando(null);
      onCambiarEstado(e, accion === 'suspender' ? 'suspendida' : 'cancelada'); // 2.º clic
    } else {
      setConfirmando({ id: e.id, accion }); // 1.er clic: solo arma (y desarma lo demás)
    }
  };
  const armada = (e: EmpresaListada, accion: AccionArmable) =>
    confirmando?.id === e.id && confirmando.accion === accion;

  const etiquetaEstado: Record<EstadoEmpresa, string> = {
    activa: t('plataforma.estadoActiva'),
    suspendida: t('plataforma.estadoSuspendida'),
    cancelada: t('plataforma.estadoCancelada'),
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
                <td>{etiquetaEstado[e.estado]}</td>
                <td className={styles.celdaAcciones}>
                  {/* Añadir membresía y reset del admin: SOLO sobre una empresa ACTIVA
                      (el backend responde 409 sobre suspendida/cancelada). */}
                  <Boton
                    variante="secundario"
                    type="button"
                    onClick={() => manejarAnadirMembresia(e)}
                    disabled={e.estado !== 'activa' || accionEnVuelo}
                  >
                    {t('plataforma.anadirMembresia')}
                  </Boton>
                  <Boton
                    variante="secundario"
                    type="button"
                    onClick={() => manejarRestablecerAdmin(e)}
                    disabled={e.estado !== 'activa' || accionEnVuelo}
                  >
                    {t('plataforma.restablecerAdmin')}
                  </Boton>
                  {/* Transiciones B3. activa → Suspender (armable) y Cancelar (armable);
                      suspendida → Reactivar (directo) y Cancelar (armable);
                      cancelada → TERMINAL: ninguna transición (sin botones de estado). */}
                  {e.estado === 'activa' && (
                    <Boton
                      variante="peligro"
                      type="button"
                      onClick={() => manejarArmable(e, 'suspender')}
                      disabled={accionEnVuelo}
                      cargando={actualizandoId === e.id}
                    >
                      {armada(e, 'suspender')
                        ? t('plataforma.confirmarSuspension')
                        : t('plataforma.suspender')}
                    </Boton>
                  )}
                  {e.estado === 'suspendida' && (
                    <Boton
                      variante="secundario"
                      type="button"
                      onClick={() => manejarReactivar(e)}
                      disabled={accionEnVuelo}
                      cargando={actualizandoId === e.id}
                    >
                      {t('plataforma.reactivar')}
                    </Boton>
                  )}
                  {e.estado !== 'cancelada' && (
                    <Boton
                      variante="peligro"
                      type="button"
                      onClick={() => manejarArmable(e, 'cancelar')}
                      disabled={accionEnVuelo}
                      cargando={actualizandoId === e.id}
                    >
                      {armada(e, 'cancelar')
                        ? t('plataforma.confirmarCancelacion')
                        : t('plataforma.cancelarEmpresa')}
                    </Boton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
