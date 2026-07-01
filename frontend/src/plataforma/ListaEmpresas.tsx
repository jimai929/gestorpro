/**
 * Tabla del listado de empresas (tenants) para el super-admin. Presentacional:
 * recibe datos/estado por props (el fetch lo hace PantallaPlataforma). Maneja los
 * estados de carga, error visible y vacío.
 */

import { Boton } from '../core/ui/Boton';
import { useTraduccion } from '../core/i18n/ContextoIdioma';
import type { EmpresaListada } from './tipos';
import styles from './ListaEmpresas.module.css';

interface PropiedadesLista {
  empresas: EmpresaListada[] | null;
  cargando: boolean;
  error: string | null;
  onReintentar: () => void;
}

export function ListaEmpresas({ empresas, cargando, error, onReintentar }: PropiedadesLista) {
  const { t } = useTraduccion();

  return (
    <section className={styles.lista}>
      <div className={styles.encabezado}>
        <h2 className={styles.titulo}>{t('plataforma.listaTitulo')}</h2>
        <Boton variante="secundario" type="button" onClick={onReintentar} disabled={cargando}>
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
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
