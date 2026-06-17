/**
 * Formulario de empleado: ALTA y EDICIÓN.
 *
 * - Sin `empleado` → alta (pide PIN; al guardar, el padre muestra el QR).
 * - Con `empleado` → edición (no pide PIN; el reset de PIN es una acción aparte).
 *
 * No usa `<form>` (div + botón con `onClick`) por convención del paquete, para
 * no anidar formularios. El turno se difiere (turnoId queda sin asignar por
 * ahora). La foto queda como campo preparado y DESHABILITADO: el reconocimiento
 * facial es una tarea futura; aquí solo se deja el hueco.
 */

import { useState, useEffect, useCallback } from 'react';
import { Boton } from '../../core/ui/Boton';
import { Entrada } from '../../core/ui/Entrada';
import { useTraduccion } from '../../core/i18n/ContextoIdioma';
import { obtenerSedes } from '../sedes/servicioSedes';
import type { Sede } from '../sedes/tipos';
import { crearEmpleado, editarEmpleado, obtenerRolesOperativos } from './servicioEmpleados';
import type { Empleado, EmpleadoCreado, RolOperativo } from './tipos';
import styles from './FormularioEmpleado.module.css';

interface PropiedadesFormulario {
  empleado?: Empleado;
  onGuardado: (resultado: Empleado | EmpleadoCreado) => void;
  onCancelar: () => void;
}

export function FormularioEmpleado({ empleado, onGuardado, onCancelar }: PropiedadesFormulario) {
  const { t } = useTraduccion();
  const esEdicion = empleado !== undefined;

  const [sedes, setSedes] = useState<Sede[]>([]);
  const [roles, setRoles] = useState<RolOperativo[]>([]);
  const [numero, setNumero] = useState(empleado?.numero ?? '');
  const [nombre, setNombre] = useState(empleado?.nombre ?? '');
  const [sedeId, setSedeId] = useState(empleado?.sedeId ?? '');
  const [salario, setSalario] = useState(empleado ? String(empleado.salarioFijo) : '');
  const [pin, setPin] = useState('');
  // IDs de roles operativos seleccionados (en edición arrancan con los actuales).
  const [rolesIds, setRolesIds] = useState<string[]>(empleado?.roles.map((r) => r.id) ?? []);
  const [guardando, setGuardando] = useState(false);
  // `error` es SOLO del guardado. Las cargas de sedes y de roles tienen su propio
  // estado (cargando / falló + reintento) para que un fallo no pise al otro ni al
  // mensaje de guardado, y para no fingir "no hay roles" cuando el fetch falló.
  const [error, setError] = useState<string | null>(null);
  const [cargandoSedes, setCargandoSedes] = useState(true);
  const [errorSedes, setErrorSedes] = useState<string | null>(null);
  const [cargandoRoles, setCargandoRoles] = useState(true);
  const [errorRoles, setErrorRoles] = useState<string | null>(null);

  const cargarSedes = useCallback(() => {
    setCargandoSedes(true);
    setErrorSedes(null);
    void obtenerSedes()
      .then(setSedes)
      .catch(() => setErrorSedes(t('adm.emp.errSedes')))
      .finally(() => setCargandoSedes(false));
  }, [t]);

  const cargarRoles = useCallback(() => {
    setCargandoRoles(true);
    setErrorRoles(null);
    void obtenerRolesOperativos()
      .then(setRoles)
      .catch(() => setErrorRoles(t('adm.emp.errRoles')))
      .finally(() => setCargandoRoles(false));
  }, [t]);

  useEffect(() => {
    cargarSedes();
    cargarRoles();
  }, [cargarSedes, cargarRoles]);

  const alternarRol = (id: string) => {
    setRolesIds((previo) =>
      previo.includes(id) ? previo.filter((r) => r !== id) : [...previo, id],
    );
  };

  const guardar = async () => {
    setError(null);

    const salarioNum = parseFloat(salario);
    if (!numero.trim() || !nombre.trim() || !sedeId) {
      setError(t('adm.emp.errCamposReq'));
      return;
    }
    if (isNaN(salarioNum) || salarioNum < 0) {
      setError(t('adm.emp.errSalario'));
      return;
    }
    if (!esEdicion && !/^\d{4}$/.test(pin)) {
      setError(t('adm.emp.errPin'));
      return;
    }

    setGuardando(true);
    try {
      const resultado = esEdicion
        ? await editarEmpleado(empleado.id, {
            numero: numero.trim(),
            nombre: nombre.trim(),
            sedeId,
            salarioFijo: salarioNum,
            // Si el catálogo de roles falló, se OMITE rolesOperativos: el backend conserva los
            // actuales (contrato: undefined = no se tocan). No se reenvía a ciegas un conjunto
            // que el admin no pudo ver ni editar. (ALTA va por la otra rama y H1 ya la bloquea.)
            ...(errorRoles ? {} : { rolesOperativos: rolesIds }),
          })
        : await crearEmpleado({
            numero: numero.trim(),
            nombre: nombre.trim(),
            sedeId,
            salarioFijo: salarioNum,
            pin,
            rolesOperativos: rolesIds,
          });
      onGuardado(resultado);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('adm.emp.errGuardar'));
    } finally {
      setGuardando(false);
    }
  };

  // En edición, guardar espera a que el catálogo de roles termine de cargar (D2):
  // con la carga en vuelo errorRoles aún es null y el body llevaría el snapshot a ciegas.
  const completo = numero.trim() && nombre.trim() && sedeId && salario && (esEdicion || pin.length === 4) && (esEdicion || !errorRoles) && !(esEdicion && cargandoRoles);

  return (
    <div className={styles.contenedor}>
      <p className={styles.titulo}>{esEdicion ? t('adm.emp.editar') : t('adm.emp.nuevo')}</p>

      {error && <p className={styles.error}>{error}</p>}

      <div className={styles.fila}>
        <Entrada
          etiqueta={t('adm.emp.numero')}
          value={numero}
          onChange={(e) => setNumero(e.target.value)}
          placeholder={t('adm.emp.numeroPlaceholder')}
          disabled={guardando}
        />
        <Entrada
          etiqueta={t('adm.emp.nombre')}
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder={t('adm.emp.nombrePlaceholder')}
          disabled={guardando}
        />
        <div className={styles.grupoSelect}>
          <label className={styles.etiqueta}>{t('adm.emp.sede')}</label>
          <select
            className={styles.select}
            value={sedeId}
            onChange={(e) => setSedeId(e.target.value)}
            disabled={guardando || cargandoSedes || errorSedes !== null}
          >
            <option value="">
              {cargandoSedes ? t('comun.cargando') : errorSedes ? t('adm.noDisponible') : t('adm.emp.selSede')}
            </option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
          {errorSedes && (
            <span className={styles.ayudaError}>
              {errorSedes}{' '}
              <button type="button" className={styles.enlaceReintentar} onClick={cargarSedes}>
                {t('adm.reintentar')}
              </button>
            </span>
          )}
        </div>
        <Entrada
          etiqueta={t('adm.emp.salario')}
          type="number"
          value={salario}
          onChange={(e) => setSalario(e.target.value)}
          placeholder="0.00"
          min="0"
          step="0.01"
          disabled={guardando}
        />
        {!esEdicion && (
          <Entrada
            etiqueta={t('adm.emp.pin')}
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            placeholder="••••"
            inputMode="numeric"
            maxLength={4}
            ayuda={t('adm.emp.pinAyuda')}
            disabled={guardando}
          />
        )}
        {/* Foto preparada para reconocimiento facial — deshabilitada (tarea futura). */}
        <div className={styles.grupoSelect}>
          <label className={styles.etiqueta}>{t('adm.emp.fotoRef')}</label>
          <input
            className={styles.select}
            type="text"
            value=""
            placeholder={t('adm.emp.fotoPlaceholder')}
            disabled
            readOnly
          />
        </div>
      </div>

      {/* Roles operativos (cajera, verificador, …). Un empleado puede tener varios. */}
      <div className={styles.roles}>
        <span className={styles.etiqueta}>{t('adm.emp.rolesOperativos')}</span>
        <div className={styles.rolesLista}>
          {cargandoRoles ? (
            <span className={styles.rolesVacio}>{t('adm.emp.cargandoRoles')}</span>
          ) : errorRoles ? (
            <span className={styles.ayudaError}>
              {errorRoles}{' '}
              <button type="button" className={styles.enlaceReintentar} onClick={cargarRoles}>
                {t('adm.reintentar')}
              </button>
              {esEdicion && t('adm.emp.conservaRoles')}
            </span>
          ) : roles.length === 0 ? (
            <span className={styles.rolesVacio}>{t('adm.emp.sinRoles')}</span>
          ) : (
            roles.map((rol) => (
              <label key={rol.id} className={styles.rolItem}>
                <input
                  type="checkbox"
                  checked={rolesIds.includes(rol.id)}
                  onChange={() => alternarRol(rol.id)}
                  disabled={guardando}
                />
                {rol.nombre}
              </label>
            ))
          )}
        </div>
      </div>

      <div className={styles.acciones}>
        <Boton type="button" variante="secundario" onClick={onCancelar} disabled={guardando}>
          {t('comun.cancelar')}
        </Boton>
        <Boton type="button" cargando={guardando} disabled={!completo} onClick={() => { void guardar(); }}>
          {esEdicion ? t('adm.emp.guardarCambios') : t('adm.emp.crear')}
        </Boton>
      </div>
    </div>
  );
}
