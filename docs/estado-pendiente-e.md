# Estado pendiente — Parte (e)

Documento de traspaso. Cinco bloques.

---

## BLOQUE 1 — LISTA TRIADA COMPLETA (24 hallazgos)

A = pantallas (recarga fallida tras mutación / mensaje genérico en carrera).
B = tests de fallo de backend faltantes.

| código | archivo:línea | severidad | descripción (1 línea) |
|--------|---------------|-----------|------------------------|
| A1 | `frontend/src/administracion/empleado/PantallaEmpleados.tsx:~92-101` | media | Tras alta abre modal QR aunque la recarga de la lista haya fallado (QR sobre tabla en error). |
| A2 | `frontend/src/administracion/empleado/PantallaEmpleados.tsx:~169-186` | baja | `guardarPin` espera el await y muestra `pinError` sin cerrar — correcto (ya cubierto). |
| A3 | `frontend/src/administracion/empleado/PantallaEmpleados.tsx:~137-151` | n/a | `rotarQr`: en fallo no actualiza el token mostrado — correcto, patrón de referencia (ya cubierto). |
| A4 | `frontend/src/administracion/empleado/PantallaEmpleados.tsx:~121-130` | n/a | `verQr`: si falla no abre el modal — correcto (ya cubierto). |
| A5 | `frontend/src/administracion/empleado/PantallaEmpleados.tsx:~87-95` | baja | `QRCode.toDataURL().catch(()=>setQrImagen(null))` → "Generando…" perpetuo si falla el dibujo. |
| A6 | `frontend/src/administracion/empleado/FormularioEmpleado.tsx:~43-50` | media | Carga de sedes y roles comparten un solo estado `error` (y con el de guardado): un fallo pisa al otro; sin reintento. |
| A7 | `frontend/src/finanzas/dashboard/FormularioVenta.tsx:207-213` + `servicioDashboard.ts:104-127` | n/a | 409 de cierre duplicado se distingue y conserva el mensaje — correcto (ya cubierto). |
| A8 | `frontend/src/finanzas/dashboard/FormularioVenta.tsx:~99-125` | media | Errores de carga de sedes y cajeras/verificadores compiten por un único `error`; "recarga la página" sin reintento. |
| A9 | `frontend/src/finanzas/dashboard/PantallaDashboard.tsx:~96-100` | media | `obtenerSedes().catch(()=>{})` vacío → columna Sede muestra UUID crudo y se pierde el filtro, sin avisar. |
| A10 | `frontend/src/finanzas/dashboard/PantallaDashboard.tsx:~177-185` | baja | `manejarVentaRegistrada`: recarga fire-and-forget pero con errores propios y aviso veraz — correcto/matiz (ya cubierto). |
| A11 | `frontend/src/administracion/sedes/PantallaSedes.tsx:62-73` y `.../empleado/PantallaEmpleados.tsx:108-119` | n/a | `alternarActivo`: mutación + recarga en el mismo try con error visible — correcto (ya cubierto). |
| B1 | `backend/src/finanzas/gastos/gastos.service.ts:~37-39` | alta | Falta test: gasto con `monto <= 0` debe lanzar `ErrorValidacion` (camino del cobro no pasa por el schema). |
| B2 | `backend/src/finanzas/gastos/gastos.service.ts:~48-53` | alta | Falta test: categoría de empleado **sin** `empleadoId` → `ErrorValidacion`. |
| B3 | `backend/src/finanzas/gastos/gastos.service.ts:~54-58` | media | Falta test: categoría no-empleado **con** `empleadoId`/`tipoPago` → `ErrorValidacion`. |
| B4 | `backend/src/finanzas/gastos/gastos.service.ts:~41-46` | media | Falta test: `categoriaId` inexistente → `ErrorValidacion`. |
| B5 | `backend/src/finanzas/cuentas-por-pagar/cuentas-por-pagar.service.ts:~130-134` | alta | Falta test: factura duplicada (proveedor+numeroFactura) → P2002 → `ErrorConflicto`. |
| B6 | `backend/src/finanzas/cuentas-por-pagar/cuentas-por-pagar.service.ts:~135-137` | media | Falta test: proveedor/sede inexistente → P2003 → `ErrorValidacion`. |
| B7 | `backend/src/finanzas/cuentas-por-pagar/cuentas-por-pagar.service.ts:~105-107` | baja | Falta test: compra con `montoTotal <= 0` (guardia de servicio) → `ErrorValidacion`. |
| B8 | `backend/src/finanzas/cuentas-por-pagar/cuentas-por-pagar.service.ts:~173-175` | alta | Falta test: pago a `compraId` inexistente → `ErrorNoEncontrado`. |
| B9 | `backend/src/finanzas/cuentas-por-pagar/cuentas-por-pagar.service.ts:~189-193` | alta | Falta test: **sobrepago** (abonar más que el saldo) → `ErrorValidacion`; ni el abono feliz tiene test. Hueco más grave. |
| B10 | `backend/src/asistencia/cobro/cobro.service.ts:~119-189` | media | Falta test: aprobar/rechazar/pagar solicitud inexistente o en estado no-pendiente; `rechazarCobro` sin ningún test. |
| B11 | `backend/src/asistencia/cobro/cobro.service.ts:~83-96` | media | Falta test: 2ª solicitud que con pendientes acumuladas excede el disponible (over-commit) → `ErrorValidacion`. |
| B12 | `backend/src/asistencia/cobro/cobro.service.ts:~152-156` | baja | Falta test: `pagarCobro` sin categoría de pago-empleado activa → `ErrorValidacion`. |
| B13 | `backend/src/asistencia/cobro/cobro.service.ts:~29-37` | baja | Falta test: `definirConfiguracionCobro` con % fuera de 0–100 o umbral negativo → `ErrorValidacion`. |

Resumen prioridad B (dinero primero): ALTA → B9, B5, B8, B1, B2 · MEDIA → B3, B4, B6, B10, B11 · BAJA → B7, B12, B13.
Proveedores ya cubierto (`cuentas-por-pagar.test.ts:21-75`); no se lista como hueco.

---

## BLOQUE 2 — SQL DE LA MIGRACIÓN B

Contenido literal de `backend/prisma/migrations/20260601120100_cierre_cajera/migration.sql`:

```sql
-- El cierre se identifica por la CAJERA (empleado con rol operativo), no por un
-- registro físico. Se renombra `caja` -> `cajera` (conserva los datos legacy:
-- texto libre como '1', '2', 'yoany', '9 yon') y se amplía a 120 para el
-- snapshot legible "E001 - Nombre Apellido". `cajera` y `cerrado_por` siguen
-- siendo SNAPSHOT string, NO FK. Se recrea el índice único parcial y el CHECK
-- sobre la columna renombrada.

-- RenameColumn (preserva los datos existentes)
ALTER TABLE "venta_diaria" RENAME COLUMN "caja" TO "cajera";

-- Quitar el índice parcial y el CHECK que dependen de la columna antes de
-- ampliar su tipo, para recrearlos limpios con el nombre nuevo.
DROP INDEX "uq_venta_normal";
ALTER TABLE "venta_diaria" DROP CONSTRAINT "chk_venta_caja_no_vacia";

-- AlterColumn: ampliar para el snapshot legible.
ALTER TABLE "venta_diaria" ALTER COLUMN "cajera" TYPE VARCHAR(120);

-- ─── SQL manual (no gestionado por Prisma) ──────────────────────────────────
-- Un cierre 'normal' por (sede, fecha, turno, cajera): una cajera cierra una vez
-- por turno. Las correcciones (reverso/correccion) quedan EXENTAS (por el WHERE).
CREATE UNIQUE INDEX "uq_venta_normal"
    ON "venta_diaria" ("sede_id", "fecha_operacion", "turno", "cajera")
    WHERE "tipo" = 'normal';

-- La cajera del cierre no puede ser una cadena vacía.
ALTER TABLE "venta_diaria"
    ADD CONSTRAINT "chk_venta_cajera_no_vacia" CHECK (length(trim("cajera")) > 0);
```

---

## BLOQUE 3 — LÍNEA DEL DOC sobre db:reset

Transcripción literal de la viñeta que quedó en `docs/DECISIONES.md` (líneas 133-142):

> - **Sembrado del dev DB en Prisma ORM v7 — nota 2026-06-02.** En Prisma v7
>   `prisma migrate reset` **YA NO ejecuta el seed automáticamente** (lo hacía en
>   v6 y anteriores; se eliminó en v7). El flujo correcto para preparar el dev DB
>   es un único comando: **`npm run db:reset`**, que ejecuta
>   `prisma migrate reset --force && prisma db seed`. (También existe
>   `npm run db:seed` = `prisma db seed` para sembrar sin resetear.) **No se toca
>   `prisma.config.ts`**: el hook `migrations.seed` está correcto y lo dispara
>   `prisma db seed`. El **seed debe seguir siendo idempotente** (correrlo dos
>   veces no duplica ni falla), porque `db:seed` puede ejecutarse sobre una base
>   ya sembrada.

Verificación pedida (RESUELTO en BLOQUE 1): la transcripción de arriba es la versión
**previa**. La advertencia explícita **ya se añadió** a `docs/DECISIONES.md`: "⚠️
`db:reset` es SOLO para entornos de desarrollo. NUNCA ejecutarlo contra producción —
`prisma migrate reset --force` borra todos los datos sin confirmación". Queda como
pendiente OPCIONAL (backlog) una guarda `NODE_ENV` en el propio script `db:reset`.
Nota: Prisma v7 además bloquea `migrate reset --force` cuando lo invoca un agente IA
(exige consentimiento explícito del usuario); un humano que lo ejecute no se ve afectado.

---

## BLOQUE 4 — ESTADO DE (e)

- **Snapshot inicial:** 2026-06-02 21:47 (-0500), 5 archivos. **Actualizado 2026-06-03**
  tras triar y aplicar los fixes aprobados (ver abajo).
- **Working tree actual:** 13 modificados + 2 sin trackear, sin commit. NINGÚN archivo
  de `backend/src/` ni migración tocada.
  - backend: `package.json`, `prisma/seed.ts`, `test/finanzas/cuentas-por-pagar.test.ts`,
    `test/asistencia/cobro.test.ts`, y nuevo `test/finanzas/gastos.test.ts` (untracked).
  - docs: `DECISIONES.md`, y este archivo `estado-pendiente-e.md` (untracked).
  - frontend: `finanzas/dashboard/PantallaDashboard.tsx` (+ `.module.css`),
    `finanzas/dashboard/FormularioVenta.tsx` (+ `.module.css` + `.test.tsx`),
    `administracion/empleado/FormularioEmpleado.tsx` (+ `.module.css`),
    `administracion/empleado/PantallaEmpleados.tsx`.
- **Ya aplicado en el working tree (verde):**
  - **seed-fix:** seed idempotente por entidad (E001–E004 con roles, cierres demo con
    snapshots limpios) + scripts `db:seed`/`db:reset` en `package.json`. Sección "Datos
    y arranque" + nota Prisma v7 en `DECISIONES.md`, con advertencia solo-dev (BLOQUE 1).
  - **dashboard (A9) + cajeras:** `obtenerSedes`/`obtenerCajeras` distinguen
    cargando / falló / vacío / cargado + reintento; sin catch silencioso.
  - **Tests de dinero/lógica (bloques 2 y 3):** B1, B2, B5, B8, B9 (ALTA) y B3, B4, B6,
    B10, B11 (MEDIA). Backend 97/97 verde, cero bugs hallados.
  - **UI (bloque 4):** A1 (no abrir el QR si la recarga falló), A6 (FormularioEmpleado:
    estados de sedes/roles separados del error de guardado + reintento), A8
    (FormularioVenta: sedes/empleados separados del error de envío + reintento).
    Frontend 9/9 verde.
- **Pendiente:**
  - **Commit final de (e)** — pendiente del OK de Jim (aún sin `git add`/commit).
  - Backlog de baja severidad → ver BLOQUE 5 (A5, B7, B12, B13) y notas de la revisión
    adversarial diferidas por diseño: columna Sede muestra UUID si falla la carga de
    sedes; `sembrarDemoFinanzas` es all-or-nothing (no por-entidad); el aviso de error
    de empleados se duplica bajo cajera y verificador en `FormularioVenta`.
- **Restricciones vigentes:** no `prisma migrate reset` en prod; no editar migraciones
  históricas ya aplicadas; no borrar datos reales sin confirmación; seed siempre idempotente.

---

## BLOQUE 5 — BACKLOG FUTURO (baja severidad, no resueltos en (e))

Decisión explícita: NO se tocan en (e). No son riesgo real; dejarlos no rompe
nada. Candidatos a backlog para una iteración futura.

- **A5 — `frontend/src/administracion/empleado/PantallaEmpleados.tsx:87-89`.**
  `QRCode.toDataURL(...).catch(() => setQrImagen(null))`: si el dibujo del QR
  fallara, el modal quedaría en "Generando…" perpetuo (no distingue "dibujando"
  de "falló"). **Por qué se difiere:** el token ya se muestra como texto bajo la
  imagen y el botón Imprimir se deshabilita sin imagen; el fallo de `toDataURL`
  (entrada válida, render local en el navegador) es rarísimo y no toca dinero ni
  datos. **Hecho en batch 4** (= H7), commit `764a3fc`: estado de fallo propio
  (`qrImagenError`) + Reintentar que solo redibuja, sin rotar el token.
- **B7 — `backend/src/finanzas/cuentas-por-pagar/cuentas-por-pagar.service.ts:105-107`.**
  Falta test del guardia `montoTotal <= 0` de `registrarCompra` → `ErrorValidacion`.
  **Por qué se difiere:** la guarda YA existe y es correcta (verificada por
  lectura); es solo cobertura, y el schema de la ruta valida el monto antes de
  llegar al servicio. Sin test no se introduce riesgo de dinero.
- **B12 — `backend/src/asistencia/cobro/cobro.service.ts:152-156`.**
  Falta test de `pagarCobro` sin categoría de "pago a empleado" activa →
  `ErrorValidacion`. **Por qué se difiere:** guarda existente y correcta; el seed
  siempre crea esa categoría, así que el caso solo ocurre con una BD mal
  configurada. Cobertura baja, sin riesgo.
- **B13 — `backend/src/asistencia/cobro/cobro.service.ts:29-37`.**
  Falta test de `definirConfiguracionCobro` con % fuera de 0–100 o umbral
  negativo → `ErrorValidacion`. **Por qué se difiere:** guardas existentes y
  correctas; endpoint de configuración de uso interno y poco frecuente.
  Cobertura baja, sin riesgo.

### Hallazgos de la 2ª revisión adversarial (H2–H16) — backlog

Segunda pasada del `revisor` sobre el working tree de (e). **H1** (en el alta, si
falla la carga de roles el botón "Crear empleado" no se bloqueaba y se creaba un
empleado con cero roles; `FormularioEmpleado.tsx:122`) se **arregló en (e)**
(`completo && (esEdicion || !errorRoles)` — errorRoles solo gatea el alta, no la
edición — con tests de regresión de ALTA y EDICIÓN en `FormularioEmpleado.test.tsx`). El
resto queda en backlog: ninguno toca dinero real ni saldos, ninguno contradice una
decisión cerrada.

| # | severidad | archivo:línea | descripción (1 línea) | disposición |
|---|-----------|---------------|------------------------|-------------|
| H2 | baja | `frontend/src/finanzas/dashboard/FormularioVenta.tsx:318-325 y 369-376` | Aviso de error de carga de empleados duplicado (mismo texto + Reintentar) bajo Cajera y Cerrado por; `errorEmpleados` es un estado compartido. | backlog |
| H3 | baja | `frontend/src/finanzas/dashboard/PantallaDashboard.tsx:192-200` | `manejarVentaRegistrada` recarga dashboard y ventas pero NO el filtro de cajeras; una cajera nueva no aparece en el filtro hasta recargar la página. | backlog |
| H4 | baja | `frontend/src/finanzas/dashboard/PantallaDashboard.tsx:593` | Si las sedes fallan, la columna Sede de la tabla muestra el UUID crudo sin aviso en la propia tabla (el aviso solo aparece en el filtro). | backlog |
| H5 | baja | `frontend/src/finanzas/dashboard/PantallaDashboard.tsx:316` (+415-419) | Si `obtenerSedes` resuelve vacío (0 sedes, sin error) el grupo del filtro Sede se oculta, mientras Cajera sí muestra su estado vacío (asimetría de UI). | backlog |
| H6 | baja | `frontend/src/administracion/empleado/FormularioEmpleado.tsx:53-66` | `cargarSedes`/`cargarRoles` hacen `setState` en then/catch/finally sin guardia de montaje ni cancelación (setState sobre componente desmontado tras reintento/desmontaje). | backlog |
| H7 | baja | `frontend/src/administracion/empleado/PantallaEmpleados.tsx:87-95` | `QRCode.toDataURL(...).catch(()=>setQrImagen(null))`: si el render del QR falla, el modal queda en "Generando…" perpetuo. **= A5 ya diferido.** | **hecho en batch 4**, commit `764a3fc` |
| H8 | baja | `backend/prisma/seed.ts:308-332` | Reasignación de roles operativos solo aditiva (upsert sin `deleteMany`): un re-seed con `db:seed` sobre datos viejos deja roles obsoletos pegados. | backlog |
| H9 | baja | `backend/prisma/seed.ts:311-323` | La rama `update` del upsert de empleado no toca `qrToken` ni `pinHash`; un re-seed que reusa un registro deja credenciales del anterior ligadas al nuevo nombre. | backlog |
| H10 | baja | `backend/prisma/seed.ts:274` | El guard de idempotencia del turno busca solo por nombre y no por sede; `Turno.nombre` no es único en el schema. | backlog |
| H11 | baja | `backend/prisma/seed.ts:102-105` (+184-253, 262-264) | `sembrarDemoFinanzas` sigue all-or-nothing (early-return por proveedor) y las 5 `ventaDiaria.create` no van en transacción → un fallo parcial + re-corrida con `db:seed` deja cierres demo incompletos. | backlog |
| H12 | n/a | `backend/package.json:18-19` | `db:reset` ejecuta `prisma migrate reset --force` (destructivo) sin guard de `NODE_ENV`. **Guard `NODE_ENV` opcional, decisión 3** (solo-dev, advertencia ya en DECISIONES.md). | backlog |
| H13 | baja | `backend/test/finanzas/cuentas-por-pagar.test.ts:219-247` | El test de sobrepago solo cubre un único abono que excede; falta el borde `monto==saldo` y la concurrencia que protege `FOR UPDATE`. | backlog |
| H14 | baja | `backend/test/asistencia/cobro.test.ts:137-142` | "Pagar inexistente" afirma `ErrorNoEncontrado` pero no verifica ausencia de `Gasto` huérfano (la rama de `Gasto` es inalcanzable: `!sol` corta antes; cobertura cosmética). | backlog |
| H15 | baja | `backend/test/asistencia/cobro.test.ts:119-133` | El `beforeAll` del 2º describe muta la fila única `configuracionCobro` compartida; depende de `fileParallelism:false` para no contaminar otros tests. | backlog |
| H16 | baja | `frontend/src/administracion/empleado/PantallaEmpleados.tsx:97-111` | `manejarGuardado` cierra el formulario antes de la recarga; si la recarga falla tras un alta, el QR del nuevo empleado no se muestra (recuperable vía `verQr`). | **hecho en batch 4 (opción b)**, commit `764a3fc` — revisado en batch 4: A1 se mantiene + aviso aplicado. |
| H17 | baja | `frontend/src/administracion/empleado/PantallaEmpleados.tsx:125` | Simetría pendiente de H16: en EDICIÓN exitosa + recarga fallida también hay silencio (ambas ramas exigen `'qrToken' in resultado`); menor daño que el alta (re-PUT idempotente, no duplica personas). H16(b) se acotó deliberadamente al alta. | backlog |

Hallazgos de la 3ª revisión (pre-commit) — hardening del test de regresión de H1/N1:

| N2 | baja | `frontend/src/administracion/empleado/FormularioEmpleado.test.tsx:31` | `getByRole('combobox')` asume un único `<select>` (hoy solo Sede); si se reintroduce el turno como 2.º select romperá con "multiple elements". Anclar por nombre accesible: `getByRole('combobox', { name: /sede/i })`. | backlog |
| N3 | baja | `frontend/src/administracion/empleado/FormularioEmpleado.test.tsx:37-57` | Cobertura parcial del gating: solo cubre errorRoles → reintento-exitoso; faltan (a) reintento que vuelve a fallar (botón sigue deshabilitado) y (b) `roles.length === 0` sin errorRoles (alta sin roles habilita el botón). | backlog |
| N4 | baja | `frontend/src/administracion/empleado/FormularioEmpleado.tsx:122` (+211-219, 242) | Tradeoff conocido de N1: en EDICIÓN con errorRoles el botón "Guardar cambios" queda habilitado pero el bloque de roles muestra error+Reintentar en vez de los checkboxes; el operador guarda sin ver los roles actuales. En el happy-path es no-op (rolesIds === empleado.roles, reenvío íntegro e idempotente), no corrompe datos ni toca dinero/saldos; falta feedback/transparencia. Pulido opcional: omitir rolesOperativos del body cuando errorRoles (edición parcial = campo ausente se mantiene), o avisar "roles no cargados, se conservan los actuales". | **hecho en (e)**, commit `8d9d68e`: pulido doble (omisión + aviso) con tests de ambos brazos. |
| N5 | baja | `frontend/src/administracion/empleado/FormularioEmpleado.test.tsx:60-83` | El nuevo test de EDICIÓN cubre el positivo de N1 (errorRoles→habilitado) y discrimina N1, pero falta una aserción negativa en edición (vaciar sede/salario→disabled) que ancle el resto de subpredicados de `completo`; es el gemelo en edición de N3. | backlog |

Hallazgos del batch 1 (H2/H4/H5 — capa de presentación del dashboard) — backlog:

| B1 | baja | `frontend/src/finanzas/dashboard/FormularioVenta.test.tsx:114-122` | El test de H2 solo verifica el número de botones Reintentar (toHaveLength(1)); discrimina el de-dup pero no ancla la posición del aviso (un aviso que migre a Cerrado por seguiría contando 1). Falta una aserción que ancle el aviso bajo Cajera. | backlog |
| B2 | baja | `frontend/src/finanzas/dashboard/PantallaDashboard.test.tsx:37-43,55,66` | Aislamiento de mocks frágil: vitest.config sin restoreMocks/clearMocks y beforeEach sin vi.clearAllMocks(); hoy funciona por la semántica de reemplazo de mockResolvedValue, pero reordenar describes o pasar a ...Once (semántica de cola) filtraría → verde/rojo intermitente. Fijar restoreMocks:true o vi.clearAllMocks() en beforeEach. | backlog |

Hallazgo del batch 2 (H3 — refresco del filtro de cajeras tras registrar) — backlog:

| C1 | baja | `frontend/src/finanzas/dashboard/PantallaDashboard.tsx:200` (con select 387-406) | Efecto UX esperado de H3: tras registrar, cargarCajeras reusa el state cargandoCajeras, deshabilitando el select de filtro de cajera durante el refresco (placeholder 'Cargando cajeras…'). A diferencia de cargarDashboard/cargarVentas (no tocan selects). La selección no se pierde (value={cajera} se conserva, opciones vuelven al resolver); flicker subsegundo, no funcional. Opcional: refresco con un flag que no toque disabled. | backlog |

Hallazgos del batch 3 (N4 — omisión de `rolesOperativos` con catálogo caído; 4ª revisión adversarial pre-commit) — backlog:

| D1 | media | `backend/test/core/empleado.test.ts:165` | El contrato del que depende N4 (`rolesOperativos === undefined` → roles intactos; `empleado.service.ts:164`) no tiene test backend: solo se cubre reemplazo con array y lista vacía. Una regresión tipo `datos.rolesOperativos ?? []` vaciaría los roles en silencio con toda la suite verde (el test frontend solo fija que el body omite el campo). Añadir caso `editarEmpleado(emp.id, {})` sobre un empleado CON roles que aserte que persisten. | backlog |
| D2 | baja | `frontend/src/administracion/empleado/FormularioEmpleado.tsx:61` (+125) | Ventana en vuelo: `cargarRoles` limpia `errorRoles` ANTES de que el fetch resuelva y `completo` no gatea por `cargandoRoles` en edición → guardar durante la recarga (Reintentar en vuelo o carga inicial) SÍ envía `rolesOperativos` (snapshot del montaje; los checkboxes nunca se renderizaron). Inocuo salvo edición concurrente de roles en otra sesión (= comportamiento pre-fix; N4 reduce la superficie, no la cierra). Hardening opcional: gatear también por `cargandoRoles` en edición. | backlog |
| D3 | baja | `frontend/package.json:9` | `"lint": "eslint ."` inejecutable: eslint no está en devDependencies y no existe `eslint.config.*` ni en frontend ni en la raíz → hueco de verificación silencioso para todo cambio frontend (hoy compensado con `tsc -b` + vitest). Preexistente, no introducido por N4. | backlog |
