# GestorPro — Brief del área de finanzas

Plataforma de administración para empresa de retail en Panamá. Sistema de
cuentas por pagar y control de gastos. NO es un POS ni maneja inventario:
eso lo cubre Firestec, un sistema externo sin API.

Este brief cubre el **Bloque 1**. El Bloque 2 (asistencia) se aborda después.

---

## Stack

- Node.js + TypeScript + Fastify
- Prisma ORM + PostgreSQL
- Vitest + Testcontainers para tests
- Frontend (fase posterior): React + Vite

---

## Estado actual

Ya están definidos y entregados estos archivos (ubicarlos según la
estructura de abajo):

- `schema.prisma` — 9 entidades + vista `cuenta_por_pagar`
- `correccion.service.ts` — servicio genérico de corrección
- `auditoria.repository.ts` — repositorio append-only
- `dashboard.service.ts` — consultas del dashboard
- `cuentas-por-pagar.routes.ts` — rutas de proveedores/compras/pagos
- `dashboard.routes.ts` — rutas del dashboard
- `correccion.test.ts` — tests del servicio de corrección
- `global-setup.ts` + `vitest.config.ts` — setup de tests
- `seed.ts` — datos semilla
- `migracion_complementaria.sql` — vista, índice parcial, revoke

---

## Estructura de carpetas objetivo

```
proyecto/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── src/
│   ├── services/
│   │   ├── correccion.service.ts
│   │   └── dashboard.service.ts
│   ├── repositories/
│   │   └── auditoria.repository.ts
│   ├── routes/
│   │   ├── cuentas-por-pagar.routes.ts
│   │   ├── dashboard.routes.ts
│   │   ├── gastos.routes.ts          ← POR CREAR
│   │   ├── ventas.routes.ts          ← POR CREAR
│   │   └── correcciones.routes.ts    ← POR CREAR
│   ├── plugins/
│   │   └── auth.ts                   ← POR CREAR (Fase 0)
│   └── app.ts                        ← POR CREAR (bootstrap Fastify)
└── test/
    ├── global-setup.ts
    └── correccion.test.ts
```

---

## Tareas pendientes del Bloque 1

### 1. Rutas de gastos — `src/routes/gastos.routes.ts`

Calcar el estilo de `cuentas-por-pagar.routes.ts` (validación con schema
JSON, manejo de errores con try/catch + log).

- `POST /gastos` — registrar un gasto.
- `GET /gastos` — listar por período (query: desde, hasta, sedeId opcional).

**Regla de coherencia (RECHAZAR si no se cumple, devolver 400):**
- Si la categoría tiene `esPagoEmpleado = true` → `empleadoId` es
  obligatorio en el body.
- Si la categoría tiene `esPagoEmpleado = false` → `empleadoId` y
  `tipoPago` deben venir vacíos; si vienen, rechazar.
- Hay que leer la `CategoriaGasto` para conocer `esPagoEmpleado` antes
  de validar.

El gasto entra como movimiento `normal` (default). Las correcciones NO
pasan por aquí.

### 2. Rutas de ventas diarias — `src/routes/ventas.routes.ts`

- `POST /ventas` — registrar el cierre diario.
- `GET /ventas` — listar por período.

**Manejo del duplicado:** el índice único parcial `uq_venta_normal`
rechaza un segundo cierre `normal` para el mismo (sede, fecha). Capturar
el error Prisma `P2002` y devolver **409** con mensaje claro: "Ya existe
el cierre de esa fecha; use una corrección para ajustarlo." No dejar
escapar el error crudo de Postgres.

La venta entra como movimiento `normal`. `fechaOperacion` es la fecha del
cierre, distinta de `creadoEn`.

### 3. Endpoint de corrección — `src/routes/correcciones.routes.ts`

**UN SOLO endpoint genérico**, no tres. El servicio ya es genérico.

- `POST /correcciones`
- Body: `entidad` ("gasto" | "pago" | "venta"), `movimientoId` (uuid),
  `motivo` (string, obligatorio), `montoCorregido` (number, opcional —
  si se omite es anulación pura).
- Mapear `entidad` al adaptador correspondiente (`adaptadorGasto`,
  `adaptadorPago`, `adaptadorVenta`) y llamar a `corregirMovimiento`.
- Capturar `ErrorCorreccion` → 400 con el mensaje. Otros errores → 500.

### 4. Ajuste en `correccion.service.ts`

Reemplazar la llamada directa `tx.auditoria.create(...)` por
`auditoriaRepo.registrar(asiento, tx)` — pasando SIEMPRE el cliente
transaccional `tx` para preservar la atomicidad. Importar el repo.

### 5. Bootstrap — `src/app.ts`

Crear la instancia Fastify y registrar los plugins de rutas con prefijo:

- `cuentasPorPagarRoutes` → `/cuentas-por-pagar`
- `dashboardRoutes` → `/dashboard`
- `gastosRoutes` → `/gastos`
- `ventasRoutes` → `/ventas`
- `correccionesRoutes` → `/correcciones`

---

## Dependencia de Fase 0 (transversal, NO es Bloque 1)

**Auth JWT con refresh + roles.** Es infraestructura compartida por ambos
bloques. Construir como `src/plugins/auth.ts`.

Mientras tanto, TODAS las rutas del Bloque 1 deben escribirse para leer el
usuario desde `request.user` (lo poblará el middleware de auth), NO desde
el body. Las rutas ya entregadas que reciben `usuarioId` en el body deben
migrarse a `request.user` cuando el plugin de auth exista. Dejar un
comentario `// TODO(auth): usuarioId desde request.user` en cada punto.

---

## Orden de arranque del proyecto

1. `npm init` + instalar dependencias (fastify, @prisma/client, prisma,
   typescript, tsx, vitest, @testcontainers/postgresql).
2. Colocar los archivos ya entregados en la estructura de carpetas.
3. `prisma migrate dev --name init` — crea las tablas.
4. Editar el `.sql` de esa migración: pegar al final el contenido de
   `migracion_complementaria.sql` (vista, índice único parcial, revoke).
   Descomentar el REVOKE y poner el nombre real del rol de la app.
5. `prisma generate`.
6. `prisma db seed` (configurar `"prisma": { "seed": "tsx prisma/seed.ts" }`
   en package.json).
7. Crear los archivos pendientes (tareas 1–5).
8. `vitest run` — verificar que los tests pasan (requiere Docker).

---

## Reglas de diseño que NO se deben romper

- **Inmutabilidad:** los movimientos de dinero (Gasto, PagoProveedor,
  VentaDiaria) nunca se editan ni borran. Toda corrección pasa por
  `corregirMovimiento`.
- **`cuenta_por_pagar` es una vista derivada**, nunca una tabla. El saldo
  se calcula, no se persiste.
- **La auditoría es append-only.** Solo se escribe vía
  `auditoriaRepo.registrar`. Nunca update ni delete.
- **Dinero en `Decimal`**, jamás `Float`. Redondear a 2 decimales en la
  salida.
- **El `usuarioId` de un movimiento sale del token de auth**, no del
  cliente.
