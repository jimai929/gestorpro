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

/**
 * PIN de 4 dígitos NO trivial para empleados de prueba. `validarPin` (backend) rechaza
 * repeticiones (0000) y secuencias ±1 (1234/4321); `9518` no es ninguna. Sirve para el
 * fichaje de EXCEPCIÓN por PIN (el camino feliz por facial no necesita PIN).
 */
export const PIN_E2E = '9518';

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
    numero: id, // único global (uq per-empresa); es lo que se teclea en el kiosco
    salarioFijo: 1000,
    pin: PIN_E2E,
  };
}

export function nuevoKiosco() {
  const id = siguiente();
  return { nombre: `E2E Kiosco ${id}` };
}

export function nuevoGasto() {
  const id = siguiente();
  return { descripcion: `E2E Gasto ${id}`, monto: 12.34 };
}

export function nuevaCompra() {
  const id = siguiente();
  return { numeroFactura: `F-${id}`, montoTotal: 100 };
}
