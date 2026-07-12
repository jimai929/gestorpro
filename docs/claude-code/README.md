# Claude Code — configuración de GestorPro

Este directorio documenta la configuración de Claude Code específica de
GestorPro. No repite las reglas de `CLAUDE.md` (esas mandan si hay
conflicto); aquí se explica cómo está montada la infraestructura de
permisos/hooks y por qué.

## Dos capas de configuración

1. **Global (`~/.claude/`, fuera de este repo)**: aplica a *todos* los
   proyectos de esta máquina. Incluye `hooks/guard.js` (bloqueo genérico de
   `rm -rf`, `git reset --hard`, `git clean -f`, `git push --force`,
   `prisma migrate reset`, `db:reset`, `DROP`, `TRUNCATE`, y **todo**
   `git commit`) y `agents-policy.md` (disciplina de uso de subagentes).
   Esta capa no se modifica desde este repositorio.
2. **Proyecto (`.claude/` en este repo)**: reglas específicas de GestorPro
   que no tiene sentido aplicar globalmente (rutas de `deploy/backups`,
   `prisma/migrations`, IP de producción, etc.).
   - `.claude/settings.json` — `permissions.allow/ask/deny` + registro del
     hook de proyecto.
   - `.claude/hooks/deploy-guard.js` — bloqueo duro que `permissions.deny`
     no puede expresar con precisión (contenido del comando, no solo
     prefijo/ruta).

Las dos capas se combinan: un comando pasa solo si sobrevive al hook
global **y** al hook de proyecto **y** a las reglas de `permissions`.

## Qué NO cubre esta capa

- Base de datos de producción, VPS, deploy real: siguen prohibidos por
  `CLAUDE.md` (sección "Producción y despliegue"); esta configuración es
  una red de seguridad técnica adicional, no el mecanismo principal de
  autorización (eso sigue siendo pedir confirmación a Jim).
- MCP / plugins: sin cambios en esta fase; ver `MCP_POLICY.md` /
  `PLUGIN_PLAN.md` para el estado y los planes.

Detalle de reglas y matrices de prueba: `SECURITY.md`.

## Skills, agents y task docs (P1)

Sobre la capa de hooks/permisos (P0) se añadió tooling específico de
GestorPro para estructurar el trabajo del día a día:

- **`.claude/skills/gestorpro-*`** — ocho skills de un solo propósito
  (investigar, implementar, revisar, e2e, release, incidente, ui-audit,
  task-close). Frontmatter mínimo confirmado contra el binario instalado
  (`name` + `description`; ver `SECURITY.md` de esta misma carpeta para el
  método de verificación). Cada una documenta cuándo usarse, qué necesita
  de entrada, sus pasos, lo que tiene prohibido, su salida estándar y su
  punto de parada — ninguna copia el `CLAUDE.md` completo.
- **`.claude/agents/`** — `revisor.md` (genérico, preexistente) más ocho
  reviewers especializados: `tenant-security-reviewer`, `finance-reviewer`,
  `e2e-gap-reviewer`, `ux-accessibility-reviewer`, `api-contract-reviewer`,
  `migration-reviewer`, `release-reviewer`, `product-workflow-reviewer`.
  Todos son de solo lectura: `tools: Read, Grep, Glob, Bash` (sin
  `Edit`/`Write`) más `permissionMode: plan` — campo de frontmatter de
  agente confirmado real en el binario instalado (`Agent file ... has
  invalid permissionMode`, enum `acceptEdits|auto|bypassPermissions|
  default|dontAsk|plan`), no documentado por memoria. Ninguno commitea,
  pushea, despliega ni afirma una vulnerabilidad sin evidencia citada
  (archivo:línea).
- **`docs/tasks/`** — plantilla y ciclo de vida (`DRAFT → ... → CLOSED`)
  para hechos temporales de una tarea concreta; lo permanente sigue yendo a
  `CLAUDE.md`, no a un task doc. Ver `docs/tasks/README.md`.
- **`docs/claude-code/WORKFLOW.md`** — el orden fijo en que se usan estas
  piezas (investigar → aprobar → implementar → revisar → tests → aprobar
  commit → commit → aprobar push → push → aprobar deploy → backup/deploy/
  post-check) y dónde está cada punto de parada.
