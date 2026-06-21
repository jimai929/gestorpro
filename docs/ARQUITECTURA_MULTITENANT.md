# Arquitectura Multi-tenant — Propuesta (v1, sin código)

> Documento de **diseño**. NO se escribe código todavía: va a revisión humana
> antes de implementar. Fundamentado en `backend/prisma/schema.prisma`, las
> migraciones aplicadas, el aparato de roles Postgres (`deploy/postgres/`) y el
> código de auth y servicios citado en línea. Stack: Node + TypeScript strict ·
> Fastify · Prisma 7 (driver adapter `PrismaPg`) · PostgreSQL · JWT con refresh ·
> Vitest + Testcontainers.
>
> **Esta v1 ya incorpora las correcciones de una revisión adversarial** (3
> bloqueantes verificados contra el código real). Ver §0 y el Apéndice A.

---

## 0. Correcciones tras la revisión adversarial (leer primero)

La primera redacción tenía tres errores de hecho, **verificados y corregidos**
en este documento:

1. **`Caja` NO existe.** `schema.prisma` tiene exactamente **24 models**; no hay
   `model Caja` (fue eliminado). Cualquier paso de migración sobre `caja`
   fallaría. → Eliminado del inventario (§1.2).
2. **Los roles Postgres NO tienen `BYPASSRLS`.** `deploy/postgres/initdb/01-init-roles.sh:20,23`
   crea `gestorpro_migrador` y `gestorpro_app` con `CREATE ROLE ... LOGIN`, sin
   `BYPASSRLS`. "Owner" ≠ "BYPASSRLS": con `FORCE ROW LEVEL SECURITY` (que la
   propuesta exige), **el owner migrador también queda sujeto a las policies** →
   el seed y el backfill (que corren como migrador) devolverían 0 filas / fallarían
   `WITH CHECK`. → La opción RLS exige, como prerrequisito, `ALTER ROLE
   gestorpro_migrador BYPASSRLS` y crearlo así en `01-init-roles.sh` (§2.4, §5).
3. **`barrerHuerfanos` (job de fondo) es cross-tenant por diseño y RLS lo rompe
   en silencio.** Corre fuera de toda request y de toda `$transaction`
   (`jornada.service.ts:143-179`). → Tratamiento explícito en §2.5.

Además, dos cambios de alcance verificados: la identificación por QR usa
`findUnique({ where:{ qrToken } })` (`identificacion.service.ts:19-20`), que
**deja de compilar** si `qrToken` se vuelve compuesto (§7.2); y las tablas
`usuario`/`sesion_refresco`/`empresa` deben **excluirse de RLS** explícitamente
(§2.4).

---

## 0.bis. Estado de decisiones y restricciones (confirmado 2026-06-21)

Tras la revisión, Jim confirmó la dirección arquitectónica. Estado:

**Decisiones confirmadas:**
- **#1 Aislamiento — CONFIRMADO: RLS (frontera dura) + Prisma `$extends`
  (conveniencia), fail-closed.** El filtro de aplicación puro queda descartado
  como frontera (solo `$extends` lo aporta, y por encima manda RLS).
- **#3 Tablas "hereda" — CONFIRMADO (dirección): policy RLS con subquery por-FK;
  NO se desnormaliza `empresa_id` en las tablas de dinero inmutables
  (`gasto`, `pago_proveedor`, `venta_diaria`) — eso es regla dura.** La
  desnormalización SOLO se reconsideraría si se **demuestra** (medición real) que
  el `EXISTS(... )` por-FK degrada de forma inaceptable los `SELECT ... FOR UPDATE`
  de los caminos de dinero (`cuentas-por-pagar.service.ts:178,190`,
  `saldo.service.ts:46`). Sin esa prueba, NO se reabre. Es responsabilidad de la
  Fase 5 medirlo y reportar antes de desviarse.

**Decisión #2 (`Usuario`↔`Empresa`) — CERRADA (2026-06-21): (B) `Membresia` N:M.**
La revisión de los requisitos reales (`DECISIONES.md:13,190`,
`PLAN_DE_CONSTRUCCION.md:5`) confirma que **HOY no existe el escenario "una persona
gestiona varias empresas"**: el producto se *vende* a varias empresas (cada una
aislada), los usuarios los crea el admin de su empresa (sin registro abierto), y
un usuario se relaciona con las *sedes* de **su** empresa. Aun así, Jim eligió **(B)
`Membresia(usuarioId, empresaId, rol, predeterminada)` N:M** deliberadamente, para
no cerrar la puerta al caso multi-empresa propio de un SaaS y para modelar el
super-admin limpiamente (un `Usuario` sin ninguna `Membresia`). Por tanto las
secciones **§3.2 (payload con `empresaId` activo de la membresía) y §4.2
(`Membresia` + `esSuperAdmin`) son la ruta CANÓNICA**, no condicionales. En el
backfill (Ola 2) se crea **una `Membresia{usuarioId, empresaId=default,
rol=Usuario.rol, predeterminada=true}` por cada `Usuario` existente** (§5). La
opción (A) `Usuario.empresaId` directo queda descartada.

**Restricción "usuario ↔ empresa" bajo (B) — capa de aplicación, NO CHECK de BD.**
Al no llevar `Usuario` un `empresa_id` directo, el invariante "un usuario normal
pertenece a una empresa" **no** es un CHECK de una sola fila (sería una existencia
cross-tabla → exigiría trigger o constraint diferido: descartado por frágil). Se
enforza así:
- **Super-admin** = `Usuario.esSuperAdmin = true` (flag, default `false`); puede
  tener **0 membresías** (legítimo: opera en la capa plataforma).
- **Usuario normal** (`esSuperAdmin = false`) **requiere ≥1 `Membresia` para ser
  funcional**: `iniciarSesion` rechaza con `ErrorAutenticacion` a un no-super-admin
  con 0 membresías (§3.3). La BD no impide que exista un usuario sin membresía; el
  **login** impide que opere.
- **Anti-huérfanos:** el alta de usuario crea el `Usuario` + su primera `Membresia`
  en **la misma transacción** (un usuario sin membresía quedaría "huérfano", sin
  poder entrar). Es invariante del flujo de creación (Fase 4), no de la BD.
- Único constraint a nivel BD: `membresia @@unique([usuarioId, empresaId])` (un rol
  por par usuario-empresa).

Esto **reemplaza** al CHECK `(es_super_admin) OR (empresa_id IS NOT NULL)`, que era
mecanismo exclusivo del descartado diseño (A) y no aplica bajo (B).

**Restricciones de seguridad nuevas — NIVEL HIERRO (red line), peer de "dinero
inmutable" y "auditoría append-only":**
1. **El runtime de la app NUNCA conecta con `gestorpro_migrador`.** Ese rol tiene
   `BYPASSRLS` (necesario para migrar/seed) y por tanto **ignora el aislamiento
   de tenant**. `DATABASE_URL` de la app SIEMPRE apunta a `gestorpro_app` (sujeto
   a RLS). El rol migrador se usa solo para migraciones/seed/backfill, nunca para
   servir peticiones. Verificable en `deploy/docker-compose.yml:45`.
2. **La batería de tests de aislamiento DEBE incluir, como mínimo:**
   - ① **el rol app no puede saltarse RLS** — conectado como `gestorpro_app`
     (estilo `test/finanzas/auditoria-append-only.test.ts`), sin GUC de tenant ⇒
     0 filas; con GUC de empresa A ⇒ solo A; `INSERT` con `empresa_id` de B ⇒
     error `WITH CHECK`.
   - ② **lectura/escritura cross-tenant rechazada** — el cliente de la empresa A
     no puede leer, listar, ni mutar **ningún** dato de la empresa B (por cada
     tipo de entidad).
   - ③ **el proceso de la app NUNCA porta credenciales de `migrador`** — test/check
     que verifica que el `DATABASE_URL` efectivo del runtime resuelve al rol
     `gestorpro_app` y no a `gestorpro_migrador` (falla el arranque/CI si no).
3. **El aislamiento cross-tenant es FAIL-CLOSED y es una regla dura del proyecto**,
   al mismo nivel que "el dinero es inmutable" y "la auditoría es append-only":
   una consulta sin contexto de tenant debe dar **0 filas o error, nunca datos de
   otra empresa**. (Añadida a `CLAUDE.md` · Integridad de datos.)

---

## Resumen ejecutivo

GestorPro pasa de single-tenant (una empresa) a SaaS multi-tenant introduciendo
una entidad raíz **`Empresa`** y particionando los datos por `empresaId`. El
`empresaId` se trata como **dato de contexto de seguridad** —igual que
`usuarioId` hoy—: sale del JWT (`request.user`), **nunca del body**.

**Decisión principal de aislamiento — híbrido con RLS como frontera primaria.**
Para una app financiera con auditoría append-only el criterio decisivo es
**fallar cerrado**: un olvido del programador debe producir *error o cero filas*,
nunca *filas de otro tenant*. Solo **RLS de Postgres** (con `set_config(...,true)`
transaction-scoped) lo garantiza y es el único enfoque que cubre los `$queryRaw`
de los caminos de dinero (`SELECT ... FOR UPDATE` de sobrepago, saldo de horas
extra, vista `cuenta_por_pagar`) que cualquier hook del ORM deja descubiertos.
Encima, un **Prisma Client Extension (`$extends`)** como capa de conveniencia
(ergonomía, no seguridad). El filtro de aplicación puro (solo `where:{empresaId}`
en cada servicio) queda como **alternativa documentada de menor coste y mayor
riesgo** (falla abierto). **Es la decisión abierta #1.**

El trabajo es **additive y sin pérdida de datos** (tres olas: columna nullable →
backfill a "Empresa Default" → endurecer NOT NULL + FK + uniques). Esfuerzo
estimado, ya con las correcciones de la revisión: **~12–18 días**, con el camino
crítico en **el aislamiento (RLS + policies de tablas "hereda" + job
`barrerHuerfanos` + reescritura de los 4 `$queryRaw`) y la batería de tests de
aislamiento (~70–90 casos nuevos)**, no en la migración de schema.

---

## 1. Entidad `Empresa` + lista completa de models con `empresaId`

### 1.1 Modelo `Empresa`

Tenant raíz del SaaS. Campos propuestos:

| Campo | Tipo | Razón |
|---|---|---|
| `id` | `String @id @default(uuid()) @db.Uuid` | PK, ancla de partición |
| `nombre` | `String` | Razón social/comercial. **No** único (dos clientes pueden llamarse igual) |
| `slug` | `String @unique` | Identificador URL-safe estable para login multi-empresa y subdominio futuro (`acme.gestorpro.app`), sin exponer el UUID |
| `activo` | `Boolean @default(true)` | Baja lógica del tenant: corta acceso sin borrar datos (retención legal). Ver §3.5/I5: requiere invalidar sesiones |
| `plan` | `String @default("base")` | Gancho de billing. `String`, no `enum` (el catálogo de planes cambia con negocio) |
| `zonaHoraria` | `String @default("America/Panama")` | **No cosmético:** el motor de jornada usa Panamá; otra zona calcularía mal la fecha de turnos que cruzan medianoche y los recargos nocturnos. Default preserva el comportamiento actual |
| `creadoEn` | `DateTime @default(now())` | — |

> **Pendiente legal:** los recargos panameños (25/50/75/150%) son mínimos fijos
> de Panamá. Servir otro país exige revisar la capa legal de recargos —
> **fuera de alcance** de esta conversión.

### 1.2 Los 24 models — clasificación definitiva

**Convención:** *Directo* = FK `empresaId` propio (raíz de partición). *Hereda* =
el tenant se deriva por la cadena de FK; **no** lleva `empresaId` (no se
desnormaliza en esta fase, ver nota y la tensión I1 del Apéndice).

| Model | empresaId | Hereda vía / Razón | Constraints a componer |
|---|---|---|---|
| **Empresa** | (raíz) | — | `slug @unique` |
| **Sede** | **Directo** | Raíz operativa, ancla del árbol | NO añadir `@@unique([empresaId,nombre])` (hoy `nombre` no es único; ver 1.5) |
| **Usuario** | **Directo** (o vía `Membresia`, 1.3) | Pertenece a empresa(s) | `email` sigue `@unique` global. **Excluida de RLS** (§2.4) |
| **SesionRefresco** | Hereda (`usuarioId`) | Sesión/auth | + `empresaIdActiva` nullable (§3.5). **Excluida de RLS** |
| **Auditoria** | **Directo** | Append-only sin FK por diseño; filtrar por tenant sin JOIN | sin unique; + índice `(empresaId, entidad, entidadId)` |
| **Proveedor** | **Directo** | Catálogo privado por cliente | `@unique(nombre)` → `@@unique([empresaId, nombre])` |
| **Compra** | Hereda (`sedeId`) | dinero | `@@unique([proveedorId, numeroFactura])` ya particiona. Ver I1 (policy por-FK / `$queryRaw`) |
| **PagoProveedor** | Hereda (`compraId`) | dinero | — |
| **CategoriaGasto** | **Directo** | Por-empresa (1.4) | `@unique(nombre)` → `@@unique([empresaId, nombre])` |
| **Gasto** | Hereda (`sedeId`) | dinero | — |
| **VentaDiaria** | Hereda (`sedeId`) | dinero | `uq_venta_normal(sede_id,fecha,turno,cajera)` ya particiona |
| **DetalleCierre** | Hereda (`ventaId`) | — | `@@unique([ventaId, tipoArqueo])` |
| **Empleado** | Hereda (`sedeId`) | — | `@unique(numero)`→`@@unique([sedeId,numero])`; `@unique(qrToken)`→`@@unique([sedeId,qrToken])` (rompe `findUnique`, ver §7.2/I2) |
| **RolOperativo** | **Directo** | Por-empresa (1.4) | `@unique(clave)` → `@@unique([empresaId, clave])` |
| **EmpleadoRolOperativo** | Hereda | PK `(empleadoId, rolOperativoId)` | suficiente |
| **Kiosco** | Hereda (`sedeId`) | — | `tokenHash` es `String?` sin `@unique` hoy → sin cambio; acotar búsqueda por empresa |
| **Fichaje** | Hereda (`empleadoId`/`kioscoId`) | — | — |
| **RevisionFichaje** | Hereda (`fichajeId`) | — | `@unique(fichajeId)` |
| **Turno** | **Directo** | Por-empresa, `sedeId` nullable (1.4) | sin unique global hoy; mantener |
| **Jornada** | Hereda (`empleadoId`) | — | `@@unique([empleadoId, fecha])` |
| **Correccion** | Hereda (`jornadaId`) | — | — |
| **DiaFestivo** | **Directo** | Por-empresa (1.4) | `@unique(fecha)` → `@@unique([empresaId, fecha])` |
| **SaldoHorasExtra** | Hereda (`empleadoId`) | dinero | `@unique(empleadoId)`. Ver I1 (`$queryRaw` con lock) |
| **SolicitudCobro** | Hereda (`empleadoId`) | dinero | — |
| **ConfiguracionCobro** | **Directo** | Por-empresa (1.4) | fila única → `@@unique([empresaId])` |

> **`Caja` NO está en la lista** (no existe en el schema; corrección §0.1).

**Decisión — NO desnormalizar `empresaId` en hijos ("Hereda").** El aislamiento
lo da RLS sobre las raíces + la cadena de FK; desnormalizar exigiría `ALTER ADD
COLUMN` en tablas de dinero inmutables. **Tensión sin resolver (I1):** los
caminos `$queryRaw` con `FOR UPDATE` sobre tablas "hereda" (`compra`,
`saldo_horas_extra`) necesitan **policy con subquery por FK** (`EXISTS (SELECT 1
FROM sede WHERE sede.id = compra.sede_id AND sede.empresa_id = current_setting(...))`),
más cara que la policy directa. **Alternativa:** desnormalizar `empresa_id` SOLO
en las 2–3 tablas de dinero con `$queryRaw`+lock, para usar policy simple. **Es
la decisión abierta #3.**

### 1.3 `Usuario`: directo vs. `Membresia` N:M — decisión abierta #2

- **(A) `Usuario.empresaId` directo NOT NULL** (un usuario = una empresa). Simple;
  el JWT deriva el tenant trivialmente. El caso "un humano, dos negocios" = dos
  usuarios.
- **(B) `Usuario` sin `empresaId` + tabla `Membresia(usuarioId, empresaId, rol)`
  N:M** (§4). Soporta multi-empresa y modela limpiamente al super-admin.

**Recomendación: (B)**, porque es un SaaS y el caso multi-empresa es real y
barato, y resuelve el super-admin sin hacks. El resto del documento asume (B)
salvo donde se indique.

### 1.4 Los 5 catálogos ambiguos → todos POR-EMPRESA

`CategoriaGasto`, `RolOperativo`, `Turno` (`sedeId` nullable), `DiaFestivo`,
`ConfiguracionCobro`: todos por-empresa. Razón común: son configuración/taxonomía
de cada cliente; un catálogo global acoplaría tenants y daría a uno poder de
borrar datos "de todos". `DiaFestivo` por-empresa además da autonomía de
gobernanza (sembrar los nacionales por empresa es barato e idempotente).
**Confirmar en decisión abierta #4** (en especial `DiaFestivo`).

### 1.5 Constraints de identidad delicados

- **`Sede.nombre`**: hoy NO tiene `@unique`. NO añadir `@@unique([empresaId,nombre])`
  (endurecer algo libre puede romper el backfill si la default tiene homónimas).
- **`Empleado.numero`/`qrToken`**: `@unique` global → compuestos por `sedeId`.
  `qrToken` compuesto **rompe `findUnique`** (§7.2/I2): hay que reescribir la
  identificación por QR a `findFirst` derivando la sede del kiosco autenticado.
- **`Kiosco.tokenHash`**: `String?` sin `@unique` → sin cambio de constraint;
  acotar la búsqueda por empresa igualmente.
- **`Auditoria`**: añadir `empresaId` a una tabla con `REVOKE UPDATE/DELETE`
  (append-only) es el riesgo estructural mayor del backfill (§7.3).

---

## 2. Aislamiento de datos por tenant

### 2.1 Hechos del código que condicionan la decisión

1. **Pool con un solo rol, no por-request.** El backend conecta vía
   `PrismaPg({ connectionString })`, instancia única (`prisma.ts:19-21`), siempre
   como `gestorpro_app`. Una conexión física se reutiliza entre peticiones de
   distintos tenants: cualquier `SET` de sesión "pegado" se filtra a la siguiente.
2. **`$queryRaw`/`$executeRaw` es crítico, no marginal.** Aparece en los caminos
   de dinero: `SELECT ... FOR UPDATE` anti-sobrepago (`cuentas-por-pagar.service.ts:178,190`),
   saldo con lock (`saldo.service.ts:46`) y la vista `cuenta_por_pagar` cuyo
   filtrado por sede hoy se hace **en memoria** (`cuentas-por-pagar.service.ts:250-260`).
   Cualquier solución que solo intercepte el ORM deja estos caminos descubiertos.
3. **`$transaction` es omnipresente** (11 sitios) pero ninguno setea tenant.

La pregunta correcta no es "cuál es más elegante" sino **cuál falla cerrado**.

### 2.2 Comparación de los tres enfoques

| Criterio | A · `$extends` (ORM hooks) | B · RLS Postgres (`set_config`) | C · Wrapper de servicio |
|---|---|---|---|
| Cubre ORM tipado | Sí (60–70%) | Sí | Sí (si se usa) |
| Cubre `$queryRaw` (sobrepago, saldo, vista CxP) | **No** | **Sí** | Solo manual |
| Cubre nested writes / `upsert` | Frágil | Sí | Manual |
| Resiste olvidos del programador | No | **Sí** | No |
| Compatible con pool PrismaPg | Sí (AsyncLocalStorage) | Sí (`set_config(...,true)` en tx) | Sí |
| **Modo de fallo** | **Abierto (fuga)** | **Cerrado (0 filas/error)** | **Abierto (fuga)** |
| Coste de implementación | Medio | Alto inicial, luego ~nulo | Alto + frágil |

**RLS — micro-pseudocódigo** (no es implementación):

```sql
ALTER TABLE gasto ENABLE ROW LEVEL SECURITY;
ALTER TABLE gasto FORCE  ROW LEVEL SECURITY;
CREATE POLICY aislamiento_empresa ON gasto
  USING      (empresa_id = current_setting('app.empresa_id', true)::uuid)
  WITH CHECK (empresa_id = current_setting('app.empresa_id', true)::uuid);
```

```ts
// wrapper sobre $transaction
return prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.empresa_id', ${empresaId}, true)`; // true = LOCAL
  return fn(tx); // ORM y raw quedan filtrados por RLS
});
```

`set_config(...,true)` muere en el `COMMIT` → no contamina la conexión devuelta
al pool. El 3er arg `true` de `current_setting` devuelve `NULL` si no está
seteado → la policy no matchea → **0 filas** (fail-closed), no excepción.

### 2.3 Recomendación: RLS (frontera) + `$extends` (conveniencia)

- **Capa 1 — RLS, la frontera real.** Policy `USING`/`WITH CHECK` por tabla
  tenant-scoped; `FORCE ROW LEVEL SECURITY`; hook global que abre una tx por
  request y setea el GUC. La vista `cuenta_por_pagar` queda cubierta por las
  policies de sus tablas base → **eliminar el filtrado en memoria** por `sede_id`
  (`cuentas-por-pagar.service.ts:250-260`).
- **Capa 2 — `$extends`, conveniencia (no seguridad).** Auto-inyecta `empresaId`
  en `where`/`data` del ORM. Se asume con agujeros (raw, nested): está bien,
  debajo está RLS.
- **Alternativa de menor coste (mayor riesgo): solo capa de aplicación** (filtro
  `where` en cada servicio + filtro explícito en los 4 raw), sin RLS. Falla
  abierto; riesgo en disciplina de código. **Decisión abierta #1.**

**Riesgo residual:** olvidar habilitar RLS en una tabla nueva. **Mitigación:**
test que recorra `information_schema` y falle si una tabla tenant-scoped no tiene
`rowsecurity = true` + `FORCE` (necesita la allowlist de §2.4).

### 2.4 Prerrequisitos y exclusiones de RLS (correcciones de la revisión)

- **`gestorpro_migrador` necesita `BYPASSRLS`.** Con `FORCE`, el owner también
  queda sujeto a policies → seed y backfill (corren como migrador) fallarían.
  Hay que crear el rol con `CREATE ROLE gestorpro_migrador LOGIN BYPASSRLS` en
  `01-init-roles.sh` y, en bases ya creadas, `ALTER ROLE gestorpro_migrador
  BYPASSRLS` (requiere superusuario; lo corre el initdb que ya es superusuario).
  `gestorpro_app` **sigue SIN** BYPASSRLS (es quien debe quedar aislado).
- **Tablas EXCLUIDAS de RLS (allowlist explícita):** `usuario`, `sesion_refresco`
  y `empresa`. Razón: el login (`auth.service.ts:48`) y el refresh
  (`auth.service.ts:83`) consultan `usuario`/`sesion_refresco` **sin** contexto de
  empresa (aún no hay sesión); con RLS+FORCE devolverían 0 filas y romperían el
  login. Su aislamiento es por otra vía (email `@unique` global, refresh token
  opaco). El test de cobertura RLS (§2.3) debe consultar esta allowlist.

### 2.5 Código fuera de request (jobs, motor de jornada) — corrección B2

RLS asume "abrir una tx con `set_config` por request", pero hay lógica que corre
**fuera de toda request y de toda `$transaction`**:

- **`barrerHuerfanos`** (`jornada.service.ts:143-179`): recorre TODOS los
  empleados/fichajes de TODAS las sedes y crea jornadas con `prisma.jornada.create`
  fuera de tx. Bajo RLS leería 0 filas (GUC sin setear) y reportaría `marcadas:0`
  **sin error**. Debe declararse **job de plataforma** que **itera empresas** y
  abre una tx con `set_config` por empresa (o usa el bypass auditado de §4.4).
- **Lecturas sueltas fuera de tx** que también hay que auditar:
  `saldo.service.ts` (obtenerSaldo), `dashboard.service.ts:43-64` (agregados),
  las lecturas previas al tx en `jornada.service.ts:97-120`, y el propio
  `auth.service.ts`. Regla: **toda** ruta/job que toque datos de tenant debe
  pasar por el wrapper `txEmpresa`, no solo "las peticiones autenticadas".

---

## 3. Inyección de `empresaId` desde el contexto de auth (nunca del body)

### 3.1 Principio
`empresaId` es contexto de seguridad, como `usuarioId`: lo deriva el servidor de
la identidad autenticada, **nunca** de `request.body` ni query string.

### 3.2 Payload del access token
El `empresaId` **activo** va dentro del access token (vida 15m). El payload pasa
de `{ sub, rol }` (`auth.tipos.ts:12-15`) a:

```ts
interface PayloadAccess {
  sub: string;               // usuarioId (sin cambios)
  rol: Rol;                  // rol EFECTIVO en la empresa activa (de Membresia)
  empresaId: string | null;  // empresa ACTIVA de ESTE token; null solo para super-admin sin empresa
  esSuperAdmin: boolean;     // endpoints de plataforma sin ir a BD por request
}
```

`rol` deja de leerse de `Usuario.rol` global y pasa a ser `Membresia.rol` de la
empresa activa, resuelto en login. Esto es lo que consume `app.autorizar` **sin
cambiar de firma**.

### 3.3 Resolución en login
Enganche: `auth.service.ts:44-77` (`iniciarSesion`), que hoy firma `{sub,rol}` en
la línea 61. Tras validar credenciales: 0 membresías y no super-admin →
`ErrorAutenticacion`; 1 → esa; N → la `predeterminada` (no se elige por body);
super-admin sin membresía → `empresaId=null`.

### 3.4 preHandler global y conexión con el §2
`request.user` ya queda poblado por `request.jwtVerify()` (`auth.plugin.ts:42`) y
el token **ya trae `empresaId`**. Un preHandler global **solo transporta** el
valor a `request.empresaId` (las rutas públicas —login, refresh, `/kioscos`
público— quedan con `empresaId=null`). **El preHandler NO aplica el filtro**; la
aplicación se hace al abrir cada `$transaction` con el `set_config` (§2.2),
separando "leer el tenant" de "aplicarlo a la BD" para no perder el GUC por el
pool. En rutas, el patrón es idéntico al de `usuarioId`:

```ts
await registrarPago({ ...request.body,
  usuarioId: request.user.sub,      // ya existía
  empresaId: request.user.empresaId // NUEVO, del token, nunca del body
});
```

### 3.5 Refresh y cambio de empresa
- **Refresh** (`auth.service.ts:80-100`): el refresh token es opaco y agnóstico de
  empresa; se añade `empresaIdActiva` (nullable) a `SesionRefresco` y se
  **re-resuelve** la membresía al emitir el nuevo access (un cambio de rol surte
  efecto al siguiente refresh, ventana máx. 15m).
- **`POST /auth/cambiar-empresa { empresaId }`** (autenticado): valida que el
  usuario **tenga membresía** en `empresaId` (o sea super-admin), actualiza
  `SesionRefresco.empresaIdActiva` y emite un access nuevo. Aquí `empresaId` SÍ
  viene en el body, pero **no viola la regla**: es una *petición de cambio de
  contexto sujeta a autorización* (se verifica contra la BD); el filtro sigue
  saliendo del token resultante.
- **Hueco a resolver (I5):** revocar `esSuperAdmin` o `Empresa.activo=false` NO
  surte efecto hasta el refresh (token vivo 15m). Para la baja de tenant hay que
  **invalidar sesiones** (borrar `SesionRefresco`) y/o chequear `Empresa.activo`
  en el preHandler (query extra). **Decisión abierta #5.**

---

## 4. Jerarquía de permisos: super-admin de plataforma vs. admin de empresa vs. usuario

### 4.1 Problema
Hoy `Usuario.rol` (`empleado|supervisor|administrador`, `schema.prisma:20-26`) es
**global**. Multi-tenant necesita dos ejes hoy colapsados: ¿de qué empresa(s)
eres y con qué rol?, y ¿eres operador de la plataforma SaaS (transversal)?

### 4.2 Esquema propuesto (asume diseño (B))
- **`Usuario`**: conserva `email @unique` global; se añade **`esSuperAdmin Boolean
  @default(false)`**. `Usuario.rol` global se retira del uso de autorización (dato
  legado, §5).
- **`Membresia`** (nueva): `usuarioId, empresaId, rol` (reutiliza el `enum Rol`),
  `predeterminada Boolean`, `@@unique([usuarioId, empresaId])`, `@@index([empresaId])`.

**Decisiones:** se **reutiliza el `enum Rol`** tal cual (sin nuevos valores) →
los `autorizar('administrador')` existentes siguen funcionando, ahora scoped por
el `empresaId` del token. **Super-admin = flag booleano ortogonal** (puede no
tener ninguna membresía).

### 4.3 Coexistencia con `app.autorizar`
`app.autorizar(...roles)` (`auth.plugin.ts:50-57`) **no cambia de firma**: sigue
comparando `request.user.rol`. Cambia el **origen** de ese `rol`: de `Usuario.rol`
global a `Membresia.rol` de la empresa activa, firmado en el token. Resultado:
**cero cambios** en rutas que ya hacen `autorizar('supervisor','administrador')`.
Para rutas de plataforma (crear empresas, billing) se añade `soloPlataforma` que
exige `request.user.esSuperAdmin`.

### 4.4 Bypass de tenant para soporte (explícito y auditado)
El super-admin **no** se salta el filtro implícitamente. Dos modos:
1. **"Entrar a la empresa"** (95% de casos): usa `cambiar-empresa` para un token
   con `empresaId=X` y opera **como usuario de X**, sujeto a RLS de X, con rastro
   en `Auditoria` (su `usuarioId` real).
2. **"Vista plataforma"** (cross-empresa real, solo endpoints `soloPlataforma`):
   la policy reconoce un GUC de bypass:
   `USING (empresa_id = current_setting('app.empresa_id',true)::uuid OR current_setting('app.bypass_tenant',true)='on')`.
   El wrapper setea `app.bypass_tenant='on'` **solo si** `esSuperAdmin` y
   **registra en `Auditoria`** cada acceso.

> Como `gestorpro_app` **no** tiene BYPASSRLS (§2.4), el super-admin de aplicación
> no es super-admin de Postgres: la policy de bypass por GUC es el ÚNICO camino, y
> es auditado. (Esto es coherente con la corrección B1.)

**Regla dura:** el bypass nunca ocurre por defecto ni por omisión del `empresaId`;
siempre es decisión explícita de un endpoint `soloPlataforma` con
`esSuperAdmin===true`, y siempre auditada.

---

## 5. Migración single-tenant → "una Empresa por defecto"

Estrategia **additive en tres olas**, nunca destructiva. **No** `migrate reset`.

**Ola 0 (prerrequisito de la opción RLS):** `ALTER ROLE gestorpro_migrador
BYPASSRLS` y actualizar `01-init-roles.sh` (§2.4). Sin esto, las olas siguientes
(que corren como migrador) fallan bajo RLS+FORCE.

**Ola 1 — `CREATE TABLE empresa` + `ADD COLUMN empresa_id` NULLABLE** en las
tablas de partición directa: `sede`, `usuario` (si A) o `membresia` (si B),
`proveedor`, `categoria_gasto`, `rol_operativo`, `turno`, `dia_festivo`,
`configuracion_cobro`, `auditoria`. `ADD COLUMN NULL` es **metadata-only** en
Postgres — no reescribe filas, seguro incluso en `auditoria`/dinero.

**Ola 2 — Backfill (idempotente, como `gestorpro_migrador`):**

```sql
INSERT INTO empresa (id, nombre, slug, activo, plan, zona_horaria, creado_en)
VALUES (gen_random_uuid(), 'Empresa Default', 'default', true, 'base', 'America/Panama', now())
ON CONFLICT (slug) DO NOTHING;
-- por cada raíz: UPDATE <tabla> SET empresa_id = (SELECT id FROM empresa WHERE slug='default') WHERE empresa_id IS NULL;
```

Las tablas "hereda" NO se tocan. `auditoria` se backfillea **por el migrador**
(el `app` tiene `REVOKE UPDATE`; el owner no está afectado por ese REVOKE), una
vez, transaccional. Si diseño (B): crear una `Membresia{usuarioId, empresaId=default,
rol=Usuario.rol, predeterminada=true}` por cada usuario.

**Ola 3 — Endurecer** (tras verificar cero `empresa_id IS NULL`): `SET NOT NULL` +
`ADD FOREIGN KEY` (en `auditoria`, usar `NOT VALID` + `VALIDATE CONSTRAINT` para
no bloquear escrituras durante el scan); uniques compuestos **creando el nuevo
ANTES de dropear el viejo** en la misma transacción.

**Seed (`seed.ts`)** — mantener idempotencia: `empresa.upsert({where:{slug:'default'}})`
al inicio; inyectar `empresaId` en Sede/admin(membresía)/RolOperativo/CategoriaGasto/
ConfiguracionCobro/DiaFestivo/Turno; cambiar los `where` de upsert a claves
compuestas (`empresaId_nombre`, `empresaId_clave`, `empresaId_fecha`, `empresaId`).

**Grants:** la tabla `empresa` recibe permisos vía `ALTER DEFAULT PRIVILEGES` +
`GRANT ... ON ALL TABLES`. **Decisión abierta #7:** ¿`app` puede `INSERT/UPDATE
empresa` (alta in-app) o solo `SELECT` (alta por migrador/super-admin, con
`REVOKE` explícito)? Confirmar que `auditoria` sigue en el `REVOKE` tras añadir la
columna (`post-migrate.sql:14-17`).

---

## 6. Tests de fallo de aislamiento (cross-tenant)

**Principio rector:** toda prueba parte de un fixture con **DOS empresas pobladas
(A y B)** y un actor autenticado en A; la aserción es que A **no puede observar ni
tocar** nada de B. **Convención:** error de aislamiento debe parecer **404** (no
403) para no revelar la existencia de recursos de otro tenant (anti-enumeración).

**Fixture base:** helper `sembrarDosEmpresas()` → `{empresaA, empresaB}`, cada una
con sede, usuarios, proveedor, compra+pago, categoría, gasto, venta cerrada,
empleado+kiosco+turno+jornada+saldo+solicitud y filas de auditoría; tokens JWT por
actor (con `empresaId`).

| # | Escenario | Aserción núcleo |
|---|---|---|
| (a) | **Leer/listar cross-tenant** (toda entidad) | `obtener(idDeB)` ⇒ 404/null; `listar()` ⇒ ids **solo A** (comparar **conjuntos**, no `length`) + control: B sí ve los suyos |
| (b) | **Mutar cross-tenant** (el dinero) | pagar/corregir/cerrar/aprobar/recalcular de B ⇒ 404 + **no-mutación**: snapshot antes → acción como A → re-leer sin filtro → `toEqual(antes)` |
| (c) | **FK-injection vía body** | crear gasto con `sedeId=deB`, pago con `compraId=deB`, jornada con `empleadoId=deB`… ⇒ el padre se valida contra el `empresaId` del token ⇒ 404/422 |
| (d) | **Dashboard / agregados** | los ~6 `aggregate()` (`dashboard.service.ts:43-64`, `cobro.service.ts:83`) + vista CxP: A=100, B=999 → `dashboard(A)==100`, nunca 1099 |
| (e) | **Super-admin auditado** (HTTP) | super-admin ve A y B; cada acción cross-tenant **escribe en `Auditoria`** con `usuarioId` real; admin normal en la misma ruta ⇒ 403/404 |
| (f) | **Anti-spoof `empresaId`** (HTTP) | mandar `empresaId=B` en el body como usuario de A ⇒ la fila queda con `empresaId=A` (del token); sin `empresaId` en body ⇒ igual funciona |
| (g) | **`$queryRaw` / reportes** | `SUM`/`FOR UPDATE` sobrepago (`cuentas-por-pagar.service.ts:178,190`), vista CxP (`:250`), saldo (`saldo.service.ts:46`): solo agregan filas de la misma empresa |
| (RLS) | **Frontera DB** (rol `gestorpro_app`, estilo `auditoria-append-only.test.ts`) | con `set_config('app.empresa_id','A')`: `SELECT * FROM gasto` ⇒ solo A; `WHERE id=gastoDeB` ⇒ 0 filas; `INSERT (empresa_id='B')` ⇒ error `WITH CHECK`; sin GUC ⇒ 0 filas |
| (cobertura) | **Toda tabla tenant-scoped tiene RLS** | recorrer `information_schema` y fallar si una tabla tenant-scoped no tiene `rowsecurity`+`FORCE` (usa la allowlist de §2.4) |
| (job) | **`barrerHuerfanos` multi-tenant** | con A y B con huérfanos, el job marca los de **ambas**; no `marcadas:0` silencioso (cubre B2) |
| (cred) | **El runtime no usa `migrador`** (§0.bis regla 1/③) | el `DATABASE_URL` efectivo del proceso resuelve a `gestorpro_app`, no a `gestorpro_migrador`; falla CI/arranque si porta credenciales del migrador |

**Mínimo de regla dura (§0.bis):** los tres tests obligatorios ①②③ son,
respectivamente, la fila **(RLS)** (el rol app no se salta RLS), las filas
**(a)/(b)** (lectura/escritura cross-tenant rechazada) y la fila **(cred)** (el
proceso no porta credenciales de migrador). No son opcionales.

**Niveles:** (a)–(d) a nivel **servicio**; (e),(f) y smoke de (a) a nivel **HTTP**
(`app.inject`); (RLS) a nivel **DB** con `pg.Client` crudo. El test **RLS a nivel
DB** es el de mayor ROI. **Total estimado: ~70–90 casos nuevos.**

---

## 7. Riesgos de la conversión

### 7.1 Migrations que tocan tablas existentes
`ADD COLUMN empresa_id` sobre **9 tablas con datos vivos**; en Ola 1 son `NULL` →
metadata-only, seguro incluso en `auditoria`/dinero. En Ola 3, `SET NOT NULL`/`ADD
FK` hacen full-scan; en `auditoria` mitigar con `NOT VALID`+`VALIDATE`. **Esfuerzo:
S→M.**

### 7.2 `@unique` → `@@unique([empresaId,...])` — lo más delicado
Tablas: `proveedor.nombre`, `categoria_gasto.nombre`, `rol_operativo.clave`,
`dia_festivo.fecha`, `configuracion_cobro`, `empleado.numero`, `empleado.qrToken`.
1. **Orden:** crear el índice compuesto **antes** de dropear el viejo (misma tx).
2. **Relajar unicidad** permite duplicados entre empresas; confirmar que la default
   no tenía duplicados latentes.
3. **`empleado.qrToken` rompe `findUnique` (I2):** `identificacion.service.ts:19-20`
   usa `findUnique({where:{qrToken}})`; al volverse compuesto **deja de compilar**.
   Hay que reescribir a `findFirst` derivando la sede del **kiosco autenticado**
   (`x-kiosco-token` → `Kiosco.sedeId`), porque el QR identifica al empleado
   *antes* de conocer su sede. Cambio de lógica en el camino crítico de fichaje +
   sus tests. **Esfuerzo: M→L** (sube respecto a la estimación inicial).
4. **`configuracion_cobro`:** `findFirst()` sin filtro → `findUnique({where:{empresaId}})`.

### 7.3 Tablas de dinero inmutables y `auditoria`
La inmutabilidad es **de aplicación/negocio**, no bloqueo DDL: el owner puede
`ALTER`; `ADD COLUMN NULL` no reescribe filas. `gasto`/`pago_proveedor`/
`venta_diaria` son "hereda" → **NO se tocan** (ventaja de no-desnormalizar).
`auditoria` SÍ lleva `empresa_id` y SÍ requiere backfill (mutar una bitácora
append-only): legítimo (completa un dato estructural, no altera el hecho
auditado), hecho **una vez, transaccional, por el migrador** (no afectado por el
REVOKE sobre el `app`). **Esfuerzo: M.**

### 7.4 Impacto en los tests (17 archivos, ~136 casos)
Al volver `empresaId` NOT NULL, toda creación de fixture `prisma.sede.create({...})`
(o raíces sin padre) falla por columna obligatoria. **Casos afectados: estimación
~70–80%** (sin contar call-sites reales; cifra a confirmar antes de comprometerla,
ver M1). **No** se rompen `auditoria-append-only.test.ts` (usa `pg.Client` crudo)
ni los de utilidades. **Causa raíz:** un cuello de botella, la creación de `Sede`.
**Estrategia de menor fricción:** helper cacheado `obtenerEmpresaDefault()` +
centralizar `nuevaSede()` para inyectar `empresaId` → ~90% de los casos pasan sin
tocarse; arreglar lo roto **~medio día**. El esfuerzo real está en escribir la
batería del §6.

---

## Cierre — Plan por fases, esfuerzo y decisiones abiertas

### Plan por fases (orden recomendado)

| Fase | Bloque | Esfuerzo | Notas |
|---|---|---|---|
| **0** | (RLS) `BYPASSRLS` al migrador + `01-init-roles.sh`; modelo `Empresa` (+`Membresia`, `esSuperAdmin`); Ola 1 `ADD COLUMN` nullable | **S** (~0.5–1d) | Additive; prerrequisito RLS |
| **1** | Backfill Ola 2 (empresa default + raíces + membresías) idempotente | **S–M** (~0.5d) | `auditoria` por el migrador |
| **2** | Ola 3: NOT NULL + FK + uniques compuestos | **M** (~1d) | `NOT VALID`+`VALIDATE`; orden de uniques |
| **3** | `@unique`→`@@unique` + call-sites: **fichaje/qrToken (findUnique→findFirst vía kiosco)**, config_cobro | **M→L** (~1.5–2d) | Toca camino crítico de fichaje |
| **4** | Auth: payload, login/refresh, guards, `cambiar-empresa`, `SesionRefresco.empresaIdActiva`, invalidación de sesión en baja (I5) | **M** (~1–1.5d) | §3, §4 |
| **5** | **Aislamiento §2:** RLS (policies por tabla **incl. subquery por-FK para "hereda"**, `FORCE`, hook `txEmpresa`, allowlist de exclusión, **`barrerHuerfanos` multi-tenant**, lecturas sueltas) o filtro de aplicación; eliminar filtrado en memoria de la vista CxP | **L** (~4–5d) | **Camino crítico**; sube por B2/I1 |
| **6** | `$extends` de conveniencia (si RLS) | **S–M** (~0.5–1d) | Incremental |
| **7** | Arreglar fixtures + `seed.ts` | **S** (~0.5d) | Helper único resuelve ~90% |
| **8** | **Batería de aislamiento §6** (~70–90) + test RLS DB + test de cobertura RLS + test `barrerHuerfanos` | **L** (~2–3d) | El valor real del SaaS |
| **9** | Grants/append-only: validar `empresa` y `auditoria` | **S** (~0.5d) | Verificación |

**Total: ~12–18 días.** Camino crítico: **Fase 5 (aislamiento) + Fase 8 (tests)**.
Orden duro: 0→1→2 antes que 3; 4 antes que 5; 5 antes que 8.

### Decisiones abiertas que el revisor debe confirmar

1. ~~Aislamiento~~ **CERRADA (2026-06-21): RLS + `$extends`, fail-closed.** Ver §0.bis.
2. ~~`Usuario`↔`Empresa`~~ **CERRADA (2026-06-21): (B) `Membresia` N:M** (elección
   de Jim, para no cerrar el caso multi-empresa del SaaS + super-admin limpio).
   Ver §0.bis. §3.2/§4.2 son canónicas.
3. ~~Tablas "hereda"~~ **CERRADA (dirección, 2026-06-21): policy con subquery
   por-FK; NO desnormalizar tablas de dinero inmutables.** Solo se reabre con
   medición que pruebe degradación inaceptable del `FOR UPDATE`. Ver §0.bis.
4. **Catálogos:** confirmar **POR-EMPRESA** para los 5 (esp. `DiaFestivo`:
   por-empresa vs feriados nacionales globales).
5. **Baja de empresa / revocación de super-admin (I5):** ¿invalidar sesiones
   (borrar `SesionRefresco`) y/o chequear `Empresa.activo` en el preHandler?
6. **`Sede.nombre`:** confirmar NO añadir `@@unique([empresaId,nombre])`.
7. **`email`:** confirmar sigue `@unique` global (no `@@unique([empresaId,email])`).
8. **Grants de `empresa`:** ¿`app` puede `INSERT/UPDATE` (alta in-app) o solo
   `SELECT`?
9. **Super-admin en ESTA conversión** o diferido (hoy no existe).
10. **Multi-país / recargos legales:** `zonaHoraria` se añade ahora; la capa legal
    panameña queda fuera de alcance — confirmar.

---

## Apéndice A — Revisión adversarial (v1)

Revisión escéptica contra el código real. Las correcciones de los bloqueantes ya
están incorporadas arriba; se conserva el detalle para trazabilidad.

### Bloqueantes (verificados)
- **B1 — `BYPASSRLS` ausente.** `01-init-roles.sh:20,23` crea ambos roles `LOGIN`
  sin `BYPASSRLS`. Con `FORCE`, el migrador owner queda sujeto a policies → seed y
  backfill devolverían 0 filas. Corrección: `ALTER ROLE gestorpro_migrador
  BYPASSRLS` (§2.4, Ola 0).
- **B2 — `barrerHuerfanos` cross-tenant.** `jornada.service.ts:143-179`: itera
  todos los empleados/fichajes sin filtro y crea jornadas fuera de tx → bajo RLS,
  0 filas silenciosas. Corrección: job de plataforma que itera empresas (§2.5).
- **B3 — `Caja` no existe.** `schema.prisma` = 24 models, sin `Caja`. Corrección:
  eliminado del inventario (§1.2).

### Importantes
- **I1 — Policy de tablas "hereda" con `$queryRaw`.** El ejemplo de policy trivial
  (`empresa_id = current_setting(...)`) no aplica a `compra`/`saldo_horas_extra`
  (no tienen columna directa); requieren subquery por-FK o desnormalizar.
  Decisión abierta #3.
- **I2 — `Empleado.qrToken` compuesto rompe `findUnique`.** No es solo "acotar":
  `identificacion.service.ts:19-20` deja de compilar; reescribir a `findFirst` vía
  kiosco. §7.2.
- **I3 — `ConfiguracionCobro.findFirst()` sin filtro.** `findFirst`→`findUnique
  ({where:{empresaId}})`; bajo RLS la tabla (raíz directa) ya queda cubierta.
- **I4 — Excluir `usuario`/`sesion_refresco`/`empresa` de RLS** (login corre sin
  contexto de empresa). §2.4.
- **I5 — Revocar super-admin / baja de empresa no surte efecto hasta el refresh**
  (token 15m). Invalidar sesiones / chequear `Empresa.activo`. §3.5, decisión #5.

### Menores
- **M1 — Cifra de tests rotos (~90%) sin contar call-sites reales;** rebajar
  confianza o contar antes de comprometer.
- **M2 — Esfuerzo ~9–14d optimista;** con B1/B2/I1/I2 sube a ~12–18d (ya ajustado
  en el plan).
- **M3 — Backfill de `auditoria` por el migrador** es correcto (el REVOKE es sobre
  el `app`, no sobre el owner); solo confirmar el rol.

### Sólido (según la revisión)
- "Fallar cerrado" + `set_config(...,true)` transaction-scoped para no contaminar
  el pool singleton: correcto y bien diagnosticado.
- `empresaId` desde el JWT y `cambiar-empresa` como "cambio de contexto sujeto a
  autorización": respeta la regla del proyecto.
- No desnormalizar para no tocar tablas de dinero inmutables: buen instinto (choca
  con I1 solo en los caminos `$queryRaw`).
- Test de frontera RLS a nivel DB: el de mayor ROI, bien priorizado.
