import { expect, request, type Locator, type Page } from '@playwright/test';
import { env, writesAllowed } from './env';
import { goto } from './nav';

/**
 * Helpers de UI/API de FINANZAS para los @full de dinero (gasto → corrección → auditoría).
 * Todo lo que crean lleva el prefijo `e2e-` (vía test-data) y NADA se borra: el dinero
 * es inmutable por diseño, así que el residual (gastos e2e + sus reversos/correcciones y
 * filas de auditoría) queda como histórico dev, igual que fichajes y cobros
 * (docs/E2E_VISIBLE_TESTS.md §9).
 *
 * Los selectores usan los textos EXACTOS de la UI en español (idioma por defecto).
 * Los <select> de categoría y sede del FormularioGasto NO tienen htmlFor (deuda de
 * accesibilidad anotada en docs/BACKLOG.md): se localizan como hermano inmediato de su
 * <label>. Cuando se arregle, pasar a getByLabel.
 */

/** Fila de la tabla de /gastos identificada por su descripción única (`E2E Gasto e2e-…`). */
export function filaGasto(page: Page, descripcion: string): Locator {
  return page.getByRole('row').filter({ hasText: descripcion });
}

/** Total del período mostrado al pie de la tabla de /gastos (suma de montos VIGENTES). */
export async function totalPeriodoGastos(page: Page): Promise<number> {
  const texto = await page.getByText(/^Total del período/).locator('..').innerText();
  const m = texto.match(/B\/\.\s*(-?[\d.]+)/);
  if (!m) throw new Error(`No se pudo leer el total del período en /gastos: "${texto}"`);
  return Number(m[1]);
}

/**
 * Registra un gasto por UI en /gastos con una categoría NORMAL (no "pago a empleado",
 * que exigiría empleadoId) y la primera sede activa. Deja la página en /gastos con la
 * fila del gasto visible y en estado "Vigente". Requiere una sesión de gestión
 * (admin/supervisor: el empleado ni ve el botón).
 */
export async function crearGasto(
  page: Page,
  gasto: { descripcion: string; monto: number },
): Promise<Locator> {
  await goto.gastos(page);
  await page.getByRole('button', { name: '+ Registrar gasto' }).click();

  const selCategoria = page.locator('label:has-text("Categoría *") + select');
  const selSede = page.locator('label:has-text("Sede *") + select');
  // Esperar a que los catálogos carguen (el placeholder pasa de "Cargando…" a "Seleccionar…").
  await expect(selCategoria.locator('option').first()).toHaveText('Seleccionar categoría');

  // Primera categoría que NO sea de pago a empleado (el seed trae "Pago a empleado").
  const categorias = await selCategoria.locator('option').allTextContents();
  const categoria = categorias.find((c) => c !== 'Seleccionar categoría' && !/pago a empleado/i.test(c));
  if (!categoria) throw new Error('No hay ninguna categoría de gasto normal (no de pago a empleado) en el tenant.');
  await selCategoria.selectOption({ label: categoria });
  // GET /sedes devuelve solo las activas: hace falta al menos una.
  if ((await selSede.locator('option').count()) < 2) throw new Error('No hay ninguna sede activa en el tenant para registrar el gasto.');
  await selSede.selectOption({ index: 1 });

  await page.getByLabel('Monto (B/.) *').fill(gasto.monto.toFixed(2));
  await page.getByLabel('Descripción (opcional)').fill(gasto.descripcion);
  await page.getByRole('button', { name: 'Registrar gasto', exact: true }).click();

  // La lista recarga con el gasto nuevo (fecha de hoy ⇒ dentro del período por defecto).
  const fila = filaGasto(page, gasto.descripcion);
  await expect(fila).toBeVisible();
  await expect(fila.getByText('Vigente', { exact: true })).toBeVisible();
  await expect(fila).toContainText(`B/. ${gasto.monto.toFixed(2)}`);
  return fila;
}

/**
 * Abre el DialogoCorreccion de la fila y registra una CORRECCIÓN DE IMPORTE (reverso +
 * corrección) o una ANULACIÓN (solo reverso). Espera el aviso de éxito de /gastos, que
 * solo se muestra tras el 201 del backend.
 */
export async function corregirGasto(
  page: Page,
  fila: Locator,
  opcion: { modo: 'corregir'; montoCorregido: number; motivo: string } | { modo: 'anular'; motivo: string },
): Promise<void> {
  await fila.getByRole('button', { name: 'Corregir', exact: true }).click();
  const dialogo = page.getByRole('dialog', { name: 'Corregir movimiento' });
  await expect(dialogo).toBeVisible();

  if (opcion.modo === 'corregir') {
    await dialogo.getByRole('radio', { name: /Corregir el importe/ }).check();
    await dialogo.getByLabel('Monto correcto (B/.)').fill(opcion.montoCorregido.toFixed(2));
  } else {
    await dialogo.getByRole('radio', { name: /Anular el movimiento/ }).check();
  }
  await dialogo.getByLabel('Motivo *').fill(opcion.motivo);
  await dialogo
    .getByRole('button', { name: opcion.modo === 'anular' ? 'Anular movimiento' : 'Registrar corrección' })
    .click();

  // Éxito real (tras el 201): el diálogo se cierra y /gastos muestra el aviso.
  await expect(dialogo).toBeHidden();
  await expect(page.getByText('Corrección registrada: el movimiento quedó corregido.')).toBeVisible();
}

/**
 * Afirma cómo se ve un gasto ya corregido/anulado en /gastos: el original TACHADO
 * (`.montoAnterior`) junto al vigente (`.montoVigente`), el badge de estado, sin botón
 * "Corregir" (una sola corrección) y con el enlace "Ver auditoría". Devuelve el id del
 * gasto, tomado del deep-link del enlace (?registroId=).
 */
export async function afirmarGastoCorregido(
  fila: Locator,
  esperado: { original: number; vigente: number; estado: 'Corregido' | 'Anulado' },
): Promise<string> {
  await expect(fila.locator('[class*="montoAnterior"]')).toHaveText(`B/. ${esperado.original.toFixed(2)}`);
  await expect(fila.locator('[class*="montoVigente"]')).toHaveText(`B/. ${esperado.vigente.toFixed(2)}`);
  await expect(fila.getByText(esperado.estado, { exact: true })).toBeVisible();
  await expect(fila.getByRole('button', { name: 'Corregir', exact: true })).toHaveCount(0);
  const verAuditoria = fila.getByRole('link', { name: 'Ver auditoría' });
  await expect(verAuditoria).toBeVisible();
  const href = await verAuditoria.getAttribute('href');
  expect(href).toMatch(/\/auditoria-financiera\?entidad=gasto&registroId=.+/);
  const registroId = new URL(href!, 'http://x').searchParams.get('registroId');
  expect(registroId).toBeTruthy();
  return registroId!;
}

/**
 * Id de un gasto del período actual localizado por su descripción única, vía
 * GET /gastos con la sesión de admin (la UI no expone el id de una fila VIGENTE).
 */
export async function idGastoPorDescripcion(descripcion: string): Promise<string> {
  const ctx = await request.newContext({ baseURL: env.apiURL });
  try {
    const login = await ctx.post('/auth/login', { data: { email: env.adminEmail, password: env.adminPassword } });
    expect(login.ok(), 'login por API del admin e2e').toBeTruthy();
    const { accessToken } = (await login.json()) as { accessToken: string };
    const hoy = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    const hasta = `${hoy.getFullYear()}-${p(hoy.getMonth() + 1)}-${p(hoy.getDate())}`;
    const desde = `${hoy.getFullYear()}-${p(hoy.getMonth() + 1)}-01`;
    const res = await ctx.get(`/gastos?desde=${desde}&hasta=${hasta}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    expect(res.ok(), 'GET /gastos').toBeTruthy();
    const lista = (await res.json()) as Array<{ id: string; descripcion?: string | null }>;
    const gasto = lista.find((g) => g.descripcion === descripcion);
    if (!gasto) throw new Error(`No se encontró el gasto "${descripcion}" en GET /gastos del período.`);
    return gasto.id;
  } finally {
    await ctx.dispose();
  }
}

/**
 * POST /correcciones directamente por API con las credenciales dadas. Sirve para los
 * casos que la UI no ofrece: la SEGUNDA corrección (409) y el rol sin permiso (403).
 * Fail-closed: aunque los specs ya van tras requireWritesAllowed(), el helper se niega a
 * escribir si la barrera no está abierta (defensa en profundidad: un `movimientoId`
 * vigente crearía un reverso real).
 */
export async function corregirPorApi(opciones: {
  email: string;
  password: string;
  movimientoId: string;
  entidad?: 'gasto' | 'pago' | 'venta';
  motivo?: string;
  montoCorregido?: number;
}): Promise<{ status: number; mensaje: string }> {
  if (!writesAllowed) throw new Error('corregirPorApi: escritura NO permitida en este entorno (barrera fail-closed).');
  const ctx = await request.newContext({ baseURL: env.apiURL });
  try {
    const login = await ctx.post('/auth/login', {
      data: { email: opciones.email, password: opciones.password },
    });
    expect(login.ok(), `login por API de ${opciones.email}`).toBeTruthy();
    const { accessToken } = (await login.json()) as { accessToken: string };
    const res = await ctx.post('/correcciones', {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: {
        entidad: opciones.entidad ?? 'gasto',
        movimientoId: opciones.movimientoId,
        motivo: opciones.motivo ?? 'e2e: corrección por API (debe rechazarse)',
        montoCorregido: opciones.montoCorregido ?? 1,
      },
    });
    const cuerpo = (await res.json().catch(() => ({}))) as { mensaje?: string; message?: string };
    return { status: res.status(), mensaje: cuerpo.mensaje ?? cuerpo.message ?? '' };
  } finally {
    await ctx.dispose();
  }
}
