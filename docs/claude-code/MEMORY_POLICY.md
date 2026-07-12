# Claude Code — política de memoria en GestorPro

Verificado contra el binario instalado (`@anthropic-ai/claude-code@2.1.207`)
extrayendo cadenas reales, no por memoria. No se inventó ninguna ruta ni
límite.

## Qué existe realmente en 2.1.207

No hay un `MEMORY.md` de proyecto que Claude Code cargue automáticamente al
abrir una sesión en este repo — a diferencia de `CLAUDE.md`, que sí es
auto-cargado ("Drop a [CLAUDE.md] file in your repo and Claude reads it").

Lo que sí existe y ya está activo:

1. **Auto-memory de usuario** (lo que este agente ya usa): un directorio
   `MEMORY.md` + archivos temáticos bajo
   `~/.claude/projects/<cwd-saneado>/memory/` — **fuera del repositorio
   git**, aislado por ruta absoluta del proyecto en el equipo de Jim, no
   versionado, no compartido entre máquinas. Confirmado en el binario:
   constante `MEMORY.md` con truncado a **200 líneas** en el índice y un
   límite de tamaño de **~25000** por archivo cargado. Ya trae su propia
   regla de no-duplicación con `CLAUDE.md` ("Anything already documented in
   CLAUDE.md files" está en la lista de qué NO guardar).
2. **Memoria por agente** (`.claude/agents/*.md` con frontmatter
   `memory: project` → `.claude/agent-memory/<agentType>/`, o
   `memory: local` → `.claude/agent-memory-local/<agentType>/`) — mecanismo
   real y confirmado, pero es almacenamiento de scratch/estado propio de UN
   agente concreto, opt-in por archivo de definición. Ninguno de los 8
   reviewers de `.claude/agents/` lo declara: son de solo lectura,
   diseñados para responder de forma independiente en cada invocación —
   darles memoria entre corridas iría contra su propósito adversarial
   (contaminaría la revisión siguiente con conclusiones de la anterior) y
   no hay un caso de uso identificado que lo justifique.

## Decisión: no se crea ningún archivo de memoria de proyecto en este P2

No existe una estructura de "memoria de proyecto versionada en git" que
2.1.207 cargue automáticamente — inventar una (p. ej. un `docs/MEMORY.md`
que nadie carga solo) daría una falsa sensación de persistencia. Se
documenta la política, no se crea ningún directorio.

## Dónde va cada tipo de hecho

- **Reglas permanentes que aplican siempre** → `CLAUDE.md` (global o de
  proyecto). Si algo aprendido en una tarea es una regla de largo plazo, se
  propone para `CLAUDE.md` explícitamente — no se asume que "quedará
  recordado" solo por haberlo mencionado.
- **Estado temporal de UNA tarea concreta** (qué archivos están en juego,
  en qué fase va, qué falta probar) → `docs/tasks/<slug>.md` (ver
  `docs/tasks/README.md`). Vive mientras la tarea está abierta; se archiva
  al cerrarla.
- **Experiencia técnica ya verificada y establemente cierta** (no ligada a
  una tarea puntual: un gotcha de entorno, un patrón de bug que se repite,
  una decisión de arquitectura ya cerrada) → memoria temática del sistema
  de auto-memory de usuario (punto 1 arriba). Esto YA está en uso — este
  documento no lo reemplaza, solo aclara que es la única capa de "memoria"
  que Claude Code carga automáticamente entre sesiones para trabajo
  general (no scoped a un agente).

## Prohibido guardar en cualquier capa de memoria

- Tokens, API keys, credenciales de producción, contenido de `.env`,
  secretos de cualquier tipo.
- Hash de commit o estado de `COMMITTED`/`PUSHED`/`DEPLOYED` de una tarea
  concreta — eso es estado de corto plazo, vive en el task doc mientras la
  tarea está abierta y en `git log` después; una memoria que lo repite
  queda obsoleta en el próximo commit y miente.
- IP o dominio de producción como si fuera un dato nuevo a recordar — ya
  está en `CLAUDE.md`; repetirlo en memoria es duplicación, no información
  nueva.

## Resultado de este P2

**Ningún archivo nuevo de memoria.** La política de arriba es la entrega;
no había una estructura real de "project Memory" en 2.1.207 que crear.
