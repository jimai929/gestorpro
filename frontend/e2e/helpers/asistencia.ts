import { expect, type Page } from '@playwright/test';
import { goto } from './nav';
import { nuevoEmpleado, nuevoKiosco } from './test-data';

/**
 * Helpers de UI de ASISTENCIA reutilizables por los specs @full (fichaje, jornada/cobro).
 * Todo por UI real, sin data-testid: selectores por role/name/texto español + ids estables.
 * Crean SIEMPRE datos `e2e-*`; nunca tocan empleados reales.
 */

/** Clave de localStorage del token de dispositivo del kiosco (ver servicioKiosco.ts:19). */
export const CLAVE_TOKEN_KIOSCO = 'gestorpro.kioscoToken';

/** El `<select>` de sede (label suelto sin htmlFor): se distingue del selector de idioma
 *  (que también es un <select> en la barra) por contener la opción "Sede Central". */
function selectSede(page: Page) {
  return page.locator('select').filter({ has: page.locator('option', { hasText: 'Sede Central' }) });
}

/** Botón de tipo de fichaje: su nombre lleva emoji ("🟢 Entrada"), y "Salida" es prefijo
 *  de "Salida comida", así que se ancla al final con regex para no confundirlos. */
function botonTipo(page: Page, tipo: string) {
  return page.getByRole('button', { name: new RegExp(`${tipo}$`) });
}

/** Crea un empleado `e2e-*` por la UI de /empleados y cierra el modal de QR. */
export async function crearEmpleado(page: Page) {
  const emp = nuevoEmpleado();
  await goto.empleados(page);
  await page.getByRole('button', { name: '+ Registrar empleado' }).click();
  await page.getByLabel('Número *').fill(emp.numero);
  await page.getByLabel('Nombre *').fill(emp.nombre);
  await selectSede(page).selectOption({ label: 'Sede Central' });
  await page.getByLabel('Salario fijo (B/.) *').fill(String(emp.salarioFijo));
  await page.getByLabel('PIN (4 dígitos) *').fill(emp.pin);
  await page.getByRole('button', { name: 'Crear empleado' }).click();
  // Tras crear, aparece el modal (role=dialog) con el QR del empleado; se cierra.
  const dialogo = page.getByRole('dialog');
  await expect(dialogo.getByText(`QR de ${emp.nombre}`)).toBeVisible();
  await dialogo.getByRole('button', { name: 'Cerrar' }).click();
  return emp;
}

/** Crea un kiosco `e2e-*` por la UI de /kioscos y devuelve su token (revelado una vez). */
export async function crearKiosco(page: Page) {
  const kio = nuevoKiosco();
  await goto.kioscos(page);
  await page.getByRole('button', { name: '+ Registrar kiosco' }).click();
  await page.getByLabel('Nombre *').fill(kio.nombre);
  await selectSede(page).selectOption({ label: 'Sede Central' });
  await page.getByRole('button', { name: 'Crear kiosco' }).click();
  // El token se revela UNA sola vez en un <code>.
  const code = page.locator('code');
  await expect(code).toBeVisible();
  const token = (await code.textContent())?.trim() ?? '';
  expect(token.length).toBeGreaterThan(0);
  // La opción del selector del kiosco muestra "{nombre} ({sede})".
  return { nombre: kio.nombre, opcion: `${kio.nombre} (Sede Central)`, token };
}

/** Configura el token del kiosco en este equipo (localStorage) y abre /kiosco. */
export async function abrirKiosco(page: Page, token: string) {
  // page ya está en el origen del front (venimos de /kioscos): localStorage es el correcto.
  await page.evaluate(
    ([clave, valor]) => localStorage.setItem(clave, valor),
    [CLAVE_TOKEN_KIOSCO, token] as const,
  );
  await page.goto('/kiosco');
  await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
}

/** Recorre selección → identificación → facial y pulsa "Registrar fichaje". */
export async function pasosFichaje(
  page: Page,
  kioscoOpcion: string,
  numero: string,
  tipo: string,
  facial: 'match' | 'nomatch' = 'match',
) {
  await page.locator('#selector-kiosco').selectOption({ label: kioscoOpcion });
  await botonTipo(page, tipo).click();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByPlaceholder('Número de empleado o QR').fill(numero);
  await page.getByRole('button', { name: 'Continuar' }).click();
  const textoFacial =
    facial === 'match' ? 'Coincide — facial aprobado' : 'No coincide — facial rechazado';
  await page.getByRole('button', { name: textoFacial }).click();
  await page.getByRole('button', { name: 'Registrar fichaje' }).click();
}

/** Fichaje feliz (facial OK): registra `tipo`, afirma el éxito y vuelve a selección. */
export async function fichar(page: Page, kioscoOpcion: string, numero: string, tipo: string) {
  await pasosFichaje(page, kioscoOpcion, numero, tipo, 'match');
  // Éxito inmediato (la pantalla se auto-reinicia en 5s: se afirma ya).
  await expect(page.getByText(`Fichaje de ${tipo} registrado correctamente.`, { exact: true })).toBeVisible();
  // Volver a selección: pulsa "Siguiente empleado" si sigue visible; si no, el auto-reset ya volvió.
  await page.getByRole('button', { name: 'Siguiente empleado' }).click({ timeout: 4_000 }).catch(() => {});
  await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
}
