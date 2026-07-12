# Claude Code — política de MCP en GestorPro

Verificado contra el binario instalado (`@anthropic-ai/claude-code@2.1.207`)
y contra el estado real de este equipo. No se instaló ni conectó ningún
servidor MCP para escribir este documento.

## Estado real confirmado

- **Este proyecto no tiene `mcpServers` activos.** `.claude/settings.json`
  del proyecto no declara ninguno (confirmado leyendo el archivo); no existe
  un `.mcp.json` en la raíz del repo.
- **Formato real de configuración de proyecto**: un archivo `.mcp.json` en
  la raíz del repo, con una clave `mcpServers` (objeto). Confirmado por
  cadenas del binario ("List of approved MCP servers from .mcp.json",
  "MCP server already exists in .mcp.json", el propio nombre de archivo
  repetido en los mensajes de error de lectura/escritura). No se creó este
  archivo — no hay servidor que declarar todavía.
- **Sobre "context7/playwright son referencias colgantes en
  `settings.local.json`"**: se buscó esa premisa en `~/.claude/settings.
  local.json` (global) y en cualquier `settings.local.json` de este
  proyecto (no existe uno en el repo). **No se encontró ninguna entrada de
  `context7` ni `playwright`** en `permissions.allow/ask/deny` de ninguno
  de los dos. La única entrada relacionada con MCP en el `settings.local.
  json` global es `mcp__github__get_me` (más `Bash(claude mcp *)`), sin
  relación con context7/playwright. Esta premisa no se confirma en el
  estado real de esta máquina — se deja constancia en vez de asumirla
  cierta; si Jim la vio en otro entorno/momento, se puede repetir la
  búsqueda ahí.

## Postura por defecto: prohibido

Sin excepción hasta que se apruebe explícitamente un servidor concreto para
un uso concreto. No se instala nada por comodidad ni "por si acaso".

## Candidatos futuros permitidos (requieren aprobación individual, uno por uno)

- **GitHub, solo lectura** — issues/PRs/checks sin permisos de escritura en
  `main`.
- **Sentry, solo lectura** — consulta de errores/incidentes, sin acciones
  de resolución automática.
- **Documentación, solo lectura** — consulta de docs externas (framework,
  librería), sin ejecución.
- **Playwright local** — para pruebas E2E en la máquina de desarrollo,
  nunca contra producción (ver `gestorpro-e2e`/`e2e-qa-playwright`, que ya
  cubren esto sin MCP).

Que estén en esta lista no los aprueba: cada uno se evalúa y se activa por
separado, con el alcance de permisos mínimo que el caso de uso real
requiera — no "todo lo que el servidor ofrezca por defecto".

## Prohibido siempre, sin excepción

- Escritura sobre PostgreSQL de producción.
- SSH root al VPS.
- Despliegue automático (`deploy.sh` u equivalente disparado por un MCP).
- Rotación de tokens/secretos.
- Escritura sobre la rama `main` de GitHub.

Si un servidor MCP candidato solo puede ofrecerse con alguno de estos
permisos incluido (todo-o-nada), no se instala — se busca una alternativa
de alcance más chico o se descarta.

## Principio de mínimo privilegio

- Permisos por proyecto, no globales, salvo que el uso sea genuinamente
  transversal a todos los proyectos de la máquina.
- Cada servidor se audita individualmente antes de aprobarse: qué
  permisos pide, qué puede hacer con ellos, qué pasa si se compromete la
  credencial que usa.
- Sin aprobación global de "MCP en general" — la aprobación es siempre de
  un servidor concreto con un alcance concreto.

## Sobre las referencias colgantes de `settings.local.json`

`settings.local.json` (global o de proyecto) es configuración personal —
fuera del alcance de archivos que este P2 puede tocar (`.claude/**` de
este repo no incluye `settings.local.json`, que además está en
`.gitignore`). Recomendación para Jim, sin ejecutarla aquí: si en algún
momento aparecen entradas de `context7`/`playwright` (u otro servidor) en
un `settings.local.json` sin que el servidor correspondiente esté
configurado en `.mcp.json`/`mcpServers`, son permisos huérfanos — no hacen
daño por sí solos (no habilitan un servidor que no existe), pero conviene
limpiarlos para que el archivo refleje solo lo que realmente está en uso.
