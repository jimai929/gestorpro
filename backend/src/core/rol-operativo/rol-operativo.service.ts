import { txEmpresa } from '../tenant/contexto.js';

interface RolOperativoFila {
  id: string;
  clave: string;
  nombre: string;
  activo: boolean;
}

/** DTO público de un rol operativo (catálogo de roles de la operación). */
function aRolDto(r: RolOperativoFila) {
  return { id: r.id, clave: r.clave, nombre: r.nombre, activo: r.activo };
}

/**
 * Lista los roles operativos (cajera, verificador, …). Por defecto solo los
 * activos: los consumen el formulario de empleado (asignar roles) y los selects
 * del cierre. Con `incluirInactivos`, todos (para una futura pantalla de gestión).
 */
export function listarRolesOperativos(opciones?: { incluirInactivos?: boolean }) {
  return txEmpresa((tx) =>
    tx.rolOperativo
      .findMany({
        where: opciones?.incluirInactivos ? {} : { activo: true },
        orderBy: { nombre: 'asc' },
        select: { id: true, clave: true, nombre: true, activo: true },
      })
      .then((lista) => lista.map(aRolDto)),
  );
}
