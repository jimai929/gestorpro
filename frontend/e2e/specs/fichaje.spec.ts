import { test, expect } from '@playwright/test';
import { requireWritesAllowed, requireAdmin } from '../helpers/env';
import { irA } from '../helpers/nav';
import { crearEmpleado, crearKiosco, abrirKiosco, pasosFichaje, fichar } from '../helpers/asistencia';

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
    await page.getByRole('button', { name: 'Filtrar' }).click();
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
