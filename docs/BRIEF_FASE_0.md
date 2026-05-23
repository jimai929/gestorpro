# GestorPro — Brief de Fase 0 (Fundaciones)

Infraestructura compartida por toda la app. Es lo PRIMERO que se construye,
antes de cualquier funcionalidad de negocio. Al terminar esta fase el
proyecto arranca, la base de datos es migrable y el login funciona — pero
todavía no hay nada de finanzas ni de asistencia.

---

## Stack

Node.js + TypeScript + Fastify · Prisma ORM + PostgreSQL · Frontend React +
Vite · Auth JWT con refresh · Vitest + Testcontainers.

---

## Paso 1 — Entorno de desarrollo

El proyecto se crea hoy en Windows (`C:\Users\jimfe\dev\gestorpro`) y se
migra al Mac cuando esté listo. Git hace esa migración indolora.

En Windows, ahora:
- Node.js LTS, Git, VS Code, PowerShell 7 (ya disponible).
- Docker Desktop (lo necesitan los tests con Testcontainers).
- Generar y guardar: GitHub PAT, Brave Search API key (credenciales
  portables, sirven igual en el Mac).

En el Mac, cuando se migre:
- Homebrew, Node, Git, Claude Code, Docker, los MCPs.
- Remote SSH + Tailscale para usar el laptop Windows como cliente remoto.
- `git clone` del repositorio — el proyecto viaja limpio.

---

## Paso 2 — Scaffold del proyecto

Estructura: ver `ESTRUCTURA_DE_CARPETAS.md`. Crear con el script
`crear-estructura.ps1`.

Backend (`backend/`):
- `npm init`, TypeScript en modo estricto (`strict: true` en tsconfig).
- Fastify como framework HTTP.
- Prisma como ORM.
- Vitest + `@testcontainers/postgresql` para tests.
- Scripts en package.json: `dev`, `build`, `test`, `prisma:migrate`,
  `prisma:seed`.

Frontend (`frontend/`):
- Vite con plantilla React + TypeScript.
- Cliente HTTP hacia el backend en `src/core/api/`.

Configuración base:
- `.gitignore` y `.env.example` en su sitio (ver archivos del paquete).
- El `.env` real NUNCA se commitea.
- `git init` y primer commit con el esqueleto.

---

## Paso 3 — Núcleo de datos

Las tres entidades transversales, en el `schema.prisma`. Las usan tanto
finanzas como asistencia.

- `Sede` — id, nombre, activo, creadoEn. Gana el campo `modoExcepcion`
  (`pin | supervisor | ambos`) que usará la asistencia; en Fase 0 basta con
  declararlo con un valor por defecto.
- `Usuario` — id, nombre, email único, rol, activo, creadoEn. Más los
  campos de credenciales del Paso 4.
- `Auditoria` — bitácora append-only: entidad, entidadId, accion,
  usuarioId, detalle, creadoEn. Ver detalle en `BRIEF_BLOQUE_1.md`.

`Rol` es un enum: `empleado`, `supervisor`, `administrador`.

Migración inicial: `prisma migrate dev --name init`.

---

## Paso 4 — Autenticación

JWT con refresh token. Es infraestructura crítica: la usan todas las rutas
de las dos áreas.

Modelo (campos de `Usuario`):
- `passwordHash` — hash de la contraseña. NUNCA texto plano. Usar bcrypt o
  argon2.
- (El `pinHash` del empleado para fichaje de excepción es del área de
  asistencia, no de aquí — pero sigue el mismo principio: siempre hasheado.)

Flujo:
- `POST /auth/login` — email + contraseña → devuelve access token (vida
  corta, ~15 min) y refresh token (vida larga).
- `POST /auth/refresh` — refresh token válido → nuevo access token.
- `POST /auth/logout` — invalida el refresh token.

Middleware:
- Verifica el access token en cada ruta protegida.
- Pone el usuario autenticado en `request.user` (id, rol).
- TODAS las rutas de negocio leen el usuario de `request.user`, JAMÁS del
  body. Esto cierra el placeholder inseguro que tienen las rutas ya escritas.

Autorización por rol:
- Un guard que restringe rutas según el rol (`empleado`, `supervisor`,
  `administrador`).
- Ejemplo: aprobar un cobro sobre el umbral requiere rol `supervisor` o
  superior.

Reglas de seguridad firmes:
- Contraseñas y PINs SIEMPRE hasheados, nunca en texto plano, nunca en logs.
- El secreto de firma del JWT vive en `.env`, nunca en el código.
- Los tokens no llevan datos sensibles en el payload.

---

## Salida de la Fase 0

- El proyecto arranca (`npm run dev` levanta el backend).
- La base de datos se migra y tiene las tres entidades del núcleo.
- Un usuario puede hacer login y recibir tokens.
- El middleware protege rutas y puebla `request.user`.
- Repositorio Git inicializado con el esqueleto versionado.

Recién aquí se puede empezar la Fase 1 (cuentas por pagar).

---

## Lo que NO se hace en Fase 0

- Nada de cuentas por pagar, gastos, dashboard, fichaje, jornada o cobros.
- No se crean cuentas de usuario desde la app por autoservicio — los
  usuarios los crea un administrador. El registro abierto no aplica a este
  tipo de producto.
