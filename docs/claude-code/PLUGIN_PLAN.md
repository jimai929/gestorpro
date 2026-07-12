# Claude Code — plan de plugin para GestorPro (futuro, no ejecutado)

Verificado contra el binario instalado (`@anthropic-ai/claude-code@2.1.207`)
extrayendo cadenas reales. No se creó ningún paquete instalable ni se
publicó nada para escribir este documento.

## Estructura real de empaquetado confirmada

- Manifiesto: **`.claude-plugin/plugin.json`** en la raíz del paquete.
- Índice de distribución (si se publica a varios usuarios/equipos):
  **`.claude-plugin/marketplace.json`**.
- El contenido del plugin (skills/agents/hooks) vive en carpetas con el
  mismo nombre que sus equivalentes de proyecto — `skills/`, `agents/`,
  `hooks/` — que un plugin instalado expone igual que si estuvieran en
  `.claude/skills/`, `.claude/agents/`, `.claude/hooks/` del proyecto que
  lo instala.
- Campos de manifiesto reconocidos por el validador del binario (lista
  real extraída, no exhaustiva de significado pero sí de existencia):
  `name`, `description`, `version`, `author`, `homepage`, `repository`,
  `license`, `keywords`, `compatibility`, `tools`, `disallowedTools`.
- Un plugin puede declarar servidores MCP inline o vía un `.mcp.json`
  local dentro del propio paquete (sin descarga de pre-aprobación aparte).

## Qué se empaquetaría (cuando llegue el momento)

Únicamente lo que ya esté estable y en uso real, no borrador:

- Los 8 `gestorpro-*` de `.claude/skills/`.
- `revisor.md` + los 8 `*-reviewer.md` de `.claude/agents/`.
- `deploy-guard.js` (el hook de P0) y su registro en `settings.json` como
  referencia (un plugin no puede forzar hooks en el proyecto que lo
  instala del mismo modo que `.claude/settings.json`; se documentaría cómo
  cablearlo, no se asume que se instala solo).
- La documentación de soporte: `WORKFLOW.md`, `docs/tasks/TEMPLATE.md` y
  `docs/tasks/README.md`, `SECURITY.md`.

## Qué el plugin NUNCA contendría

- Secretos, tokens, credenciales de ningún tipo.
- `settings.local.json` o cualquier configuración personal de una máquina.
- IP o dominio de producción — el destino real del VPS vive en `CLAUDE.md`
  y se queda ahí, fuera del paquete; el plugin referenciaría "el
  `CLAUDE.md` del proyecto que lo instale", nunca un valor hardcodeado.

Esto es la misma regla que ya rige para los propios skills/agents
(`docs/claude-code/README.md`, `MEMORY_POLICY.md`): nada de producción vive
en algo que se distribuye o se reutiliza fuera de este repo.

## Requisitos antes de empaquetar (ninguno cumplido todavía)

1. **Versionado**: decidir esquema semver para el paquete y para cada
   skill/agent dentro de él, independiente del versionado de GestorPro
   como aplicación.
2. **Pruebas**: cada skill/agent debe tener al menos un caso de uso
   verificado en una sesión real (no solo revisión de frontmatter como en
   este P1/P2) antes de considerarse "estable" para empaquetar.
3. **Verificación de instalación/desinstalación**: confirmar que instalar
   el plugin en un proyecto limpio deja los skills/agents utilizables, y
   que desinstalarlo no deja residuos (hooks huérfanos, referencias rotas
   en `settings.json`).

## Estado de este P2

**No se empaqueta. No se instala. No se publica nada.** Este documento es
el plan para cuando (si) se decida hacerlo — no una tarea en curso.
