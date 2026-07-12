# Claude Code — seguridad de la configuración de proyecto

Formato verificado contra el binario instalado `@anthropic-ai/claude-code@2.1.207`
(`tool_name`, `tool_input.command`, `hookSpecificOutput.{hookEventName,
permissionDecision,permissionDecisionReason}`, `permissions.{allow,deny,ask}`
con reglas `Tool(patrón)`, matcher de hook con tool names separados por `|`
o `,`, variable `${CLAUDE_PROJECT_DIR}` para rutas de hook). No se
inventó ninguna clave de configuración a partir de memoria.

## Límites allow / ask / deny (`.claude/settings.json`)

**allow** (solo lectura / verificación, no requiere confirmación):
`git status`, `git diff`, `git diff --check`, `git log`,
`git branch --show-current`, `git rev-parse`, `npm test`,
`npm run typecheck`, `npm run build` (Bash y PowerShell).

**ask** (requiere aprobación humana, pero no está bloqueado):
`git push` (sin `--force`), `deploy.sh`, `docker compose up/restart`,
`ssh`, `prisma migrate deploy`.

**deny** (rechazado directamente por `permissions`):
`git push --force/-f`, `git reset --hard`, `git clean -f*`,
`docker compose down`, `prisma migrate reset`, `prisma db push`,
`prisma db seed`, `npm run db:reset`, lectura de `.env*` (excepto
`*.env.*example`), lectura de claves privadas (`id_rsa`, `id_ed25519`,
`*.pem`, `*.ppk`, `*credentials*.json`).

**No bloqueado por diseño**: `git commit` local. Sigue rigiéndose por
`CLAUDE.md` (autónomo tras verificación) y por el hook global
`guard.js`, que sí lo bloquea incondicionalmente vía Bash — ver
"Conflicto conocido" más abajo.

## Qué quedó en el hook (`deploy-guard.js`) y por qué

`permissions.deny` solo puede filtrar por prefijo/ruta del comando, no por
contenido arbitrario. Reglas que dependen de **contenido** del comando
(no solo del prefijo) se implementaron en el hook, no en `settings.json`,
para no escribir configuración inválida o que dé falsa sensación de
cobertura:

- `DROP DATABASE|TABLE`, `TRUNCATE` — puede aparecer dentro de un `-c "..."`
  de `psql`, con cualquier prefijo (`docker exec ... psql ...`); un patrón
  de prefijo no lo captura.
- Borrado de `deploy/backups/**` o `prisma/migrations/**` — el verbo
  (`rm`, `del`, `Remove-Item`) y la ruta pueden estar en cualquier
  posición del comando.
- Lectura de `.env`/claves vía `cat`/`type`/`Get-Content`/alias — mismo
  problema: el verbo y el argumento no están en una posición fija.

El hook cubre ambos tools (`Bash` y `PowerShell`, matcher `Bash|PowerShell`),
normaliza saltos de línea y espacios repetidos antes de matchear, y
reconoce alias de PowerShell (`del`→Remove-Item, `cat`/`type`/`gc`→
Get-Content) mediante alternancia de regex (no una pasada de normalización
separada — más simple y con la misma cobertura).

Todas las reglas de bloqueo llevan un código (`P0-XXX`) que aparece en
`permissionDecisionReason`; el hook nunca imprime el comando completo
(evita filtrar contenido sensible en logs).

## Política de fallo: FAIL-CLOSED (corregido en P0.1)

La primera versión de `deploy-guard.js` fallaba abierto (permitía el
comando) si el JSON de entrada no se podía parsear o si faltaban campos.
Una revisión adversarial (P0.1) encontró que esto era una vía de bypass:
cualquier input malformado —intencional o por un bug del propio Claude
Code— habría saltado el hook sin dejar rastro. Se corrigió a
**fail-closed**: cualquier input que no se pueda parsear o validar por
completo se **deniega** (`P0-HOOK-INPUT`), incluyendo JSON inválido,
input vacío, `{}`, `tool_input` ausente, `tool_input.command` ausente,
`null`, array, o cadena vacía. La única vía de "permitir sin escrutinio"
es un `tool_name` explícito y distinto de `Bash`/`PowerShell` (fuera del
alcance de este hook por diseño, no una vía de fallo).

Esto es intencionalmente distinto del hook **global** `guard.js`, que sí
falla abierto ante input no parseable ("读不到输入就放行"). No se tocó
`guard.js` (fuera del alcance permitido); la política de este hook de
proyecto es más estricta porque protege reglas que `guard.js` no cubre
(producción, backups, migraciones).

## Conflicto conocido (no resuelto en este P0)

El hook **global** `~/.claude/hooks/guard.js` bloquea *todo* `git commit`
ejecutado vía el tool Bash, mientras que `CLAUDE.md` (global y de
proyecto) dice que el commit es autónomo tras verificación. En la
práctica el bloqueo global solo aplica al tool Bash: commits hechos vía
el tool PowerShell no pasan por ese hook. Esta configuración de proyecto
**no toca** `~/.claude/hooks/guard.js` (fuera del alcance permitido) ni
intenta reproducir/anular esa regla. Queda como pendiente de decisión de
Jim: si se quiere permitir `git commit` vía Bash sin pasar por PowerShell,
hay que tocar el hook global, no este.

## Riesgo detectado, no gestionado en este P0

`~/.claude/github apikey.txt`: archivo en texto plano en el directorio
global de Claude Code cuyo nombre sugiere que contiene una clave de
GitHub. **No fue leído ni movido** (fuera del alcance de esta tarea y de
las reglas de secretos). Ver auditoría previa para el detalle; requiere
decisión y acción manual de Jim.

## Bugs corregidos en P0.3 (falso positivo + bypass real, ambos con test)

- **Falso positivo de `type`**: `READ_VERBS` matchea con `\b` (límite de
  palabra), y `-type` (flag de `find`) o `--expose-gc` (flag de `node`)
  también cumplen un límite de palabra justo antes de `type`/`gc` — el hook
  leía `find . -type f` como si fuera el comando Windows `type`. Corregido
  con un lookbehind negativo `(?<!-)` antes del verbo: una flag siempre
  tiene un `-` pegado justo antes de la palabra, un verbo de comando real
  nunca lo tiene ahí. Se revisaron `cat`/`get-content`/`gc` por el mismo
  patrón (aplicado uniformemente a `READ_VERBS` y `DELETE_VERBS`); el caso
  real encontrado fue `gc` colisionando con `--expose-gc`.
- **Bypass real — borrado del directorio padre**: `deploy[/\\]backups` y
  `prisma[/\\]migrations` solo matcheaban si esas dos rutas completas
  aparecían literalmente en el comando o el `cwd`. `rm -r deploy` o
  `Remove-Item -Recurse prisma` borran el directorio padre completo
  (arrastrando `backups`/`migrations` con él) sin que el texto del comando
  contenga nunca el substring protegido — el hook los dejaba pasar.
  Corregido: cuando el comando tiene semántica recursiva/de directorio
  (`-r`/`-rf` de Unix con `r` en el cluster de flags, `-Recurse` de
  PowerShell, `/s` de `rmdir`/`rd`), se extraen los argumentos que no son
  flags ni el propio verbo, se resuelven contra `cwd` (`path.posix.normalize`,
  solo léxico, sin tocar el filesystem) y se compara el último segmento
  resuelto contra `deploy`/`prisma` (o los dos últimos contra la ruta
  completa). Cubre ruta relativa, absoluta (Windows y Unix), y `..` parado
  dentro del directorio protegido. El borrado no recursivo de un directorio
  a secas (`Remove-Item deploy` sin `-Recurse`) sigue sin bloquearse a
  propósito: en el filesystem real falla solo si el directorio no está
  vacío, así que no hace falta la red de seguridad ahí.

## Formas de bypass revisadas en P0.1 (todas cerradas y con test)

- Mayúsculas/minúsculas mezcladas (`GiT PuSh --FORCE`) — ya cubierto por
  el flag `/i` de cada regex.
- Espacios y saltos de línea múltiples — normalización previa
  (`replace(/\s+/g," ")`) ya lo cubría; se agregó test explícito.
- Prefijo `&` (call operator de PowerShell) — el matching es por
  substring, no ancla al inicio del comando; ya cubierto, con test.
- Sub-shell (`powershell -Command "..."`, `cmd /c "..."`) — el patrón
  matchea el comando peligroso embebido sin importar el wrapper; ya
  cubierto, con test.
- Alias de Windows (`npm.cmd`, `npx.cmd`) — los patrones no anclan al
  inicio del comando, matchean igual; ya cubierto, con test.
- Separador de ruta Windows vs Unix (`deploy\backups` vs `deploy/backups`,
  `prisma\migrations` vs `prisma/migrations`) — ya cubierto con `[\/\\]`
  en las regex; con test para ambos.
- Backtick de PowerShell partiendo una palabra clave (`` Rem`ove-Item ``)
  — **bypass real, corregido**: se agregó strip de backticks antes de
  matchear (`normalize()`).
- `-EncodedCommand`/`-enc <base64 UTF-16LE>` — **bypass real, corregido**:
  se detecta cualquier abreviatura de `-EncodedCommand` seguida de un
  blob base64, se decodifica como UTF-16LE (formato que usa PowerShell) y
  se vuelve a evaluar el texto decodificado con las mismas reglas.
- Ruta relativa corta cuando `cwd` ya está dentro de `deploy/backups` o
  `prisma/migrations` (p. ej. `Remove-Item x.dump` estando parado ahí)
  — **bypass real, corregido**: el hook ahora también revisa el campo
  `cwd` del input (confirmado como campo real del hook de Claude Code),
  no solo el texto del comando.

## Límite fundamental, no resoluble por regex (documentado, no bug)

Un hook basado en coincidencia de texto **no puede** detectar ofuscación
arbitraria de shell: concatenación de variables (`$a='git';$b='push -f';
iex "$a $b"`), construcción de strings por código de carácter, o
`Invoke-Expression`/`eval` sobre contenido ensamblado en tiempo de
ejecución. Esto aplica a cualquier hook de este tipo, no es una omisión
de esta implementación. La autorización real para operaciones de alto
riesgo sigue siendo la confirmación humana exigida por `CLAUDE.md`; este
hook es una red de seguridad adicional, no el único mecanismo de control.

## Hallazgo de despliegue en vivo (P0.1)

Una prueba de montaje real (no solo el harness de test) mostró que un
hook de proyecto **nuevo o modificado** no queda activo en una sesión de
Claude Code ya en curso: hace falta `/hooks` (recarga config) o reiniciar
la sesión — confirmado en el propio binario ("hook is live (or needs
`/hooks`/restart)"). En la sesión actual, `docker compose down` ejecutado
en un repo desechable **no fue bloqueado** por `deploy-guard.js` (sí lo
habría bloqueado el hook global si hubiera coincidido con sus reglas, que
no es el caso). Esto no es un defecto de la configuración: es
comportamiento documentado de Claude Code. Verificación pendiente: correr
`/hooks` o abrir una sesión nueva con cwd en este worktree y repetir la
prueba.

## Resultados de prueba

`node scripts/claude/test-deploy-guard.js` — 76/76 casos correctos: los
51 casos de la base P0.1/P0.0 (comandos peligrosos + solo-lectura que no
deben bloquearse, 12 formas de bypass revisadas, 8 casos adversariales de
input malformado, 3 casos de bypass vía `cwd`) más 25 casos nuevos de
P0.3 — 6 del falso positivo `type`/`gc` en posición de flag, 15 del
bypass de borrado del directorio padre por texto de comando (9 que deben
bloquearse: relativo, `-rf`, `-Recurse`, `..` embebido, `rmdir /s /q`,
ruta absoluta Windows/Unix; 6 que NO deben bloquearse: lectura/listado de
`deploy`/`prisma`, y nombres parecidos como `deployment`/`deploy_extra`
que no deben matchear por substring) y 4 vía `cwd`+`..` (parado dentro del
directorio protegido).
