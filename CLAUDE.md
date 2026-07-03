# CLAUDE.md — GestorPro

Reglas permanentes para Claude Code en este proyecto. Archivo corto: solo reglas
que aplican siempre. El detalle vive en `docs/` — aquí se apunta, no se repite.
Lo que ya cubre el CLAUDE.md global (git, secretos, frontend, validación) no se
repite aquí. Si hay conflicto con las reglas globales, manda este archivo.

---

## Proyecto

App de administración para retail / distribución en Panamá. Una sola app con dos
áreas: **finanzas** (gastos, cuentas por pagar, ventas diarias, dashboard,
correcciones) y **asistencia** (empleados, fichaje, jornada, horas extra,
salarios), más **auditoría** de operaciones críticas. No es POS ni maneja
inventario: eso lo cubre Firestec (sistema externo).

Stack: Node.js + TypeScript strict + Fastify · Prisma + PostgreSQL · React +
Vite · JWT con refresh · Vitest + Testcontainers.

**PRODUCCIÓN ACTIVA desde 2026-06-25**: VPS `45.77.198.133`, dominio
`gestorpro.us` (HTTPS vía Caddy/Let's Encrypt). Este proyecto ya no es solo dev:
toda operación tiene que considerar que existe un entorno productivo real.

---

## Antes de escribir código

Leer según necesidad (no todo `docs/` en cada tarea):

* `docs/DECISIONES.md` — decisiones de diseño ya cerradas.
* `docs/BRIEF_*.md` — detalle de cada fase / bloque.
* `docs/ESTRUCTURA_DE_CARPETAS.md` — dónde va cada archivo.
* `docs/CONVENCIONES.md` — convenciones de código y proceso.
* `docs/BUGS_PREEXISTENTES.md` — bugs preexistentes conocidos.

Las Fases 0–6 del plan original están completas. Trabajo nuevo se rige por su
BRIEF correspondiente. Las decisiones de `docs/DECISIONES.md` están cerradas:
no reabrirlas sin pedido explícito de Jim.

---

## Idioma

* Código, variables, comentarios, commits y términos del proyecto: **español**.
* Explicaciones y respuestas al usuario: **chino simplificado**.

---

## Dominio

* `cajera` es rol operativo del empleado, no entidad ni permiso del sistema.
* `Usuario.rol` = permiso del sistema; `Empleado.rolesOperativos` = funciones.
* `venta_diaria.cajera` y `cerradoPor` son snapshot string, no foreign key.
* GestorPro empieza desde cero: no importar histórico de clientes.
* Recargos legales (25/50/75/150%) son mínimos fijos por ley panameña: nunca
  configurables, nada puede pagar por debajo del mínimo legal.
* Regla laboral panameña no clara: marcar pendiente legal, no inventar.

---

## Seguridad

* Passwords y PINs siempre hasheados (bcrypt o argon2). Nunca en texto plano.
* Nunca guardar ni loggear password, PIN, token o secreto.
* `usuarioId` sale del JWT (`request.user`), nunca del body.
* Permisos validados siempre en el backend.
* Rutas de plataforma: guard `soloPlataforma` responde 404 (no 403).

---

## Integridad de datos

* Dinero (Gasto, PagoProveedor, VentaDiaria) es inmutable: no editar ni borrar;
  corregir con reverso + corrección. Sin doble corrección ni sobrepago.
* `Auditoria` es append-only. Dinero siempre en `Decimal`, nunca `Float`.
* Aislamiento entre empresas (multi-tenant) es **fail-closed**: una consulta sin
  contexto de tenant da 0 filas o error, NUNCA datos de otra empresa. Frontera
  real = RLS de Postgres bajo el rol `gestorpro_app`; la app NUNCA conecta con
  `gestorpro_migrador` (tiene `BYPASSRLS`). Detalle: `docs/ARQUITECTURA_MULTITENANT.md`.
* `Fichaje` y `Correccion` inmutables; `Jornada` se recalcula desde fichajes.
* Operaciones de dinero, saldos, pagos o correcciones van en transacción.
* Migrations: nunca editar una ya aplicada; cambios estructurales en migration
  nueva (additive). Seed idempotente y datos demo separados de los reales.
* **Operación nivel-hierro = verificar TODOS los entornos reales ANTES de actuar.**
  Antes de cualquier operación que pueda afectar un entorno persistente —editar una
  migración ya aplicada, cambiar privilegios/atributos de rol, drop/rename/truncate,
  o cualquier cosa irreversible— hay que **confirmar el estado real de TODOS los
  despliegues** (producción en VPS `45.77.198.133` y cualquier entorno futuro,
  no solo dev + Testcontainers), sin omitir ninguno. NUNCA asumir "ese entorno no
  lo tiene aplicado" sin haberlo comprobado. Precedente (2026-06-22): se editó la
  migración aplicada `20260523224500` sobre la premisa FALSA de que no había
  entorno durable; el VPS sí la tenía aplicada, y el cambio habría roto su
  `migrate deploy` por checksum. La verificación va PRIMERO, no después.

---

## Producción y despliegue

* Toda operación que toque el VPS (ssh, scp, deploy, migración remota, cambio de
  Caddy/systemd/ufw/DNS) requiere confirmación de Jim ANTES, sin excepción.
* Desplegar solo vía `deploy.sh`; nunca migrar producción a mano.
* `CONFIRMAR_SIN_BACKUP=1` (escape del check de backup) NUNCA se usa por decisión
  propia: solo si Jim lo ordena explícitamente en esa operación concreta.
* Ante duda sobre a qué entorno apunta una operación, tratar como producción.

---

## Calidad

* TypeScript strict; evitar `any` (justificar si se usa).
* Errores explícitos en rutas y servicios; nada de fallos silenciosos.
* Separar responsabilidades entre rutas y servicios; modular y DRY.
* Tests para la lógica crítica (dinero, correcciones, sobrepago, permisos,
  jornada, recargos, dashboard); corren contra PostgreSQL real (Testcontainers).
* No ignorar tests fallidos ni debilitar el negocio para pasarlos.

---

## Git

* `git commit` autónomo al terminar una tarea verificada (un commit, un tema;
  mensaje en español).
* Commits que tocan dinero, permisos o esquema de base de datos: correr el
  subagente `revisor` (`.claude/agents/revisor.md`) ANTES de commitear.
* `git push`: pedir aprobación una vez por tarea; con "puedes pushear libre en
  esta tarea" no se vuelve a preguntar dentro de la misma tarea.

---

## Entorno

* **Mac mini M4 (principal)**: shell zsh/bash, comandos Unix.
* **Windows (secundario)**: PowerShell 7, no comandos bash/Linux.
* Detectar el SO antes de asumir sintaxis de shell.

---

## Agent skills

* Revisor pre-commit (adversarial): `.claude/agents/revisor.md`.
* Issue tracker (issues markdown en `.scratch/<feature>/`): `docs/agents/issue-tracker.md`.
* Triage labels (5 etiquetas canónicas): `docs/agents/triage-labels.md`.
* Domain docs (convención single-context): `docs/agents/domain.md`.
