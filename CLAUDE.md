# CLAUDE.md — GestorPro

Reglas permanentes para Claude Code en este proyecto. Archivo corto: solo reglas
que aplican siempre. El detalle vive en `docs/` — aquí se apunta, no se repite.
Si hay conflicto con las reglas globales, manda este archivo.

---

## Proyecto

App de administración para retail / distribución en Panamá. Una sola app con dos
áreas: **finanzas** (gastos, cuentas por pagar, ventas diarias, dashboard,
correcciones) y **asistencia** (empleados, fichaje, jornada, horas extra,
salarios), más **auditoría** de operaciones críticas. No es POS ni maneja
inventario: eso lo cubre Firestec (sistema externo).

Stack: Node.js + TypeScript strict + Fastify · Prisma + PostgreSQL · React +
Vite · JWT con refresh · Vitest + Testcontainers.

---

## Antes de escribir código

Leer según necesidad (no todo `docs/` en cada tarea):

* `docs/PLAN_DE_CONSTRUCCION.md` — fases y su orden.
* `docs/DECISIONES.md` — decisiones de diseño ya cerradas.
* `docs/BRIEF_*.md` — detalle de cada fase / bloque.
* `docs/ESTRUCTURA_DE_CARPETAS.md` — dónde va cada archivo.
* `docs/CONVENCIONES.md` — convenciones de código y proceso.
* `docs/BUGS_PREEXISTENTES.md` — bugs preexistentes conocidos.

Construir en el orden del plan (Fase 0 → 6); no saltarse fases. Las decisiones de
`docs/DECISIONES.md` están cerradas: no reabrirlas sin pedido explícito de Jim.

---

## Idioma

* Código, variables, comentarios, commits y términos del proyecto: **español**.
* Explicaciones y respuestas al usuario: **chino simplificado**.

---

## Trabajo

Avanzar por defecto: hacer lo de bajo riesgo, preguntar solo lo de alto riesgo.

* Leer solo lo necesario; cambios pequeños, diff pequeño.
* No refactorizar ni reformatear código no relacionado.
* No inventar modelos, rutas, reglas de negocio, env vars ni dependencias.
* Problema fuera de alcance: anotarlo y seguir.
* Tarea grande o decisión de arquitectura: proponer un plan breve primero.

Pedir confirmación (alto riesgo): `git commit`, `git push`, instalar
dependencias, cambiar de stack, refactor grande, y toda operación con riesgo de
pérdida de datos (`db:reset`, `prisma migrate reset`, drop, truncate, rename o
eliminación de tabla/columna, modificar migration aplicada, borrar datos reales).

---

## Dominio

* `cajera` es rol operativo del empleado, no entidad ni permiso del sistema.
* `Usuario.rol` = permiso del sistema; `Empleado.rolesOperativos` = funciones.
* `venta_diaria.cajera` y `cerradoPor` son snapshot string, no foreign key.
* GestorPro empieza desde cero: no importar histórico de clientes.

---

## Seguridad

* Passwords y PINs siempre hasheados (bcrypt o argon2). Nunca en texto plano.
* Nunca guardar ni loggear password, PIN, token o secreto.
* `usuarioId` sale del JWT (`request.user`), nunca del body.
* `.env` nunca se commitea; permisos validados siempre en el backend.
* Recargos legales (25/50/75/150%) son mínimos fijos: nada puede pagar por
  debajo del mínimo legal.

---

## Integridad de datos

* Dinero (Gasto, PagoProveedor, VentaDiaria) es inmutable: no editar ni borrar;
  corregir con reverso + corrección. Sin doble corrección ni sobrepago.
* `Auditoria` es append-only. Dinero siempre en `Decimal`, nunca `Float`.
* `Fichaje` y `Correccion` inmutables; `Jornada` se recalcula desde fichajes.
* Operaciones de dinero, saldos, pagos o correcciones van en transacción.
* Migrations: nunca editar una ya aplicada; cambios estructurales en migration
  nueva (additive). Seed idempotente y datos demo separados de los reales.
* Regla laboral panameña no clara: marcar pendiente legal, no inventar.

---

## Calidad

* TypeScript strict; evitar `any` (justificar si se usa).
* Errores explícitos en rutas y servicios; nada de fallos silenciosos.
* Separar responsabilidades entre rutas y servicios; modular y DRY.
* No mezclar feature + fix + refactor + test.
* Tests para la lógica crítica (dinero, correcciones, sobrepago, permisos,
  jornada, recargos, dashboard); corren contra PostgreSQL real (Testcontainers).
* No ignorar tests fallidos ni debilitar el negocio para pasarlos.
* Revisar `package.json` antes de inventar comandos; si no se validó, decirlo.

---

## Frontend

Mutaciones `POST/PUT/DELETE`: capturar y mostrar el error en UI; no cerrar el
modal ni redirigir antes del éxito real; mostrar loading. Primero versión usable.

---

## Git

* No commit ni push sin aprobación explícita de Jim. Un commit, un tema.
* No commitear `.env`, secretos, logs, temporales ni scratch.

---

## Entorno

Desarrollo en Windows: usar **PowerShell 7**, no comandos bash/Linux.

---

## Agent skills

* Issue tracker (issues markdown en `.scratch/<feature>/`): `docs/agents/issue-tracker.md`.
* Triage labels (5 etiquetas canónicas): `docs/agents/triage-labels.md`.
* Domain docs (convención single-context): `docs/agents/domain.md`.
