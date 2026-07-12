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

## Bug corregido en P0.4 (falso positivo, con test)

- **`READ_VERBS` contra la referencia git `HEAD`**: el guardado `(?<!-)`
  de P0.3 solo excluía un verbo pegado a un guion (flag). No cubría el caso
  real encontrado en uso: `head` (case-insensitive) matchea la palabra
  `HEAD` de Git en cualquier posición — `git show HEAD`, `git diff
  HEAD~1..HEAD`, `git rev-parse HEAD`, `git log HEAD --oneline` — sin que
  haya ningún guion delante. Si el mismo comando (o el texto de búsqueda de
  un `grep`) mencionaba de paso `.env`/`apikey`/`secret`, el hook los
  denegaba con `P0-ENV`/`P0-SECRET` aunque no hubiera ninguna lectura real.
  **No se corrigió especial-caseando la palabra `HEAD`** (eso solo movería
  el mismo bug a la siguiente palabra que colisione) — se corrigió la causa
  general: un verbo de lectura solo cuenta si está en **posición de
  verbo**, la primera palabra de su cláusula de comando
  (`isCommandVerbPosition()` en `deploy-guard.js`). "Posición de verbo" es
  inicio de string, justo después de un separador (`;`, `&`, `|`, `(`), o
  justo después de una comilla que se **acaba de abrir** — y solo cuenta
  como apertura real de sub-shell si lo que precede a esa comilla es a su
  vez inicio de cláusula o una flag de sub-shell conocida (`/c`, `/k`,
  `-Command`, `-c`, `-EncodedCommand`); una comilla de **cierre** (`git
  grep "secret" HEAD`) o una comilla de apertura de un argumento de texto
  plano sin sub-shell detrás (`git commit -m "cat pictures"`, `echo "less
  is more"`) no cuentan. Esto también resuelve, como efecto del mismo
  mecanismo (no como parche aparte), el caso ya cubierto en P0.3
  (`find -type`, `--expose-gc`) y añade cobertura nueva: `docker logs
  --tail 50` (`tail` como nombre de una flag real de Docker, no el comando
  Unix `tail`) ya no se bloquea.

**Dos regresiones encontradas y cerradas en la misma revisión (ambas por
`release-reviewer`, en dos pasadas, antes de comitear)**: la primera
versión del fix de arriba exigía que el verbo fuera la primera palabra
LITERAL de su cláusula, lo que rompía la detección cuando el verbo va
detrás de un comando "transparente" que sí lo ejecuta como subproceso
real: `sudo cat .env`, `env cat .env`, `timeout 5 cat .env`, `nohup cat
.env`, `watch cat .env`, `echo .env | xargs cat`, `find . -name .env
-exec cat {} +` dejaban de bloquearse (comprobado comparando el
resultado del hook antes/después del fix contra los mismos strings).
Corregido con `isAfterTransparentWrapperChain()`: retrocede token por
token desde el candidato mientras solo encuentre wrappers conocidos
(`sudo`, `doas`, `env`, `nohup`, `watch`, `xargs`, `command`, `exec`,
`timeout`), sus propias flags, un argumento de duración (`timeout 30s`)
o de asignación (`env FOO=bar`), o `find -exec`/`-execdir`; si llega así
hasta un separador real o el inicio del comando, el verbo cuenta como
real. También perdona un token suelto cuando va precedido de una flag
(`sudo -u jim cat .env` — `jim` es el valor de `-u`).

La primera implementación de ese último punto limitaba el perdón a **una
sola vez por cadena** (una bandera booleana consumida al primer uso). La
segunda pasada de `release-reviewer` encontró que eso mismo era otra
regresión: `sudo`/`env`/`doas` admiten varias flags con valor propio
(`-u USER -g GROUP`), y en cuanto aparecía una SEGUNDA flag-con-valor
antes del verbo real, el perdón ya gastado cortaba la cadena y el hook
dejaba pasar la lectura (`sudo -u jim -g jim cat .env` no se bloqueaba).
Corregido quitando el límite de "una sola vez": el emparejamiento
token-suelto+flag-inmediata-a-su-izquierda se repite tantas veces como
haga falta, porque cada ocurrencia se valida por su cuenta contra su
propia flag — no hacía falta ningún contador para seguir excluyendo `git
show HEAD` (ahí "show" nunca tiene una flag inmediatamente a su
izquierda, así que el emparejamiento falla solo, sin necesitar un límite
artificial). Con test para los 9 casos originales que la primera
regresión dejaba pasar, 3 casos de la segunda (dos y tres flags-con-valor
seguidas), y 2 negativos (`watch git status`, `env FOO=bar npm test`, que
no deben bloquearse por no tener ningún verbo de lectura real detrás).

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

## Límite conocido, aceptado sin fix (MEDIUM, hallado en la 3ª pasada de P0.4)

La 3ª pasada de `release-reviewer` sobre el fix de wrappers transparentes
encontró un falso positivo por SOBRE-bloqueo (nunca un bypass): un
comando compuesto como `docker exec -u jim -i miContenedor cat README.md
&& git commit -m "update .env docs"` se deniega con `P0-ENV` aunque no
lee ningún `.env` real — solo lee `README.md` dentro del contenedor; el
`.env` es texto no relacionado en el mensaje de commit de una cláusula
posterior. Causa: (a) `exec` está en `TRANSPARENT_WRAPPERS` (para el
builtin de shell `exec`) y coincide por accidente con el subcomando
`docker exec`/`kubectl exec`; (b) el emparejamiento flag+valor sin límite
(cierre de la 2ª regresión, arriba) puede atravesar dos saltos
(`-u jim`, `-i miContenedor`) hasta llegar a esa palabra; (c) el chequeo
de `.env`/secreto ya buscaba en todo el comando aplanado, no solo cerca
del verbo (límite preexistente desde P0.1, no de esta pasada).

**No se corrige en P0.4.** La dirección del error es siempre hacia
bloquear de más, nunca hacia dejar pasar algo peligroso — consistente con
la política fail-closed que este hook declara como intencional. Intentar
cerrar este caso concreto (p. ej. sacando `exec` de `TRANSPARENT_WRAPPERS`
o acotando el chequeo de secretos a una ventana alrededor del verbo)
arriesga abrir una cuarta regresión en un mecanismo que ya pasó por dos
rondas de hallazgos reales; el costo de la fricción ocasional (un
`docker exec`/`kubectl exec` con 2+ flags que además mencione `.env` en
otra cláusula del mismo comando compuesto) es menor que el riesgo de
seguir iterando sin una razón de negocio que lo pida. Si esto genera
fricción real en uso, es una tarea aparte, no un P0.4.4.

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

`node scripts/claude/test-deploy-guard.js` — 118/118 casos correctos: los
76 casos de P0.1-P0.3 (ver desglose en la versión anterior de esta
sección, en el historial de git) más 25 casos de la primera pasada de
P0.4 — 13 que NO deben bloquearse (`git show/diff/rev-parse/log` con
`HEAD`, `HEAD~1..HEAD`, un `grep`/`git grep` cuyo patrón de búsqueda o
mensaje de commit menciona `apikey`/`secret`/`HEAD` sin ningún verbo de
lectura real, mayúsculas/minúsculas mixtas en la referencia, `docker logs
--tail`, una palabra de `READ_VERB_WORDS` pegada a una comilla de
apertura que NO abre un sub-shell) y 12 que SÍ deben seguir bloqueándose
(`head`/`tail`/`cat`/`gc` reales al inicio de cláusula o tras `;`/`&&`,
`powershell -Command`/`-c`, `bash -c`/`sh -c`, verbo en mayúsculas puras,
lectura de `id_rsa`) — más 17 casos de las dos revisiones adversariales
que cerraron la regresión de wrappers transparentes: 15 que SÍ deben
bloquearse (`sudo`/`env`/`timeout`/`nohup`/`watch`/`xargs`/`find -exec`
envolviendo un verbo real, con cero, una, dos o tres flags/argumentos
propios del wrapper de por medio) y 2 que NO (`watch`/`env` envolviendo
un comando sin ningún verbo de lectura).
