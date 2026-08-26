import { test, expect } from '@playwright/test';
import { env, requireWritesAllowed, requireAdmin } from '../helpers/env';
import { nuevoGasto, CLAVE_E2E, CLAVE_E2E_2 } from '../helpers/test-data';
import { goto } from '../helpers/nav';
import { crearUsuarioConRol, loginConCambioForzado, irComoRol } from '../helpers/roles';
import {
  crearGasto,
  corregirGasto,
  filaGasto,
  afirmarGastoCorregido,
  corregirPorApi,
  totalPeriodoGastos,
  idGastoPorDescripcion,
} from '../helpers/finanzas';

/**
 * @full — CADENA DE DINERO: gasto → corrección → auditoría → segunda corrección rechazada,
 * más la matriz de roles sobre la corrección (supervisor puede; empleado no ve ni puede).
 *
 * ESCRIBE datos (gastos `e2e-*`, sus reversos/correcciones, filas de auditoría y usuarios
 * `e2e-*` de rol). Se AUTO-SKIPEA sin permiso de escritura (producción o sin
 * E2E_ALLOW_WRITES=true). Nada se borra: el dinero es INMUTABLE por diseño
 * (docs/DECISIONES.md); el residual queda como histórico dev (docs §9).
 *
 * Reglas de negocio afirmadas por UI (comportamiento REAL, verificado en el código):
 *   - El original nunca se edita: tras corregir, la fila muestra el monto original TACHADO
 *     (`.montoAnterior`) y el vigente al lado (`.montoVigente`), con badge Corregido/Anulado
 *     (PantallaGastos). El "Total del período" suma montos VIGENTES.
 *   - Un movimiento admite UNA sola corrección: la UI retira el botón "Corregir" y ofrece
 *     "Ver auditoría"; el backend responde 409 a un segundo intento (correccion.service.ts,
 *     regla "sin doble corrección" bajo lock + índice único parcial).
 *   - Todo queda en /auditoria-financiera (append-only): módulo, acción, montos original y
 *     vigente, diferencia con signo (original − vigente, signo invertido en pantalla), motivo
 *     y usuario; "Ver auditoría" abre la página filtrada por ese registro.
 *   - POST /correcciones es soloGestion (administrador y supervisor); el empleado recibe 403
 *     y ni siquiera ve el botón (PantallaGastos.puedeGestionar).
 */
test.describe('@full — dinero: gasto → corrección → auditoría → sin doble corrección', () => {
  requireWritesAllowed();
  requireAdmin();

  test('corrige el importe de un gasto; la auditoría lo refleja y una segunda corrección es rechazada (409)', async ({ page }) => {
    test.setTimeout(120_000);
    const gasto = nuevoGasto(); // monto 12.34
    const montoCorregido = 20;
    const motivo = `e2e: se tecleó 12.34 en vez de 20.00 (${gasto.descripcion})`;

    // 1. Registrar el gasto por UI → fila "Vigente" con su monto. El total del período lo incluye.
    const fila = await crearGasto(page, gasto);
    const totalAntes = await totalPeriodoGastos(page);

    // 2. Corregir el importe (reverso + corrección) desde la fila.
    await corregirGasto(page, fila, { modo: 'corregir', montoCorregido, motivo });

    // 3. Fila: original TACHADO + vigente, "Corregido", sin "Corregir", con "Ver auditoría".
    const filaCorregida = filaGasto(page, gasto.descripcion);
    const registroId = await afirmarGastoCorregido(filaCorregida, { original: 12.34, vigente: 20, estado: 'Corregido' });
    // Consumidor aguas abajo: el total del período sube exactamente la diferencia (vigente, no doble conteo).
    expect(await totalPeriodoGastos(page)).toBeCloseTo(totalAntes + (montoCorregido - 12.34), 2);

    // 4. Auditoría financiera filtrada por ese registro: UNA fila Gasto · Corrección.
    await filaCorregida.getByRole('link', { name: 'Ver auditoría' }).click();
    await expect(page).toHaveURL(/\/auditoria-financiera\?entidad=gasto&registroId=/);
    await expect(page.getByLabel('Buscar')).toHaveValue(registroId);
    const filaAud = page.getByRole('row').filter({ hasText: motivo });
    await expect(filaAud).toBeVisible();
    const celdas = filaAud.getByRole('cell');
    await expect(celdas.nth(1)).toHaveText('Gasto');             // Módulo (la celda, no el texto "E2E Gasto" del objeto)
    await expect(celdas.nth(2)).toHaveText('Corrección');        // Acción
    await expect(celdas.nth(3)).toContainText(gasto.descripcion); // Objeto: categoría · descripción
    await expect(celdas.nth(4)).toHaveText('B/. 12.34');         // Monto original
    await expect(celdas.nth(5)).toHaveText('B/. 20.00');         // Monto vigente
    await expect(celdas.nth(6)).toHaveText('+B/. 7.66');         // Diferencia con signo
    await expect(celdas.nth(7)).toHaveText(motivo);              // Motivo
    await expect(celdas.nth(8)).not.toHaveText('—');             // Usuario que corrigió
    // Detalle: línea de tiempo del dinero con sus montos (original → reverso → corrección → vigente).
    await filaAud.getByRole('button', { name: 'Ver detalle' }).click();
    const detalle = page.getByRole('dialog', { name: 'Detalle de la corrección' });
    await expect(detalle).toBeVisible();
    const pasos = detalle.getByRole('listitem');
    await expect(pasos.nth(0)).toContainText('Registro original');
    await expect(pasos.nth(0)).toContainText('B/. 12.34');
    await expect(pasos.nth(1)).toContainText('Reverso (anula el original)');
    await expect(pasos.nth(1)).toContainText('−B/. 12.34');
    await expect(pasos.nth(2)).toContainText('Corrección (monto correcto)');
    await expect(pasos.nth(2)).toContainText('B/. 20.00');
    await expect(pasos.nth(3)).toContainText('Monto vigente');
    await expect(pasos.nth(3)).toContainText('B/. 20.00');
    await page.keyboard.press('Escape');
    await expect(detalle).toBeHidden();

    // 5. SEGUNDA corrección del mismo movimiento (por API, la UI ya no la ofrece): 409.
    const segunda = await corregirPorApi({
      email: env.adminEmail, password: env.adminPassword, movimientoId: registroId,
    });
    expect(segunda.status).toBe(409);
    expect(segunda.mensaje).toContain('ya fue corregido');

    // 6. Y el estado NO cambió: sigue corregido a 20.00 (nada se sobrescribió).
    await goto.gastos(page);
    await afirmarGastoCorregido(filaGasto(page, gasto.descripcion), { original: 12.34, vigente: 20, estado: 'Corregido' });
  });

  test('anula un gasto (solo reverso): queda en cero, "Anulado", y la auditoría lo registra como Anulación', async ({ page }) => {
    test.setTimeout(120_000);
    const gasto = nuevoGasto();
    const motivo = `e2e: no debió registrarse (${gasto.descripcion})`;

    const fila = await crearGasto(page, gasto);
    const totalAntes = await totalPeriodoGastos(page);
    await corregirGasto(page, fila, { modo: 'anular', motivo });

    const filaAnulada = filaGasto(page, gasto.descripcion);
    await afirmarGastoCorregido(filaAnulada, { original: 12.34, vigente: 0, estado: 'Anulado' });
    expect(await totalPeriodoGastos(page)).toBeCloseTo(totalAntes - 12.34, 2);

    await filaAnulada.getByRole('link', { name: 'Ver auditoría' }).click();
    const filaAud = page.getByRole('row').filter({ hasText: motivo });
    await expect(filaAud).toBeVisible();
    const celdas = filaAud.getByRole('cell');
    await expect(celdas.nth(1)).toHaveText('Gasto');
    await expect(celdas.nth(2)).toHaveText('Anulación');
    await expect(celdas.nth(4)).toHaveText('B/. 12.34');
    await expect(celdas.nth(5)).toHaveText('B/. 0.00');
    await expect(celdas.nth(6)).toHaveText('−B/. 12.34'); // diferencia negativa con signo explícito
    await filaAud.getByRole('button', { name: 'Ver detalle' }).click();
    const detalle = page.getByRole('dialog', { name: 'Detalle de la corrección' });
    await expect(detalle.getByRole('listitem').nth(2)).toContainText('Sin nuevo monto (anulación)');
    await expect(detalle.getByRole('listitem').nth(3)).toContainText('B/. 0.00');
  });

  test('roles: el supervisor SÍ corrige; el empleado no ve "Corregir" ni "+ Registrar gasto" y POST /correcciones le da 403', async ({ page, browser }) => {
    test.setTimeout(180_000);
    // El admin deja dos gastos vigentes y crea las cuentas de rol.
    const gastoSup = nuevoGasto();
    const gastoEmp = nuevoGasto();
    await crearGasto(page, gastoSup);
    await crearGasto(page, gastoEmp);
    const supervisor = await crearUsuarioConRol(page, 'supervisor');
    const empleado = await crearUsuarioConRol(page, 'empleado');

    // Supervisor: gestión autorizada (soloGestion) → puede corregir desde la UI.
    const ctxSup = await browser.newContext();
    const sup = await ctxSup.newPage();
    try {
      await loginConCambioForzado(sup, supervisor.email, CLAVE_E2E, CLAVE_E2E_2);
      expect(await irComoRol(sup, '/gastos')).toBe('/gastos');
      const fila = filaGasto(sup, gastoSup.descripcion);
      await expect(fila).toBeVisible();
      await corregirGasto(sup, fila, { modo: 'corregir', montoCorregido: 15, motivo: `e2e: corrige el supervisor (${gastoSup.descripcion})` });
      await afirmarGastoCorregido(filaGasto(sup, gastoSup.descripcion), { original: 12.34, vigente: 15, estado: 'Corregido' });
    } finally {
      await ctxSup.close();
    }

    // Empleado: consulta la lista pero sin acciones de gestión…
    const ctxEmp = await browser.newContext();
    const emp = await ctxEmp.newPage();
    try {
      await loginConCambioForzado(emp, empleado.email, CLAVE_E2E, CLAVE_E2E_2);
      expect(await irComoRol(emp, '/gastos')).toBe('/gastos');
      await expect(filaGasto(emp, gastoEmp.descripcion)).toBeVisible(); // puede consultar
      await expect(emp.getByRole('button', { name: '+ Registrar gasto' })).toHaveCount(0);
      await expect(emp.getByRole('button', { name: 'Corregir', exact: true })).toHaveCount(0);
      await expect(emp.getByRole('link', { name: 'Ver auditoría' })).toHaveCount(0);
    } finally {
      await ctxEmp.close();
    }
    // …y el backend rechaza la corrección de un gasto VIGENTE con 403 (soloGestion), sin efecto.
    const idGastoEmp = await idGastoPorDescripcion(gastoEmp.descripcion);
    const comoEmpleado = await corregirPorApi({
      email: empleado.email, password: CLAVE_E2E_2, movimientoId: idGastoEmp, montoCorregido: 1,
    });
    expect(comoEmpleado.status).toBe(403);
    expect(comoEmpleado.mensaje).toContain('No tiene permiso');
    await goto.gastos(page);
    const filaEmp = filaGasto(page, gastoEmp.descripcion);
    await expect(filaEmp.getByText('Vigente', { exact: true })).toBeVisible();
    await expect(filaEmp.getByRole('button', { name: 'Corregir', exact: true })).toBeVisible(); // sigue corregible: nada se escribió
  });
});
