import { test, expect, type Page } from '@playwright/test';
import { requireWritesAllowed, requireAdmin } from '../helpers/env';
import { goto, irA } from '../helpers/nav';
import { nuevoEmpleado, nuevoKiosco } from '../helpers/test-data';

/**
 * @full — Fichaje de empleado en el KIOSCO (asistencia). ESCRIBE datos: crea un empleado
 * y un kiosco `e2e-*`, y registra fichajes. Se AUTO-SKIPEA sin permiso de escritura
 * (producción o sin E2E_ALLOW_WRITES=true). NUNCA toca empleados reales: crea los suyos.
 *
 * Flujo simulado (cliente real):
 *   1. Admin (sesión de global-setup) crea un empleado e2e con número y PIN.
 *   2. Admin crea un kiosco e2e y obtiene su token de dispositivo (revelado una vez).
 *   3. Se configura el token del kiosco en este equipo (localStorage) y se abre /kiosco.
 *   4. El empleado ficha: Entrada → Salida comida → Vuelta de comida → Salida (facial
 *      simulado `sim:match`, sin cámara real).
 *   5. Tras la Salida el backend calcula la Jornada; se verifica en /asistencia/jornadas.
 *   6. (2.º test) Un fichaje de EXCEPCIÓN (facial rechazado → PIN) entra en /asistencia/revision.
 *
 * Notas del dominio (verificadas en el código):
 *   - El kiosco es "stateless": no valida secuencia; cualquier tipo se puede pulsar.
 *   - La Jornada nace SOLO al fichar `salida` y requiere una `entrada` emparejable (16h).
 *   - La pantalla de resultado se AUTO-REINICIA a los 5s → se afirma el éxito de inmediato.
 *   - Fecha de la jornada = fecha UTC de la entrada (Panamá UTC-5): se amplía el filtro
 *     `hasta` por si de noche cae en el día UTC siguiente.
 */

/** Clave de localStorage del token de dispositivo del kiosco (ver servicioKiosco.ts:19). */
const CLAVE_TOKEN_KIOSCO = 'gestorpro.kioscoToken';

/** El `<select>` de sede (bare label): se distingue del selector de idioma por su opción. */
function selectSede(page: Page) {
  return page.locator('select').filter({ has: page.locator('option', { hasText: 'Sede Central' }) });
}

/** Botón de tipo de fichaje: su nombre lleva emoji ("🟢 Entrada"), y "Salida" es prefijo
 *  de "Salida comida", así que se ancla al final con regex para no confundirlos. */
function botonTipo(page: Page, tipo: string) {
  return page.getByRole('button', { name: new RegExp(`${tipo}$`) });
}

/** Crea un empleado e2e por la UI de /empleados y cierra el modal de QR. */
async function crearEmpleado(page: Page) {
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

/** Crea un kiosco e2e por la UI de /kioscos y devuelve su token (revelado una vez). */
async function crearKiosco(page: Page) {
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
async function abrirKiosco(page: Page, token: string) {
  // page ya está en el origen del front (venimos de /kioscos): localStorage es el correcto.
  await page.evaluate(
    ([clave, valor]) => localStorage.setItem(clave, valor),
    [CLAVE_TOKEN_KIOSCO, token] as const,
  );
  await page.goto('/kiosco');
  await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
}

/** Recorre selección → identificación → facial y pulsa "Registrar fichaje". */
async function pasosFichaje(
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
    facial === 'match' ? '✅ Coincide — facial aprobado' : '❌ No coincide — facial rechazado';
  await page.getByRole('button', { name: textoFacial }).click();
  await page.getByRole('button', { name: 'Registrar fichaje' }).click();
}

/** Fichaje feliz (facial OK): registra `tipo`, afirma el éxito y vuelve a selección. */
async function fichar(page: Page, kioscoOpcion: string, numero: string, tipo: string) {
  await pasosFichaje(page, kioscoOpcion, numero, tipo, 'match');
  // Éxito inmediato (la pantalla se auto-reinicia en 5s: se afirma ya).
  await expect(page.getByText(`Fichaje de ${tipo} registrado correctamente.`, { exact: true })).toBeVisible();
  // Volver a selección: pulsa "Siguiente empleado" si sigue visible; si no, el auto-reset ya volvió.
  await page.getByRole('button', { name: 'Siguiente empleado' }).click({ timeout: 4_000 }).catch(() => {});
  await expect(page.getByRole('heading', { name: 'Bienvenido' })).toBeVisible();
}

test.describe('@full — fichaje / kiosco de empleado', () => {
  requireWritesAllowed();
  requireAdmin();

  test('empleado ficha Entrada → pausa → Salida; la jornada aparece en /asistencia/jornadas', async ({ page }) => {
    test.setTimeout(120_000); // flujo largo: alta empleado + alta kiosco + 4 fichajes + jornada

    const emp = await crearEmpleado(page);
    const kio = await crearKiosco(page);
    await abrirKiosco(page, kio.token);

    // Jornada completa con pausa de comida.
    await fichar(page, kio.opcion, emp.numero, 'Entrada');
    await fichar(page, kio.opcion, emp.numero, 'Salida comida');
    await fichar(page, kio.opcion, emp.numero, 'Vuelta de comida');
    await fichar(page, kio.opcion, emp.numero, 'Salida');

    // La jornada nace tras la Salida. Verificar en /asistencia/jornadas.
    await irA(page, '/asistencia/jornadas');
    // Ampliar `hasta` por si la fecha UTC de la entrada cae "mañana" (Panamá UTC-5, de noche).
    const d = new Date();
    d.setDate(d.getDate() + 2);
    await page.locator('#filtro-hasta').fill(d.toISOString().slice(0, 10));
    // Buscar por número (filtro client-side) y afirmar la fila del empleado.
    await page.locator('#filtro-busqueda').fill(emp.numero);
    const fila = page.getByRole('row').filter({ hasText: emp.numero });
    await expect(fila).toBeVisible();
    await expect(fila).toContainText(emp.nombre);
  });

  test('fichaje de EXCEPCIÓN por PIN (facial rechazado) entra en la cola de /asistencia/revision', async ({ page }) => {
    test.setTimeout(120_000);

    const emp = await crearEmpleado(page);
    const kio = await crearKiosco(page);
    await abrirKiosco(page, kio.token);

    // Facial rechazado → 409 → paso de excepción (modo PIN, default de Sede Central).
    await pasosFichaje(page, kio.opcion, emp.numero, 'Entrada', 'nomatch');
    await page.locator('#campo-pin').fill(emp.pin);
    await page.getByRole('button', { name: 'Confirmar fichaje' }).click();
    await expect(page.getByText('Fichaje de excepción — pendiente de revisión')).toBeVisible();

    // El fichaje de excepción requiere revisión: aparece en la cola.
    await irA(page, '/asistencia/revision');
    await expect(page.getByText(emp.nombre).first()).toBeVisible();
  });
});
