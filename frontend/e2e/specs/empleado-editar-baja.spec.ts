import { test, expect } from '@playwright/test';
import { requireWritesAllowed, requireAdmin } from '../helpers/env';
import { crearEmpleado } from '../helpers/asistencia';

/**
 * @full — Empleado: EDICIÓN y BAJA LÓGICA (área de administración). ESCRIBE datos: crea un
 * empleado `e2e-*`, edita sus campos y lo desactiva. Se AUTO-SKIPEA sin permiso de
 * escritura (producción o sin E2E_ALLOW_WRITES=true). NUNCA toca empleados reales.
 *
 * Verificado en el código (PantallaEmpleados.tsx) — la BAJA es SEGURA:
 *   - La baja es LÓGICA (soft): "Desactivar" hace PUT /empleados/:id { activo:false };
 *     NUNCA hay borrado físico (fichajes/jornadas/saldos/cerradoPor lo referencian).
 *   - La lista SIEMPRE incluye activos e inactivos (GET /empleados?incluirInactivos=true);
 *     NO hay filtro activos/inactivos en la UI. Un empleado desactivado NO desaparece de
 *     la tabla: su badge de Estado pasa a "Inactivo" y su botón de acción ofrece "Activar".
 *   - La edición reutiliza FormularioEmpleado (sin pedir PIN); botón "Guardar cambios".
 *
 * Por eso el assert de baja es sobre el badge "Inactivo" (comportamiento REAL de la UI),
 * NO sobre la ausencia de la fila (no aplica: es soft-delete, la fila permanece).
 */
test.describe('@full — empleado: editar y baja lógica', () => {
  requireWritesAllowed();
  requireAdmin();

  test('edita nombre y salario de un empleado e2e y luego lo desactiva (baja lógica); la lista refleja ambos', async ({ page }) => {
    test.setTimeout(120_000);

    // 1. Crear empleado e2e por UI. Quedamos en /empleados con su fila visible.
    const emp = await crearEmpleado(page);
    const nuevoNombre = `${emp.nombre} (editado)`;
    const nuevoSalario = '1500';

    // Fila localizada por NÚMERO (estable: no depende de orden ni del nombre, que cambiará).
    const fila = () => page.getByRole('row').filter({ hasText: emp.numero });
    await expect(fila()).toBeVisible();
    // Estado inicial: Activo (badge exacto — "Inactivo" contiene "activo", de ahí exact).
    await expect(fila().getByText('Activo', { exact: true })).toBeVisible();

    // 2-3. Abrir edición desde la fila.
    await fila().getByRole('button', { name: 'Editar', exact: true }).click();

    // 4. Modificar campos SEGUROS: nombre y salario fijo (config del empleado, no dinero
    //    transaccional inmutable). El PIN no se pide en edición.
    await page.getByLabel('Nombre *').fill(nuevoNombre);
    await page.getByLabel('Salario fijo (B/.) *').fill(nuevoSalario);

    // 5. Guardar. (El botón se habilita cuando el catálogo de roles termina de cargar;
    //    Playwright espera su actionability automáticamente.)
    await page.getByRole('button', { name: 'Guardar cambios' }).click();

    // 6. La lista recarga: la fila (MISMO número) muestra los valores nuevos.
    await expect(fila()).toContainText(nuevoNombre);           // nombre editado
    await expect(fila()).toContainText('B/. 1500.00');         // salario editado

    // 7. Baja LÓGICA: "Desactivar" → PUT activo:false (nunca borra).
    await fila().getByRole('button', { name: 'Desactivar', exact: true }).click();

    // 8. Comportamiento REAL de la UI: la fila permanece (la lista incluye inactivos);
    //    el badge pasa a "Inactivo" y el botón de acción ahora ofrece "Activar".
    await expect(fila().getByText('Inactivo', { exact: true })).toBeVisible();
    await expect(fila().getByRole('button', { name: 'Activar', exact: true })).toBeVisible();
    // No se afirma ausencia de la fila: la baja es SOFT (activo=false); la fila NO se borra.
  });
});
