# GestorPro — Estructura de carpetas

App unificada: un backend Fastify, un frontend React, una base de datos.
Las dos áreas funcionales (finanzas y asistencia) conviven en el mismo
proyecto y comparten el núcleo. Esta estructura cubre las 7 fases completas;
las carpetas de fases futuras se crean vacías y se llenan al llegar a su fase.

## Criterio de organización

- **Backend por capas**, y dentro de cada capa, por dominio. Un servicio de
  finanzas y uno de asistencia viven en `services/`, en subcarpetas
  distintas. No se separan en dos proyectos: es una sola app.
- **El núcleo es transversal.** Lo que comparten finanzas y asistencia
  (`Sede`, `Usuario`, `Auditoria`, auth, el servicio de corrección) va en
  carpetas `core/` o `shared/`, no dentro de un área.
- **Frontend por feature**, espejando los módulos del backend.
- **Monorepo simple**: `backend/` y `frontend/` como raíces hermanas. No
  hace falta herramienta de monorepo (Nx, Turborepo) para dos paquetes.

---

## Árbol completo

```
gestorpro/
│
├── README.md
├── PLAN_DE_CONSTRUCCION.md          # plan maestro de fases
├── docs/
│   ├── BRIEF_BLOQUE_1.md            # detalle del área de finanzas
│   ├── BRIEF_BLOQUE_2.md            # detalle del área de asistencia
│   └── decisiones.md                # registro de decisiones de diseño
│
├── backend/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   ├── .env.example                 # plantilla; el .env real no se commitea
│   │
│   ├── prisma/
│   │   ├── schema.prisma            # esquema único de toda la app
│   │   ├── seed.ts
│   │   └── migrations/             # incluye el SQL manual: vista,
│   │                                # índice parcial, revoke
│   │
│   ├── src/
│   │   ├── app.ts                   # bootstrap Fastify, registro de rutas
│   │   ├── server.ts                # arranque del servidor
│   │   │
│   │   ├── core/                    # núcleo transversal (Fase 0)
│   │   │   ├── auth/                # JWT, refresh, middleware, roles
│   │   │   ├── prisma.ts            # cliente Prisma compartido
│   │   │   └── errors.ts            # errores de dominio comunes
│   │   │
│   │   ├── shared/                  # lógica usada por ambas áreas
│   │   │   ├── services/
│   │   │   │   └── correccion.service.ts   # corrección genérica
│   │   │   └── repositories/
│   │   │       └── auditoria.repository.ts # auditoría append-only
│   │   │
│   │   ├── finanzas/                # ÁREA DE FINANZAS (Fases 1-3)
│   │   │   ├── cuentas-por-pagar/   # Fase 1
│   │   │   │   ├── cuentas-por-pagar.routes.ts
│   │   │   │   └── cuentas-por-pagar.service.ts
│   │   │   ├── gastos/              # Fase 2
│   │   │   │   ├── gastos.routes.ts
│   │   │   │   └── gastos.service.ts
│   │   │   └── dashboard/           # Fase 3
│   │   │       ├── dashboard.routes.ts
│   │   │       └── dashboard.service.ts
│   │   │
│   │   └── asistencia/              # ÁREA DE ASISTENCIA (Fases 4-6)
│   │       ├── fichaje/             # Fase 4
│   │       │   ├── fichaje.routes.ts
│   │       │   └── fichaje.service.ts
│   │       ├── jornada/             # Fase 5
│   │       │   ├── jornada.routes.ts
│   │       │   ├── jornada.service.ts      # motor de jornada
│   │       │   └── jobs/
│   │       │       └── huerfanos.job.ts    # barrido nocturno
│   │       └── cobro/               # Fase 6
│   │           ├── cobro.routes.ts
│   │           └── cobro.service.ts
│   │
│   └── test/
│       ├── global-setup.ts          # Postgres efímero (Testcontainers)
│       ├── finanzas/
│       │   └── correccion.test.ts
│       └── asistencia/
│
└── frontend/
    ├── package.json
    ├── tsconfig.json
    ├── vite.config.ts
    ├── index.html
    │
    └── src/
        ├── main.tsx
        ├── App.tsx
        │
        ├── core/                    # transversal del frontend
        │   ├── auth/                # login, contexto de sesión, guard
        │   ├── api/                 # cliente HTTP hacia el backend
        │   └── ui/                  # componentes base reutilizables
        │
        ├── finanzas/                # ÁREA DE FINANZAS
        │   ├── cuentas-por-pagar/
        │   ├── gastos/
        │   └── dashboard/
        │
        └── asistencia/              # ÁREA DE ASISTENCIA
            ├── kiosco/              # pantalla de fichaje
            ├── jornada/             # consulta de horas, correcciones
            └── cobro/               # solicitudes de cobro, saldo
```

---

## Qué va en cada carpeta clave

**`backend/src/core/`** — Lo que existe desde la Fase 0 y no pertenece a
ninguna área: autenticación, cliente Prisma, errores comunes. Si finanzas y
asistencia desaparecieran, esto seguiría siendo necesario.

**`backend/src/shared/`** — Lógica de negocio que ambas áreas usan. El
servicio de corrección y el repositorio de auditoría viven aquí: nacieron en
la Fase 1 pero los consumen también las jornadas y los cobros. No es "de
finanzas" aunque se construya primero.

**`backend/src/finanzas/` y `asistencia/`** — Cada área, dividida por módulo.
Cada módulo agrupa su ruta y su servicio. Un módulo es una unidad entregable
— se corresponde con una fase del plan.

**`prisma/schema.prisma`** — UNO solo para toda la app. Las entidades de
finanzas y de asistencia conviven; el núcleo (`Sede`, `Usuario`,
`Auditoria`) está arriba. No se divide.

**`frontend/src/`** — Espeja al backend: `core/` transversal, y luego
`finanzas/` y `asistencia/` por feature. Cada carpeta de feature contiene sus
pantallas y componentes propios.

**`docs/decisiones.md`** — Registro vivo de las decisiones de diseño cerradas
(inmutabilidad, saldo en dinero, % cobrable único, etc.). Evita rediscutir lo
ya resuelto.

---

## Orden de llenado por fase

| Fase | Carpetas que se crean / llenan |
|------|--------------------------------|
| 0 | `backend/` base, `core/`, `prisma/` (núcleo), `frontend/` base, `core/` |
| 1 | `finanzas/cuentas-por-pagar/`, `shared/` (corrección, auditoría) |
| 2 | `finanzas/gastos/` |
| 3 | `finanzas/dashboard/` |
| 4 | `asistencia/fichaje/` |
| 5 | `asistencia/jornada/` + `jobs/` |
| 6 | `asistencia/cobro/` |

Toda la estructura se crea de una vez al inicio (carpetas vacías para las
fases futuras); el código entra fase por fase según el plan.

---

## Nota sobre los archivos ya escritos

Los archivos de código del área de finanzas ya entregados se ubican así:

- `schema.prisma` → `backend/prisma/schema.prisma`
- `correccion.service.ts` → `backend/src/shared/services/`
- `auditoria.repository.ts` → `backend/src/shared/repositories/`
- `dashboard.service.ts` → `backend/src/finanzas/dashboard/`
- `cuentas-por-pagar.routes.ts` → `backend/src/finanzas/cuentas-por-pagar/`
- `dashboard.routes.ts` → `backend/src/finanzas/dashboard/`
- `correccion.test.ts` → `backend/test/finanzas/`
- `global-setup.ts` → `backend/test/`
- `vitest.config.ts` → `backend/`
- `seed.ts` → `backend/prisma/`
- `migracion_complementaria.sql` → se integra en `backend/prisma/migrations/`

Esta ubicación es ligeramente distinta a la que indicaban los briefs (que
asumían `src/services/` plano). Prevalece esta: separa núcleo, compartido y
áreas, que es lo correcto para una app unificada. Ajustar los imports al
mover los archivos.
```
