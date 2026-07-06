import { runId } from './env';

/**
 * Generadores de datos de prueba ÚNICOS. TODO dato creado por los @full lleva el
 * prefijo `runId` (`e2e-YYYYMMDD-HHMMSS`) + un contador, para que sea trivial de
 * distinguir de datos de clientes reales y de limpiar. JAMÁS se codifican datos de
 * clientes reales.
 */

let contador = 0;
function siguiente(): string {
  contador += 1;
  return `${runId}-${String(contador).padStart(3, '0')}`;
}

/** Contraseña temporal fuerte y determinista para las cuentas de prueba (>=8, cumple el schema). */
export const CLAVE_E2E = 'E2e-Test-Pw-123*';

export function nuevoUsuario(rol: 'administrador' | 'supervisor' | 'empleado' = 'empleado') {
  const id = siguiente();
  return {
    nombre: `E2E Usuario ${id}`,
    email: `${id}@e2e.local`,
    password: CLAVE_E2E,
    rol,
  };
}

export function nuevoEmpleado() {
  const id = siguiente();
  return {
    nombre: `E2E Empleado ${id}`,
    numero: id, // único global (uq per-empresa)
    salarioFijo: 1000,
  };
}

export function nuevoGasto() {
  const id = siguiente();
  return { descripcion: `E2E Gasto ${id}`, monto: 12.34 };
}

export function nuevaCompra() {
  const id = siguiente();
  return { numeroFactura: `F-${id}`, montoTotal: 100 };
}
