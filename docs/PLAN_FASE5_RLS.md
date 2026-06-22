# Plan de ejecución — Fase 5 (Aislamiento multi-tenant / RLS)

> Plan **ejecutable** para implementar el aislamiento de tenant de la Fase 5 del
> plan multitenant (`docs/ARQUITECTURA_MULTITENANT.md`, Cierre §Plan por fases).
> NO es diseño abierto: las decisiones de arquitectura están cerradas (RLS como
> frontera + `$extends` como conveniencia diferida; `Membresia` N:M; no
> desnormalizar dinero). Este documento dice **qué tocar, en qué orden y con qué
> SQL/código**, fundamentado en el estado real del repo a 2026-06-21.
>
> Aprobado por Jim (2026-06-21). Seg 1 implementado y verificado.

---

## ⚠️ DISCIPLINA DE DESPLIEGUE (regla dura — leer SIEMPRE antes de desplegar)

**El Segmento 1 NUNCA se despliega solo a producción.** El Seg 1 activa RLS en la
DB, pero la app (rol `gestorpro_app`, sujeto a RLS) **todavía no fija el GUC
`app.empresa_id`** (eso es el Seg 2). Si se despliega Seg 1 sin Seg 2:

- **Lecturas → 0 filas** (GUC sin fijar → policy no matchea) → toda la UI vacía.
- **Escrituras → rechazadas** (`WITH CHECK` falla / NOT NULL en Seg 2) → la app no
  puede crear nada.
- **Resultado: sistema PARALIZADO en producción.**

**Seg 1 + Seg 2 se despliegan JUNTOS, en el mismo release.** En desarrollo/CI el
Seg 1 es seguro de forma aislada (los tests corren como superusuario que ignora
RLS; el test de frontera usa `gestorpro_app` a propósito). Pero a producción solo
van juntos.

---

## 0. Estado real verificado (punto de partida)

Mapeo del repo (no del diseño aspiracional):

- **Schema:** `Empresa`, `Membresia` (`empresa_id` NOT NULL), `Usuario.esSuperAdmin`,
  `SesionRefresco.empresaIdActiva` (nullable, **sin** FK) existen. Las **8 tablas
  raíz** (`sede`, `proveedor`, `categoria_gasto`, `rol_operativo`, `turno`,
  `dia_festivo`, `configuracion_cobro`, `auditoria`) tienen `empresa_id`
  **NULLABLE** + FK `onDelete: Restrict`. **Ninguna** es NOT NULL (Ola 3 solo
  aplicó FK, no `SET NOT NULL`).
- **Backfill Ola 2 hecho:** todas las filas existentes → `Empresa Default`
  (`slug='default'`); una `Membresia` predeterminada por usuario.
- **RLS: NO EXISTE.** 0 `POLICY`, 0 `ENABLE/FORCE ROW LEVEL SECURITY`, 0
  `set_config`/`current_setting` en migraciones ni SQL. La frontera de aislamiento
  es hoy **puramente aspiracional**.
- **`empleado` NO tiene `empresa_id`** (hereda vía `sede`). Uniques aún GLOBALES
  (`categoria_gasto.nombre`, `rol_operativo.clave`, `dia_festivo.fecha`,
  `empleado.numero`, `empleado.qr_token`); `configuracion_cobro` **sin** unique.
- **Auth (Fase 4a) — mitad token hecha:** el access token lleva
  `{sub, rol, empresaId, esSuperAdmin}`; `iniciarSesion`/`refrescarAcceso`
  resuelven la membresía server-side y persisten la empresa activa en
  `SesionRefresco.empresaIdActiva`. **Mitad guard/ruta NO hecha:** no hay
  preHandler que propague `empresaId` al runtime, `autorizar` ignora
  `esSuperAdmin`, no hay `POST /auth/cambiar-empresa`, y **0 rutas** pasan
  `empresaId` a sus servicios.
- **Roles Postgres OK (Ola 0):** `gestorpro_migrador LOGIN BYPASSRLS` (owner),
  `gestorpro_app LOGIN NOBYPASSRLS` (no-owner). `deploy/postgres/post-migrate.sql`
  corre como migrador tras cada `migrate deploy` → **es el lugar del DDL de RLS.**
- **Tests:** Prisma de los tests conecta como el **superusuario** del contenedor
  (`databaseUrl`) → **hoy ignoraría RLS** aunque exista. Existe ya un rol
  `gestorpro_app` (NOBYPASSRLS) en el contenedor de test, usado solo por
  `test/finanzas/auditoria-append-only.test.ts` vía `pg.Client` crudo (molde para
  el test de RLS a nivel DB). **dev local** usa un único rol `gestorpro`
  (owner) → RLS tampoco se ejercita en dev.
- **Superficie a cubrir:** 10 `$transaction` (7 de dinero), 4 sitios de SQL crudo
  (2 con `FOR UPDATE`: `compra` y `saldo_horas_extra`), la **vista**
  `cuenta_por_pagar`, el job `barrerHuerfanos`, y ~25 lecturas/agregados fuera de
  tx. **Ninguna** filtra `empresa_id` hoy.

### Decisiones de Jim incorporadas (2026-06-21)
1. **Tests y dev usan el rol `gestorpro_app` (NOBYPASSRLS)** para ejercitar RLS de
   verdad. Los fixtures se siembran con un cliente aparte (superusuario/migrador,
   BYPASSRLS), igual que en producción (migrador siembra, app sirve).
2. Este documento se entrega como **plan ejecutable** antes de tocar código.

---

## 1. Alcance de la Fase 5

### Incluye
1. **DDL de RLS** sobre las 22 tablas tenant-scoped (8 directas + 14 "hereda"),
   `ENABLE` + `FORCE`, políticas `USING`/`WITH CHECK`, en `post-migrate.sql`.
2. **`cuenta_por_pagar` con `security_invoker = true`** (sin esto la vista corre
   como su owner migrador-BYPASSRLS y **fuga** datos cross-tenant).
3. **Allowlist de exclusión** de RLS: `usuario`, `sesion_refresco`, `empresa` **y
   `membresia`** (corrección al doc: el login consulta `membresia` sin contexto).
4. **Endurecimiento** de las 8 columnas directas: `SET NOT NULL` + `DEFAULT
   NULLIF(current_setting('app.empresa_id', true), '')::uuid` (escritura fail-closed sin tocar
   código de la app).
5. **`txEmpresa`** (wrapper sobre `$transaction` que fija el GUC `app.empresa_id`
   `LOCAL`) + **AsyncLocalStorage** que transporta el contexto de tenant por
   request/job, y **preHandler global** que lo puebla desde `request.user`.
6. **Cableado** de los 10 `$transaction`, las lecturas fuera de tx, el job
   `barrerHuerfanos` (multi-tenant) y el SQL crudo, todo a través de `txEmpresa`.
7. **Eliminar el filtrado en memoria** por `sede_id`/`estado` de la vista CxP
   (`cuentas-por-pagar.service.ts:258-264`) → bajar a SQL.
8. **Infra de rol** en dev (crear `gestorpro_app`) y en tests (cliente app + cliente
   semilla), `seed.ts` con `empresaId`.
9. **Test de frontera RLS a nivel DB** (fail-closed) + test super-admin `empresaId=null`.
10. **Verificación de RLS en `deploy.sh`** (análoga al append-only).
11. **`GET /me`** devuelve hoy el rol GLOBAL y omite `empresaId/esSuperAdmin`
    (inconsistente con el token). Se corrige en Fase 5 (trivial, una línea) para que
    devuelva el rol efectivo y el contexto del token. (Confirmado por Jim 2026-06-21.)

### NO incluye (queda diferido, con su dependencia anotada)
- **Ola 3c — `empleado.empresa_id` + identidad per-empresa + CHECK.** No bloquea
  RLS: `empleado` se aísla por subquery vía `sede`. (Fase 3.)
- **Uniques compuestos** (`@@unique([empresaId, ...])`). No bloquean RLS con UNA
  empresa. **Dependencia:** la batería §6 (Fase 8) que siembra **dos** empresas con
  catálogos potencialmente homónimos (categoría, clave de rol, fecha festiva,
  número de empleado) **sí** chocará con los uniques globales → hay que hacer Fase 3
  **antes** de Fase 8, no antes de Fase 5.
- **Fase 4c** — `autorizar` que respete `esSuperAdmin`, guard `soloPlataforma`,
  `POST /auth/cambiar-empresa`, `GET /me` con rol efectivo. No bloquea RLS de
  usuarios normales (el GUC se puebla desde el token que ya trae `empresaId`).
- **Batería completa §6 (~70-90 casos)** — es Fase 8.
- **`$extends` de conveniencia** — Fase 6. (Las escrituras directas se resuelven con
  el `DEFAULT` del GUC; los reads quedan cubiertos por RLS bajo `txEmpresa`.)

---

## 2. Mapa de tablas → política (la pieza central)

GUC de tenant: **`app.empresa_id`** (uuid en texto). Las policies usan
**`NULLIF(current_setting('app.empresa_id', true), '')::uuid`** (no el cast
directo). `current_setting(..., true)` devuelve NULL si nunca se fijó, **pero** un
GUC de *placeholder* (parámetro con punto) ya fijado alguna vez en la sesión
—aunque fuera `set_config(...,true)` LOCAL + ROLLBACK— revierte a **cadena vacía
`''`**, no a NULL; `''::uuid` **lanzaría error** en una conexión del pool reutilizada
en vez de dar 0 filas. `NULLIF(..., '')` normaliza `''` y "sin fijar" a NULL → la
comparación `empresa_id = NULL` nunca matchea → **0 filas (fail-closed)**, sin
excepción. (Verificado por el test de frontera DB; ver §7.)

### 2.1 Directas (8) — política sobre la columna `empresa_id`
`sede`, `proveedor`, `categoria_gasto`, `rol_operativo`, `turno`, `dia_festivo`,
`configuracion_cobro`, `auditoria`.

```
USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
```

### 2.2 "Hereda" (14) — política por subquery vía la cadena de FK hasta `sede.empresa_id`

| Tabla | Cadena | Predicado `EXISTS(...)` |
|---|---|---|
| `compra` | `sede_id`→sede | `EXISTS(SELECT 1 FROM sede s WHERE s.id=compra.sede_id AND s.empresa_id=GUC)` |
| `pago_proveedor` | `compra_id`→compra→sede | `EXISTS(SELECT 1 FROM compra c JOIN sede s ON s.id=c.sede_id WHERE c.id=pago_proveedor.compra_id AND s.empresa_id=GUC)` |
| `gasto` | `sede_id`→sede | `EXISTS(SELECT 1 FROM sede s WHERE s.id=gasto.sede_id AND s.empresa_id=GUC)` |
| `venta_diaria` | `sede_id`→sede | `EXISTS(SELECT 1 FROM sede s WHERE s.id=venta_diaria.sede_id AND s.empresa_id=GUC)` |
| `detalle_cierre` | `venta_id`→venta→sede | `EXISTS(SELECT 1 FROM venta_diaria v JOIN sede s ON s.id=v.sede_id WHERE v.id=detalle_cierre.venta_id AND s.empresa_id=GUC)` |
| `empleado` | `sede_id`→sede | `EXISTS(SELECT 1 FROM sede s WHERE s.id=empleado.sede_id AND s.empresa_id=GUC)` |
| `empleado_rol_operativo` | `empleado_id`→empleado→sede | `EXISTS(SELECT 1 FROM empleado e JOIN sede s ON s.id=e.sede_id WHERE e.id=empleado_rol_operativo.empleado_id AND s.empresa_id=GUC)` |
| `kiosco` | `sede_id`→sede | `EXISTS(SELECT 1 FROM sede s WHERE s.id=kiosco.sede_id AND s.empresa_id=GUC)` |
| `fichaje` | `empleado_id`→empleado→sede | `EXISTS(SELECT 1 FROM empleado e JOIN sede s ON s.id=e.sede_id WHERE e.id=fichaje.empleado_id AND s.empresa_id=GUC)` |
| `revision_fichaje` | `fichaje_id`→fichaje→empleado→sede | `EXISTS(SELECT 1 FROM fichaje f JOIN empleado e ON e.id=f.empleado_id JOIN sede s ON s.id=e.sede_id WHERE f.id=revision_fichaje.fichaje_id AND s.empresa_id=GUC)` |
| `jornada` | `empleado_id`→empleado→sede | `EXISTS(SELECT 1 FROM empleado e JOIN sede s ON s.id=e.sede_id WHERE e.id=jornada.empleado_id AND s.empresa_id=GUC)` |
| `correccion` | `jornada_id`→jornada→empleado→sede | `EXISTS(SELECT 1 FROM jornada j JOIN empleado e ON e.id=j.empleado_id JOIN sede s ON s.id=e.sede_id WHERE j.id=correccion.jornada_id AND s.empresa_id=GUC)` |
| `saldo_horas_extra` | `empleado_id`→empleado→sede | `EXISTS(SELECT 1 FROM empleado e JOIN sede s ON s.id=e.sede_id WHERE e.id=saldo_horas_extra.empleado_id AND s.empresa_id=GUC)` |
| `solicitud_cobro` | `empleado_id`→empleado→sede | `EXISTS(SELECT 1 FROM empleado e JOIN sede s ON s.id=e.sede_id WHERE e.id=solicitud_cobro.empleado_id AND s.empresa_id=GUC)` |

donde `GUC` = `NULLIF(current_setting('app.empresa_id', true), '')::uuid`. Para "hereda" el
`WITH CHECK` usa el **mismo** `EXISTS`: al insertar un hijo con un FK de otra
empresa, el `EXISTS` no matchea → `WITH CHECK` rechaza (anti FK-injection, test (c)).

> **Nota de consistencia:** la subquery a `sede`/`empleado`/… se evalúa con la RLS
> de esas tablas activa. Como todas filtran por el **mismo** GUC, es consistente
> (la fila padre solo es visible si pertenece al tenant, que es justo la condición).
> Sin recursión (tablas distintas).

> **Tensión I1 (rendimiento):** los `EXISTS` encarecen los caminos `FOR UPDATE`
> (`cuentas-por-pagar`, `saldo`). **Regla cerrada:** NO desnormalizar `empresa_id`
> en tablas de dinero salvo medición que pruebe degradación inaceptable. La Fase 5
> mide (EXPLAIN ANALYZE de `registrarPago` y `debitarSaldo`) y reporta; no se desvía
> sin esa prueba.

### 2.3 Excluidas de RLS (allowlist) — `usuario`, `sesion_refresco`, `empresa`, `membresia`
- `usuario` / `sesion_refresco`: el login (`auth.service.ts`) los consulta sin
  contexto. Aislamiento por `email @unique` global y refresh token opaco.
- `empresa`: tabla raíz; se consulta en login (`resolverContextoActivo` →
  `empresa.findUnique`). Su exposición se controla por endpoint (alta = plataforma).
- **`membresia` (corrección al doc):** `resolverContextoActivo`
  (`auth.service.ts:46-49`) hace `membresia.findMany({where:{usuarioId}})` **antes**
  de existir contexto de tenant. Con RLS daría 0 filas → **rompería el login**.
  Se excluye; su protección es de aplicación (la query siempre filtra por el
  `usuarioId` autenticado), igual que `usuario`/`sesion_refresco`.

> El **test de cobertura RLS** (recorre `information_schema`) debe usar esta
> allowlist de 4 tablas; cualquier otra tabla tenant sin `rowsecurity+FORCE` =
> fallo.

---

## 3. DDL de RLS — bloque para `deploy/postgres/post-migrate.sql`

Se añade al final de `post-migrate.sql` (corre como `gestorpro_migrador`, owner +
BYPASSRLS → puede `ALTER TABLE … ENABLE/FORCE RLS` y `CREATE POLICY`, y no se
auto-bloquea). **Idempotente:** `ENABLE/FORCE` no fallan si ya están; las políticas
se recrean con `DROP POLICY IF EXISTS` + `CREATE POLICY` (PG17 no tiene
`CREATE POLICY IF NOT EXISTS`).

Patrón por tabla directa:
```sql
ALTER TABLE sede ENABLE ROW LEVEL SECURITY;
ALTER TABLE sede FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON sede;
CREATE POLICY aislamiento_empresa ON sede
  USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
```

Patrón por tabla "hereda" (ej. `gasto`):
```sql
ALTER TABLE gasto ENABLE ROW LEVEL SECURITY;
ALTER TABLE gasto FORCE  ROW LEVEL SECURITY;
DROP POLICY IF EXISTS aislamiento_empresa ON gasto;
CREATE POLICY aislamiento_empresa ON gasto
  USING      (EXISTS (SELECT 1 FROM sede s WHERE s.id = gasto.sede_id
                      AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM sede s WHERE s.id = gasto.sede_id
                      AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid));
```

Vista CxP (crítico):
```sql
ALTER VIEW cuenta_por_pagar SET (security_invoker = true);
```

Bypass de plataforma (super-admin, opt-in explícito) — se añade como **segunda
política permisiva** OR-eada, que solo abre cuando un endpoint `soloPlataforma`
fija `app.bypass_tenant='on'` (Fase 4.4). Por defecto el GUC está vacío → no abre:
```sql
DROP POLICY IF EXISTS bypass_plataforma ON sede;
CREATE POLICY bypass_plataforma ON sede
  USING (current_setting('app.bypass_tenant', true) = 'on');
```
> Dos políticas permisivas se combinan con **OR**. El bypass es auditado y nunca
> ocurre por omisión (la app nunca lo fija salvo en `soloPlataforma` +
> `esSuperAdmin`). Se puede **diferir a Fase 4c**; sin él, el super-admin con
> `empresaId=null` simplemente ve 0 filas (fail-closed), que es justo lo que exige
> el test `super-admin-null`.

**Mantenimiento (riesgo de fila-abierta):** si una migración futura crea una tabla
tenant y no se añade aquí su `ENABLE RLS`, queda **fail-open**. Mitigación: el test
de cobertura (§6) y el check de `deploy.sh` (§7) fallan si una tabla tenant no tiene
RLS. Mismo contrato que ya documenta el bloque de `auditoria` (post-migrate.sql:12-16).

---

## 4. Endurecimiento de columnas (schema + migración Prisma)

Cambio en `backend/prisma/schema.prisma` para las **8 tablas directas** — de
`empresa_id` nullable a NOT NULL con default desde el GUC:

```prisma
// antes:  empresaId String?  @map("empresa_id") @db.Uuid
// después:
empresaId String @default(dbgenerated("NULLIF(current_setting('app.empresa_id', true), '')::uuid")) @map("empresa_id") @db.Uuid
```

Efecto:
- **NOT NULL** → fail-closed: un INSERT sin contexto (GUC sin fijar) → default NULL
  → violación NOT NULL → **error**, no fila huérfana.
- **`@default(dbgenerated(...))`** → Prisma vuelve `empresaId` **opcional en el
  create**; la app sigue haciendo `prisma.sede.create({data:{nombre,…}})` **sin
  tocar código**, y la DB rellena `empresa_id` desde el GUC fijado por `txEmpresa`.
- El migrador/seed (BYPASSRLS) sigue pasando `empresaId` explícito (no usa el
  default); por eso `seed.ts` debe setearlo (ver §6).

Migración: `npx prisma migrate dev --name multitenant_ola3b_notnull_default`.
SQL resultante (≈), una sentencia por tabla:
```sql
ALTER TABLE "sede"
  ALTER COLUMN "empresa_id" SET NOT NULL,
  ALTER COLUMN "empresa_id" SET DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid;
-- … proveedor, categoria_gasto, rol_operativo, turno, dia_festivo,
--    configuracion_cobro, auditoria (idéntico).
```
- **Prerrequisito:** verificar `SELECT count(*) … WHERE empresa_id IS NULL` = 0 en
  las 8 tablas (el backfill ya lo garantiza; se añade guard en la migración).
- **`auditoria`:** `SET NOT NULL` hace scan con lock breve. GestorPro arranca de
  cero (sin histórico) → tablas diminutas, coste despreciable. (Si en producción
  futura fueran grandes: `CHECK (empresa_id IS NOT NULL) NOT VALID` + `VALIDATE`
  + `SET NOT NULL`, PG12+.)
- `sesion_refresco.empresa_id_activa` se **deja como está** (nullable, sin FK,
  excluida de RLS).

---

## 5. Capa de aplicación — `txEmpresa`, AsyncLocalStorage y preHandler

### 5.1 Módulo nuevo `backend/src/core/tenant/contexto.ts`
```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import { prisma, type ClienteTx } from '../prisma.js';

interface ContextoTenant {
  empresaId: string | null;
  esSuperAdmin: boolean;
  bypassPlataforma?: boolean; // solo endpoints soloPlataforma (Fase 4c)
}

export const alsTenant = new AsyncLocalStorage<ContextoTenant>();

/** Contexto efectivo: explícito (jobs) o el de la request (ALS). */
function contextoEfectivo(over?: Partial<ContextoTenant>): ContextoTenant {
  const base = alsTenant.getStore() ?? { empresaId: null, esSuperAdmin: false };
  return { ...base, ...over };
}

interface OpcionesTx {
  empresaId?: string | null;        // override para jobs/plataforma
  bypassPlataforma?: boolean;
  tx?: { isolationLevel?: any; timeout?: number; maxWait?: number };
}

/**
 * Abre una $transaction, fija el GUC de tenant LOCAL (muere en COMMIT → no
 * contamina el pool) y ejecuta fn(tx). Fail-closed: si no hay empresaId y no es
 * bypass de plataforma, NO fija el GUC → RLS devuelve 0 filas / WITH CHECK falla.
 */
export function txEmpresa<T>(fn: (tx: ClienteTx) => Promise<T>, opc: OpcionesTx = {}) {
  const ctx = contextoEfectivo(
    opc.empresaId !== undefined ? { empresaId: opc.empresaId } : undefined,
  );
  return prisma.$transaction(async (tx) => {
    if (ctx.empresaId) {
      await tx.$executeRaw`SELECT set_config('app.empresa_id', ${ctx.empresaId}, true)`;
    }
    if (opc.bypassPlataforma && ctx.esSuperAdmin) {
      await tx.$executeRaw`SELECT set_config('app.bypass_tenant', 'on', true)`;
    }
    return fn(tx as ClienteTx);
  }, opc.tx);
}
```
- **Reads y writes** pasan por aquí. Para reads de una sola query:
  `return txEmpresa((tx) => tx.gasto.findMany(...))`.
- `cuentas-por-pagar` conserva su `{ isolationLevel: ReadCommitted, timeout: 15000 }`
  vía `opc.tx`.
- **`empresaId=null` (super-admin sin empresa)** → no se fija GUC → 0 filas. Cumple
  el test `super-admin-null`: jamás "todos los tenants".

### 5.2 preHandler global (puebla la ALS desde el token)
En `app.ts`, tras `authPlugin`, un hook que corre cuando hay `request.user`:
```ts
app.addHook('preHandler', async (request) => {
  const u = request.user; // PayloadAccess | undefined (rutas públicas)
  if (u) alsTenant.enterWith({ empresaId: u.empresaId, esSuperAdmin: u.esSuperAdmin });
});
```
- Rutas públicas (login, refresh, kiosco público) → sin `request.user` → ALS sin
  contexto → `empresaId=null` → fail-closed para cualquier acceso a datos de tenant.
- `enterWith` persiste en el contexto async de la request (tests serie; patrón
  Fastify estándar). **A validar en implementación** que el contexto sobreviva a los
  `await` de los handlers; si hubiera fuga entre requests, se cambia a envolver el
  handler con `alsTenant.run(...)`.

### 5.3 Cableado — checklist exacto

**Los 10 `$transaction` → `txEmpresa`** (mismo callback, solo cambia el envoltorio):
- `finanzas/gastos/gastos.service.ts:82` (registrarGasto)
- `shared/services/correccion.service.ts:87` (corregirMovimiento)
- `core/empleado/empleado.service.ts:162` (editarEmpleado)
- `asistencia/jornada/jornada.service.ts:126,200,294` (cierre, corregir, manual)
- `finanzas/cuentas-por-pagar/cuentas-por-pagar.service.ts:177` (registrarPago, con `opc.tx`)
- `asistencia/cobro/cobro.service.ts:73,117,144` (solicitar, aprobar, pagar)

**Lecturas/agregados fuera de tx → envolver en `txEmpresa` (read tx):**
- `finanzas/dashboard/dashboard.service.ts:43-64` (5 aggregate de ganancia),
  `:84-90` (gastosPorCategoria). *Bonus:* envolverlos en **una** `txEmpresa`
  comparte snapshot (hoy son 5 reads inconsistentes).
- `finanzas/dashboard/ventas.service.ts:140-178` (listarVentas, listarCajeras)
- `finanzas/cuentas-por-pagar/cuentas-por-pagar.service.ts:75,142-148,250-256`
  (listarProveedores, listarCompras, listarCuentasPorPagar)
- `finanzas/gastos/gastos.service.ts:10,90` (categorías, listarGastos)
- `core/sede/sede.service.ts:21,47,58` (crear/editar/listar)
- `asistencia/cobro/cobro.service.ts:14-18,48-52,189-208,216-244` (config, rechazar,
  resumen, listar) y `saldo.service.ts:62-66` (obtenerSaldo)
- `asistencia/fichaje/fichaje.service.ts:180` (listar) y el `count` :157
- `asistencia/jornada/jornada.service.ts:33-46,97-120` (lecturas previas al cierre)

**`barrerHuerfanos` (job multi-tenant)** — `jornada.service.ts:143-179`:
reescribir a "itera empresas y abre `txEmpresa({empresaId})` por empresa":
```ts
const empresas = await prisma.empresa.findMany({ where: { activo: true }, select: { id: true } });
for (const { id } of empresas) {
  await txEmpresa(async (tx) => { /* el barrido actual, con tx */ }, { empresaId: id });
}
```
Resuelve B2 (hoy leería 0 filas y reportaría `marcadas:0` en silencio bajo RLS) y de
paso vuelve atómico el barrido por empresa.

**SQL crudo** — al ir dentro de `txEmpresa`, hereda el GUC; **no** se añade
`empresa_id` al SQL (lo aplica RLS). Verificar que `cuentas-por-pagar:177-192`
(FOR UPDATE + SUM) y `saldo.service.ts:46` (FOR UPDATE) corren dentro del `tx` de
`txEmpresa`.

**Filtro en memoria CxP → SQL** — `cuentas-por-pagar.service.ts:250-265`:
mover `sedeId`/`estado` al `WHERE` del `$queryRaw` (RLS ya aísla la empresa):
```sql
... FROM cuenta_por_pagar cpp JOIN proveedor p ON p.id = cpp.proveedor_id
WHERE (${sedeId}::uuid IS NULL OR cpp.sede_id = ${sedeId}::uuid)
  AND (${estado}::text IS NULL OR cpp.estado = ${estado}::text)
ORDER BY cpp.fecha_vencimiento ASC
```
y borrar el `.filter(...)` en JS.

> **Nota:** los servicios siguen recibiendo el `tx` como `ClienteTx`. Como hoy ya
> usan `prisma.x` directamente, el cambio es: método de servicio → `return
> txEmpresa((tx) => tx.x…)`. Diff grande pero mecánico y auditable (explícito >
> mágico, apropiado para una frontera de seguridad).

---

## 6. Infra de rol (dev + tests) y seed

### 6.1 Producción — ya OK
`docker-compose.yml:45` la app usa `gestorpro_app`; `deploy.sh:82-84` corre
`post-migrate.sql` como migrador. Sin cambios salvo el bloque RLS añadido a
`post-migrate.sql` (§3) y el check de `deploy.sh` (§7).

### 6.2 dev local — crear `gestorpro_app`
Hoy `backend/.env` usa `postgresql://gestorpro:gestorpro@localhost:5432/gestorpro`.
- **One-time** en el Postgres de dev (sin pérdida de datos):
  ```sql
  CREATE ROLE gestorpro_app LOGIN NOBYPASSRLS PASSWORD 'gestorpro_app';
  GRANT CONNECT ON DATABASE gestorpro TO gestorpro_app;
  GRANT USAGE ON SCHEMA public TO gestorpro_app;
  REVOKE CREATE ON SCHEMA public FROM gestorpro_app;
  -- luego: psql … -f deploy/postgres/post-migrate.sql  (grants de datos + RLS)
  ```
  (El rol dueño actual `gestorpro` hace de "migrador"; conviene marcarlo BYPASSRLS
  para que `migrate`/`seed` no se auto-bloqueen: `ALTER ROLE gestorpro BYPASSRLS`.)
- `backend/.env`: dos URLs.
  - `DATABASE_URL` (la que lee la app) → **`gestorpro_app`**.
  - `MIGRATOR_DATABASE_URL` → `gestorpro` (owner/BYPASSRLS), usada por los scripts
    `prisma migrate` / `prisma db seed`.
- `package.json`/`prisma.config.ts`: los comandos de migración usan
  `MIGRATOR_DATABASE_URL`. (A confirmar cómo está hoy el wiring de env de Prisma.)

### 6.3 Tests — dos clientes
- `test/global-setup.ts`: ya crea `gestorpro_app` y aplica `post-migrate.sql`
  (que ahora incluye el DDL de RLS). **Marcar el owner del contenedor BYPASSRLS no
  hace falta** (es superusuario). Se sigue exponiendo `databaseUrl` (super, semilla)
  y `databaseUrlApp` (app, RLS).
- `test/setup-entorno.ts`: cambiar `process.env.DATABASE_URL = inject('databaseUrl')`
  → **`inject('databaseUrlApp')`**. Así el cliente `prisma` de `src` (y todos los
  servicios bajo test) corren como `gestorpro_app` (RLS activa).
- **Helper nuevo `test/helpers/db.ts`:**
  - `semilla` = `new PrismaClient` sobre `databaseUrl` (superusuario, BYPASSRLS) →
    para crear fixtures sin RLS (mirror del migrador en prod).
  - `comoEmpresa(empresaId, fn, {esSuperAdmin?})` = `alsTenant.run({...}, fn)` →
    para tests a nivel servicio que llaman funciones directamente (sin HTTP): fija
    el contexto que `txEmpresa` leerá.
  - Builders de fixture (`crearEmpresa`, `crearSede(empresaId)`, …) sobre `semilla`.
- **Migración de la suite existente (~17 archivos, ~136 casos):** patrón
  1. fixtures `prisma.x.create(...)` → `semilla.x.create(...)` (con `empresaId`);
  2. llamadas a servicios → envueltas en `comoEmpresa(empresaA, …)`;
  3. asserts que releen datos → vía `semilla` (god view, "re-leer sin filtro").
  Los tests HTTP (`app.inject`) no necesitan `comoEmpresa` (el preHandler puebla la
  ALS desde el token). **Esto es el grueso del trabajo de tests** y va en el
  Segmento 2 (no rompe nada hasta que se hace el flip de `setup-entorno`).

### 6.4 `seed.ts`
Ya crea `Empresa Default` + membresía admin. **Falta** setear `empresaId` en
`sede` Central, empleados, ventas, kiosco demo, catálogos (categoría, rol operativo,
turno, festivo, config cobro) → obligatorio bajo NOT NULL. El seed corre como
migrador/owner (BYPASSRLS), así que pasa `empresaId: empresaDefault.id` explícito en
cada `create/upsert`. (Cuando se hagan los uniques compuestos en Fase 3, los `where`
de upsert pasan a claves compuestas; por ahora siguen simples.)

---

## 7. Tests de Fase 5 (mínimos) y verificación de deploy

No es la batería §6 completa (Fase 8), sino el piso fail-closed:

1. **`test/multitenant/rls-frontera-db.test.ts`** (molde: `auditoria-append-only`):
   `pg.Client` como `gestorpro_app`. Por cada clase de tabla:
   - sin `set_config('app.empresa_id', …)` → `SELECT * FROM gasto` ⇒ **0 filas**;
   - `set_config('app.empresa_id','A',false)` → solo filas de A;
   - `INSERT … (empresa de B)` ⇒ error `WITH CHECK` / `new row violates`;
   - directa e "hereda" (al menos `sede`, `gasto`, `pago_proveedor`, `saldo_horas_extra`).
2. **`super-admin-null`**: contexto `empresaId=null` (sin GUC) en una ruta de tenant
   ⇒ 0 filas / 403, nunca "todos los tenants".
3. **cobertura RLS**: recorre `pg_class`/`information_schema`; toda tabla tenant
   (todas menos la allowlist de §2.3) debe tener `relrowsecurity` **y**
   `relforcerowsecurity`; si no, falla.
4. **`deploy.sh`** — paso nuevo análogo al append-only (paso 6/7): como
   `gestorpro_app`, sin contexto ⇒ `SELECT count(*) FROM gasto` = 0; con
   `app.empresa_id` de una empresa ⇒ solo las suyas. Aborta el deploy si falla.

---

## 8. Segmentación recomendada (3 commits)

> RLS no puede estar "a medias" en una app viva. Se parte en unidades que dejan el
> repo coherente y verificable en cada commit.

**Segmento 1 — Fundación DB (bajo riesgo, autoverificable).**
- DDL de RLS en `post-migrate.sql` (§3) + `security_invoker` en la vista.
- Infra de rol dev (§6.2). Producción ya OK.
- Test de frontera RLS a nivel DB (§7.1) + cobertura (§7.3).
- **NO** se cambia el schema (sigue nullable), **NO** se toca `setup-entorno`
  (tests siguen como superusuario → suite existente intacta), **NO** wiring de app.
- Resultado: RLS existe y está probada a nivel DB; la suite sigue verde; producción
  no se despliega hasta el Segmento 2 (la app `gestorpro_app` aún no fija el GUC).
- Verificación: `npm run test` (verde) + el test RLS nuevo (verde).

**Segmento 2 — Cableado de la app (el grueso).**
- `schema.prisma` NOT NULL + `@default(dbgenerated)` (§4) + migración.
- `core/tenant/contexto.ts` (`txEmpresa` + ALS) + preHandler (§5.1-5.2).
- Cableado de los 10 tx + reads + `barrerHuerfanos` + SQL crudo + CxP (§5.3).
- `seed.ts` con `empresaId` (§6.4).
- Helper de tests `semilla`/`comoEmpresa`, flip de `setup-entorno` a
  `databaseUrlApp`, migración de la suite (§6.3).
- Verificación: `npm run typecheck` + `npm run test` (toda la suite bajo RLS) +
  EXPLAIN ANALYZE de `registrarPago`/`debitarSaldo` (medición I1).

**Segmento 3 — Fase 8 (separado).**
- Batería §6 (~70-90 casos), `barrerHuerfanos` multi-tenant test, check RLS en
  `deploy.sh`. **Depende de Fase 3** (uniques compuestos) para sembrar 2 empresas
  con catálogos homónimos.

Orden duro respetado: 0→1→2 antes de 3; 4 antes de 5; **5 antes de 8**.

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Vista CxP fuga (corre como owner BYPASSRLS) | `security_invoker = true` (§3); cubierto por test RLS sobre `cuenta_por_pagar` |
| Tabla tenant nueva sin RLS (fail-open) | Test de cobertura (§7.3) + check `deploy.sh` (§7.4) |
| `enterWith` fuga contexto entre requests | Validar en impl; fallback `alsTenant.run` envolviendo el handler |
| GUC residual en el pool | Solo se usa `set_config(...,true)` LOCAL (muere en COMMIT); nunca SESSION |
| `EXISTS` por-FK degrada `FOR UPDATE` | Medir (EXPLAIN ANALYZE) en Seg 2; desnormalizar solo si se prueba (I1) |
| `SET NOT NULL` con filas NULL | Guard `count WHERE IS NULL = 0` antes (backfill ya garantiza) |
| Suite existente rota por el flip de rol | Todo el flip + helper van juntos en Seg 2; Seg 1 no toca la suite |
| dev sin rol app → RLS no se ejercita en dev | §6.2 crea `gestorpro_app` en dev |

**Rollback:** Seg 1 es DDL idempotente; revertir = `ALTER TABLE … DISABLE ROW LEVEL
SECURITY` + `DROP POLICY` (o restaurar `post-migrate.sql`). Seg 2: revertir la
migración Prisma (nueva, additiva → `DROP DEFAULT` + `DROP NOT NULL`) y el commit de
código. No hay pérdida de datos en ningún punto.

---

## 10. Micro-decisiones para confirmar (no bloquean empezar el Seg 1)

1. **`membresia` excluida de RLS** (protección de app por `usuarioId`): confirmar.
   (Recomendado: sí — alternativa sería RLS por `usuario_id` con GUC propio, pero
   rompe el bootstrap de login.)
2. **Bypass de plataforma** (`app.bypass_tenant`): ¿incluir la política
   `bypass_plataforma` ya en Seg 1 (inerte hasta Fase 4c) o diferirla entera a 4c?
   (Recomendado: incluirla inerte — el DDL queda completo y el super-admin-null ya
   es fail-closed sin ella.)
3. **dev DB:** ¿`ALTER ROLE gestorpro BYPASSRLS` sobre el rol dev actual + crear
   `gestorpro_app`, o prefieres recrear el Postgres de dev limpio con el initdb de
   producción? (Recomendado: alterar in-place, sin pérdida de datos de dev.)
4. **`GET /me`** devuelve hoy el rol GLOBAL y omite `empresaId/esSuperAdmin`
   (inconsistente con el token). ¿Arreglar en Fase 5 (trivial) o dejarlo para 4c?
   (Recomendado: arreglar ahora, es de una línea y evita confundir al frontend.)
