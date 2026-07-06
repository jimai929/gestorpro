import { test, expect } from '@playwright/test';
import { requireWritesAllowed, requireAdmin } from '../helpers/env';
import { irA } from '../helpers/nav';
import { crearEmpleado, crearKiosco, abrirKiosco, fichar } from '../helpers/asistencia';

/**
 * @full — Jornada y COBRO/SALARIO tras el fichaje (asistencia). ESCRIBE datos: crea un
 * empleado + kiosco `e2e-*` y ficha. Se AUTO-SKIPEA sin permiso de escritura. Extiende
 * el flujo de fichaje.spec.ts hacia los RESULTADOS calculados:
 *   - /asistencia/jornadas: verifica la fila de la jornada y sus campos clave.
 *   - /asistencia/cobros: verifica el saldo (resultado calculado del salario/horas extra)
 *     del empleado. NOTA: NO existe una página de salario/nómina dedicada — el cobro de
 *     horas extra en /asistencia/cobros es la superficie de UI donde el salario acumulado
 *     se hace visible (saldo, % cobrable, disponible). El cálculo de nómina vive en backend.
 *
 * Dominio (verificado en el código):
 *   - La Jornada nace SOLO al fichar `salida` con una `entrada` emparejable (ventana 16h).
 *   - Columnas de /asistencia/jornadas: Empleado(nombre+número) · Fecha · Trabajadas
 *     (`Xh Ym`) · Clasificación · Extra · Monto extra · Estado(badge) · Festivo.
 *   - Estado de jornada: Calculada / Anomalía / Corregida (con fichajes a segundos de
 *     distancia el tiempo trabajado ≈ 0; el estado puede ser cualquiera de los válidos).
 *   - El filtro de fecha requiere pulsar "Filtrar" para refetch (onChange solo setea estado).
 *   - /asistencia/cobros: al elegir el empleado se consulta GET /saldo y se muestra el
 *     bloque de saldo (Saldo acumulado / % cobrable / Disponible para adelanto).
 */
test.describe('@full — jornada y cobro/salario tras fichaje', () => {
  requireWritesAllowed();
  requireAdmin();

  test('tras Entrada→pausa→Salida, la jornada muestra empleado/fecha/horas/estado, y /cobros muestra su saldo', async ({ page }) => {
    test.setTimeout(150_000); // flujo largo: alta empleado + alta kiosco + 4 fichajes + jornada + cobro

    const emp = await crearEmpleado(page);
    const kio = await crearKiosco(page);
    await abrirKiosco(page, kio.token);

    // Jornada completa con pausa de comida.
    await fichar(page, kio.opcion, emp.numero, 'Entrada');
    await fichar(page, kio.opcion, emp.numero, 'Salida comida');
    await fichar(page, kio.opcion, emp.numero, 'Vuelta de comida');
    await fichar(page, kio.opcion, emp.numero, 'Salida');

    // ── Jornada: verificar la fila y sus campos clave ──────────────────────────
    await irA(page, '/asistencia/jornadas');
    // Ampliar `hasta` (TZ Panamá UTC-5: de noche la fecha UTC de la entrada puede ser
    // "mañana") y pulsar "Filtrar" para que el refetch aplique el rango nuevo.
    const manana = new Date();
    manana.setDate(manana.getDate() + 2);
    await page.locator('#filtro-hasta').fill(manana.toISOString().slice(0, 10));
    await page.getByRole('button', { name: 'Filtrar' }).click();
    // Buscar por número (filtro client-side).
    await page.locator('#filtro-busqueda').fill(emp.numero);

    const fila = page.getByRole('row').filter({ hasText: emp.numero });
    await expect(fila).toBeVisible();
    // empleado (nombre) — la celda muestra nombre + número.
    await expect(fila).toContainText(emp.nombre);
    // fecha — formato dd/mm/aaaa.
    await expect(fila).toContainText(/\d{2}\/\d{2}\/\d{4}/);
    // horas trabajadas — formato "Xh Ym" (minutosAHorasMinutos; con fichajes a segundos ≈ "0h 0m").
    await expect(fila).toContainText(/\d+h \d+m/);
    // estado — badge con uno de los valores válidos.
    await expect(fila).toContainText(/Calculada|Anomalía|Corregida/);

    // ── Cobro / salario: verificar el saldo calculado del empleado ─────────────
    await irA(page, '/asistencia/cobros');
    await expect(page.getByRole('heading', { name: 'Cobro anticipado de horas extra' })).toBeVisible();
    await page.locator('#selector-empleado').selectOption({ label: `${emp.numero} — ${emp.nombre}` });
    // Al elegir el empleado se consulta su saldo y se muestra el bloque calculado.
    await expect(page.getByText('Saldo acumulado')).toBeVisible();
    await expect(page.getByText('Disponible para adelanto')).toBeVisible();
    // El saldo se muestra como un monto en balboas (aunque sea B/. 0.00 para un turno de ~0 min).
    await expect(page.getByText(/B\/\.\s?\d/).first()).toBeVisible();
  });
});
