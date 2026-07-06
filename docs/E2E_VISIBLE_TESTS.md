# Suite E2E VISIBLE — GestorPro

Pruebas end-to-end con **Playwright** que abren un navegador real y recorren la app como
un cliente. Se pueden ver correr (headed / UI / debug) y dejan **screenshot + video +
trace + HTML report** cuando fallan.

Ubicación: `frontend/e2e/` (config en `frontend/playwright.config.ts`).

---

## Cómo autentica la suite (global-setup + storageState)

`e2e/global-setup.ts` inicia sesión UNA vez (login real por UI) y guarda el estado
(localStorage con el refresh token) en `e2e/.auth/state.json` (gitignored). Todos los
tests arrancan ya autenticados: al recargar, `ContextoAuth` rehidrata la sesión con ese
token. `helpers/nav.ts::irA()` espera la **barra autenticada** (link "Ir al inicio", que
NO existe en /login) como señal positiva de sesión, y reintenta la navegación si una
rehidratación se aborta bajo carga. `retries: 2` absorbe esa flakiness de entorno del
backend dev de una sola instancia (en aislamiento las páginas cargan bien). El test de
"login fresco" corre SIN ese estado (`test.use({ storageState: { cookies: [], origins: [] } })`)
para ejercitar el flujo de login de verdad.

## 0. Regla de oro: PRODUCCIÓN es SOLO LECTURA

- Las pruebas de **escritura** (etiqueta `@full`) exigen **DOS** condiciones a la vez:
  `E2E_MODE != production` **y** `E2E_ALLOW_WRITES=true`. Si falta cualquiera, se
  **auto-skipean** (fail-safe: por defecto no escriben nada). Ver `e2e/helpers/env.ts`.
- Contra **producción** solo se corren `@smoke` / `@readonly`: inician sesión y navegan;
  **nunca** crean, editan, borran, resetean, cambian roles, aprueban, corrigen ni tocan
  dinero/salarios.
- Todo dato de prueba lleva prefijo único `e2e-YYYYMMDD-HHMMSS-NNN` (`helpers/test-data.ts`)
  para distinguirlo y limpiarlo, y para que jamás se confunda con datos de clientes.

---

## 1. Instalar Playwright y su navegador (una vez)

```bash
cd frontend
npm install                 # instala @playwright/test (ya está en devDependencies)
npx playwright install chromium   # descarga el navegador (~1 vez por máquina)
```

## 2. Configurar el entorno

```bash
cd frontend
cp .env.e2e.example .env.e2e   # .env.e2e está gitignored
# edita .env.e2e con las URLs y credenciales (ver §5)
# exporta las variables antes de correr (o usa un cargador de .env):
#   Git Bash:   set -a; . ./.env.e2e; set +a
#   PowerShell: Get-Content .env.e2e | %{ if($_ -match '^\s*([^#=]+)=(.*)$'){ [Environment]::SetEnvironmentVariable($matches[1].Trim(),$matches[2]) } }
```

## 3. Correr de forma VISIBLE (para verlo)

```bash
cd frontend
npm run e2e:headed     # abre Chromium y lo ves navegar
npm run e2e:ui         # modo UI de Playwright: lista de tests, watch, time-travel
npm run e2e:debug      # paso a paso con el Inspector
npm run e2e:report     # abre el último HTML report (tras una corrida)
```

Headless (para CI / rápido): `npm run e2e`.

## 4. Qué correr en cada entorno

### Producción — SOLO lectura
```bash
cd frontend
export E2E_MODE=production
export E2E_BASE_URL=https://app.gestorpro.us
export E2E_API_URL=https://api.gestorpro.us
export E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=...   # cuenta real de admin de tenant
npm run e2e:smoke      # o: npm run e2e:readonly
```
Aunque alguien intente `npm run e2e:full` en producción, los `@full` se **skipean**
(barrera de `requireWritesAllowed()`).

### Dev / staging — flujo COMPLETO con escritura
```bash
cd frontend
export E2E_MODE=dev
export E2E_BASE_URL=http://localhost:5173
export E2E_API_URL=http://localhost:3000
export E2E_ALLOW_WRITES=true                        # habilita explícitamente la escritura
export E2E_ADMIN_EMAIL=... E2E_ADMIN_PASSWORD=...
npm run e2e:full       # o `npm run e2e` para todo (smoke + readonly + full)
```
Requiere el frontend (`npm run dev`, :5173) y el backend (:3000) corriendo, con la BD
sembrada (seed base).

## 5. Variables de entorno

| Variable | Para qué |
|---|---|
| `E2E_BASE_URL` | URL del frontend (baseURL de Playwright). Default `http://localhost:5173`. |
| `E2E_API_URL` | URL del backend (referencia). Default `http://localhost:3000`. |
| `E2E_MODE` | `dev` \| `staging` \| `production`. En `production` los `@full` se skipean. |
| `E2E_ALLOW_WRITES` | `true` habilita los `@full` (solo si NO es producción). Default `false`. |
| `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` | Admin de tenant (smoke + `@full` de negocio/usuarios). |
| `E2E_SUPERADMIN_EMAIL` / `E2E_SUPERADMIN_PASSWORD` | Super-admin de plataforma (specs de plataforma, Phase 2). |

**Nunca** se codifican credenciales en el repo; salen del entorno.

## 6. Qué pruebas ESCRIBEN datos

- `e2e/specs/usuarios-roles.spec.ts` (`@full`) — **crea** usuarios `e2e-*` y **cambia**
  roles. Solo corre con escritura habilitada.
- `e2e/specs/fichaje.spec.ts` (`@full`) — **crea** un empleado y un kiosco `e2e-*` y
  **registra fichajes** (entrada/pausa/salida + excepción por PIN). Solo con escritura.
- El resto de specs actuales (`production-smoke`, `negocio-estructura`) son de **lectura**
  y no mutan nada.

## 7. Por qué producción prohíbe la escritura

GestorPro tiene reglas de integridad duras: el dinero (gastos, pagos, ventas) es
**inmutable**, la auditoría es **append-only**, y hay aislamiento multi-tenant. Una
prueba que creara/corrigiera/reseteara en producción contaminaría datos reales de
clientes de forma potencialmente irreversible. Por eso la barrera es **doble y
fail-safe**: producción nunca es escribible por la suite, ni por accidente.

## 8. Ver un fallo: screenshot / video / trace / report

Tras una corrida con fallos:
- **HTML report**: `npm run e2e:report` (abre `frontend/playwright-report/`).
- **Screenshot** del momento del fallo, **video** de la prueba fallida y **trace**
  (time-travel: DOM, red, consola) quedan en `frontend/test-results/`.
- Abrir un trace suelto: `npx playwright show-trace frontend/test-results/<...>/trace.zip`.

Config (`playwright.config.ts`): `screenshot: only-on-failure`, `video: retain-on-failure`,
`trace: on-first-retry`.

## 9. Limpiar datos de prueba

Los `@full` crean cuentas con email `e2e-YYYYMMDD-HHMMSS-NNN@e2e.local` y datos con el
mismo prefijo. Hoy la limpieza es **manual** (no hay endpoint de borrado; las cuentas se
**desactivan**, no se borran, por diseño): en dev/staging se identifican por el prefijo
`e2e-` para darlas de baja o recrear la BD (`prisma migrate reset` en dev). **Pendiente
(Phase 2):** un `global-teardown` que desactive por API las cuentas `e2e-` de la corrida.

## 10. Cobertura actual y lo que FALTA

### Cubierto (Phase 1)
| Spec | Etiqueta | Cubre |
|---|---|---|
| `production-smoke` | `@smoke @readonly` | login + navegación de dashboard, usuarios, empleados, jornadas, gastos, cuentas-por-pagar, cobros; sin error boundary. |
| `usuarios-roles` | `@full` | alta de empleado/supervisor, lista muestra Supervisor, cambio de rol vía select, propia fila sin control, solo roles de empresa. |
| `negocio-estructura` | `@readonly` | render + estructura de dashboard, gastos, cuentas-por-pagar, proveedores, sedes, empleados, kioscos, jornadas, revisión, cobros. |
| `fichaje` (Phase 2) | `@full` | crea empleado + kiosco `e2e-*`; ficha Entrada→Salida comida→Vuelta de comida→Salida (facial simulado) y verifica la Jornada en `/asistencia/jornadas`; fichaje de excepción (facial rechazado→PIN) que entra en `/asistencia/revision`. |

### Personas / roles del sistema
- **plataforma / super-admin** — gestiona empresas y cuentas globales (`/plataforma`).
- **empresa administrador** — gestiona su tenant (usuarios, empleados, finanzas).
- **supervisor** — rol interno de empresa (autoriza excepción de fichaje, ve revisión/jornadas).
- **empleado** — rol interno mínimo.
- **cajera** — NO es rol del sistema: es un **rol operativo** del empleado (`Empleado.rolesOperativos`)
  y un snapshot string en el cierre de caja; no da permisos de login.

### NO cubierto todavía (Phase 2+) y por qué
| Área | Estado | Motivo |
|---|---|---|
| **empleados (alta)** | **cubierto (Phase 2)** | `fichaje.spec.ts` crea un empleado `e2e-*` por la UI de `/empleados` (edición/baja siguen pendientes). |
| **fichaje → jornada** | **cubierto (Phase 2)** | `fichaje.spec.ts`: kiosco con device token (creado por UI), entrada/pausa/salida y verificación de la Jornada. |
| **salario / nómina** | pendiente | el salario se calcula en backend; no hay página de nómina dedicada. Cubrir a nivel API o cuando exista pantalla. |
| **ventas / cierre de cajera** | **sin ruta UI dedicada** | no hay `/ventas`; el cierre de caja se teclea desde Firestec. Cubrir a nivel API o cuando exista pantalla. |
| **compras** | dentro de `/cuentas-por-pagar` | registrar factura = crear compra; flujo de escritura Phase 2. |
| **gastos (crear)** | pendiente | `/gastos` tiene alta; requiere categoría+sede sembradas. |
| **correcciones de dinero** | **API-only** | `POST /correcciones` no tiene consumidor en el front; probar por API o cuando haya UI. |
| **auditoría** | **API-only / sin UI** | la `Auditoria`/`AuditoriaPlataforma` es append-only sin pantalla de lectura. |
| **plataforma (baja/reset global)** | pendiente | `@full` de plataforma con usuarios `e2e-` dedicados en dos empresas de prueba; requiere super-admin y flujo de alta seguro. |
| **permisos (empleado/supervisor bloqueados)** | pendiente | requiere sesiones de cada rol; Phase 2 (`permisos.spec.ts`). |
| **limpieza de datos e2e** | pendiente | `global-teardown` por API (ver §9). |

---

## Apéndice: mapa de funciones (rutas → rol → escribe → smoke/full)

| Ruta | Función | Rol | ¿Escribe? | ¿prod readonly? | ¿dev full? |
|---|---|---|---|---|---|
| `/login` | Login | público | no (auth) | sí | sí |
| `/` | Inicio | tenant | no | sí | sí |
| `/dashboard` | Ganancias/periodo | tenant | no | sí (lectura) | sí |
| `/usuarios` | Gestión usuarios + roles | administrador | **sí** | solo lectura | **sí** |
| `/empleados` | CRUD empleados | admin (escribe) | **sí** | solo lectura | Phase 2 |
| `/sedes` | CRUD sedes | admin | **sí** | solo lectura | Phase 2 |
| `/kioscos` | CRUD kioscos + token | admin | **sí** | solo lectura | Phase 2 |
| `/gastos` | Registrar gasto | tenant | **sí** | solo lectura | Phase 2 |
| `/cuentas-por-pagar` | Facturas/compras + pagos | tenant | **sí** | solo lectura | Phase 2 |
| `/proveedores` | CRUD proveedores | tenant | **sí** | solo lectura | Phase 2 |
| `/asistencia/jornadas` | Ver/corregir jornadas | supervisor/admin | **sí** (corrección) | solo lectura | Phase 2 |
| `/asistencia/revision` | Cola de revisión fichajes | supervisor/admin | **sí** (decidir) | solo lectura | Phase 2 |
| `/asistencia/cobros` | Cobro horas extra | tenant | **sí** | solo lectura | Phase 2 |
| `/kiosco` | Fichaje (device token) | público+token | **sí** (fichaje) | NO tocar | Phase 2 |
| `/plataforma` | Gestión de empresas/cuentas | super-admin | **sí** | solo lectura | Phase 2 |
| ventas / cierre caja | — | — | — | **sin ruta UI** | API/futuro |
| auditoría | — | — | — | **sin ruta UI** | API-only |
| salario / nómina | — | — | — | **sin ruta UI** | backend/API |
