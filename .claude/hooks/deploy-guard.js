#!/usr/bin/env node
// PreToolUse hook (Bash|PowerShell) — bloqueo duro de operaciones destructivas
// especificas de GestorPro que las reglas de permissions.deny no pueden
// expresar con precision (contenido de comando, no solo prefijo/ruta).
// Formato de entrada/output verificado contra el binario instalado de
// claude-code 2.1.207 (tool_name, tool_input.command, hookSpecificOutput).
//
// Politica de fallo: FAIL-CLOSED. Cualquier input que no se pueda parsear
// o validar por completo se deniega (P0-HOOK-INPUT). Solo se permite sin
// escrutinio cuando el tool_name es explicitamente distinto de Bash/PowerShell
// (fuera del alcance de este hook; el matcher de settings.json ya restringe
// la invocacion a esos dos tools, esto es defensa en profundidad).

const path = require("path");

let raw = "";
process.stdin.on("data", (c) => (raw += c));
process.stdin.on("end", () => {
  let input;
  try {
    input = JSON.parse(raw);
  } catch {
    return deny("P0-HOOK-INPUT", "input no parseable como JSON");
  }

  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    return deny("P0-HOOK-INPUT", "input no es un objeto JSON");
  }

  const toolName = input.tool_name;
  if (typeof toolName === "string" && toolName.length > 0 && toolName !== "Bash" && toolName !== "PowerShell") {
    process.exit(0); // tool fuera del alcance de este hook (matcher no lo habria invocado)
  }

  const toolInput = input.tool_input;
  if (toolInput === null || typeof toolInput !== "object" || Array.isArray(toolInput)) {
    return deny("P0-HOOK-INPUT", "tool_input ausente o invalido");
  }

  const rawCmd = toolInput.command;
  if (typeof rawCmd !== "string" || rawCmd.length === 0) {
    return deny("P0-HOOK-INPUT", "tool_input.command ausente, no es string o esta vacio");
  }

  // Normaliza saltos de linea, espacios repetidos y backticks (escape de
  // PowerShell usado para partir palabras clave como "Rem`ove-Item").
  const cmd = normalize(rawCmd);
  const cwd = typeof input.cwd === "string" ? input.cwd : "";

  const verdict = evaluate(cmd, cwd);
  if (verdict) return deny(verdict[0], verdict[1]);

  // -EncodedCommand / -enc <base64>: PowerShell decodifica esto como UTF-16LE
  // antes de ejecutar. Un comando peligroso codificado en base64 no matchea
  // ningun patron de texto plano; se decodifica y se vuelve a evaluar.
  const decoded = extractEncodedCommand(cmd);
  if (decoded !== null) {
    const decodedVerdict = evaluate(normalize(decoded), cwd);
    if (decodedVerdict) {
      return deny(decodedVerdict[0], `${decodedVerdict[1]} (dentro de -EncodedCommand)`);
    }
  }

  process.exit(0);
});

function normalize(s) {
  return String(s).replace(/`/g, "").replace(/\s+/g, " ").trim();
}

function extractEncodedCommand(cmd) {
  // Cubre cualquier abreviatura ambigua de -EncodedCommand que PowerShell
  // acepta: -e, -en, -enc, ... -encodedcommand (siempre empieza por "-e"
  // y solo contiene letras hasta el espacio que separa el valor base64).
  const m = /-e[a-z]*\s+([A-Za-z0-9+/=]{16,})/i.exec(cmd);
  if (!m) return null;
  try {
    return Buffer.from(m[1], "base64").toString("utf16le");
  } catch {
    return null;
  }
}

// Verbos de lectura: cubre alias de PowerShell (cat/type/gc -> Get-Content)
// y equivalentes Unix (cat/more/less/head/tail).
//
// P0.4 — un simple lookbehind "no precedido de guion" (P0.3) no basta:
// "git show HEAD", "git diff HEAD~1..HEAD" contienen la palabra "head"
// (case-insensitive) sin ningun guion delante, y no son el comando "head".
// El problema de fondo no es "HEAD" en particular (no se especial-casea
// esa palabra en ningun sitio de este archivo): es que un verbo de lectura
// solo cuenta si esta en POSICION DE VERBO — la primera palabra de su
// clausula de comando — y "HEAD" ahi es el segundo/tercer argumento de
// "git show"/"git diff", no un verbo. Ver isCommandVerbPosition() mas
// abajo, que generaliza esto (tambien cubre find -type, --expose-gc,
// sub-shells, comillas...) en vez de listar excepciones por palabra.
// `strings`/`xxd`/`base64` vuelcan el contenido de un archivo igual que `cat`
// (exfiltracion de .env / claves); se anaden porque su argumento es SIEMPRE un
// archivo, asi que no arrastran falsos positivos de patron de busqueda como
// grep/sed/awk (cuyo primer argumento puede ser el texto ".env" a buscar).
const READ_VERB_WORDS = ["cat", "type", "more", "less", "head", "tail", "get-content", "gc", "strings", "xxd", "base64"];

// Verbos de borrado: alias de PowerShell (del/rmdir/rd -> Remove-Item) y
// Unix (rm). Mismo guardado (?<!-) por consistencia, aunque ninguna flag
// conocida colisiona con estos verbos.
const DELETE_VERBS = /(?<!-)\b(rm|del|remove-item|rmdir|rd)\b/i;

// Directorios protegidos: código, raíz (para el bypass "borra el padre") y
// ruta completa (para el bypass exacto ya cubierto antes de P0.3).
const PROTECTED_DIRS = [
  { code: "P0-BACKUP", root: "deploy", full: ["deploy", "backups"], reason: "deploy/backups" },
  { code: "P0-MIGRATION", root: "prisma", full: ["prisma", "migrations"], reason: "prisma/migrations" },
];

// Nombres de los propios verbos/prefijos de subshell: se descartan como
// candidatos a "ruta a borrar" al extraer argumentos de un comando.
const VERB_WORDS = new Set(["rm", "del", "remove-item", "rmdir", "rd", "cmd", "powershell"]);

function hasRecursiveDeleteSemantics(cmd) {
  if (/--recursive\b/i.test(cmd)) return true;
  // Cluster corto de flags Unix que INCLUYE -r/-R (recursivo), permitiendo
  // que vaya combinado con otras flags cortas de rm (-rf, -fr, -Rfi...).
  // El alfabeto del cluster esta restringido a letras reales de rm/find
  // (r/f/i/v/d) para no confundir con una flag no relacionada que tambien
  // contenga una "r" (p. ej. "-region"); y se exige "r" dentro del cluster
  // -i/-f/-v/-d solos (sin "r") no implican recursividad.
  const unixCluster = /(^|\s)-([rRfFiIvVdD]{1,6})\b/.exec(cmd);
  if (unixCluster && /r/i.test(unixCluster[2])) return true;
  // PowerShell: -Recurse (con posibles sufijos, p. ej. -Recurse:$true).
  if (/-recurse\w*\b/i.test(cmd)) return true;
  // CMD de Windows: rmdir/rd con /s (borrado recursivo de directorio).
  if (/\b(rmdir|rd)\b[\s\S]*\/s\b/i.test(cmd)) return true;
  return false;
}

// Extrae tokens candidatos a "ruta objetivo" de un comando de borrado ya
// confirmado: descarta el propio verbo, flags Unix/PowerShell (-r,
// -Recurse...) y flags cortas de CMD (/s, /q...). No es un parser de shell
// real: es suficiente para detectar el patron "borra deploy o prisma
// enteros", que es lo unico que se necesita aqui.
function extractPathArgs(cmd) {
  return cmd
    .split(" ")
    .map((t) => t.replace(/^["']|["']$/g, ""))
    .filter((t) => t.length > 0)
    .filter((t) => !/^-/.test(t))
    .filter((t) => !/^\/[a-zA-Z]$/.test(t))
    .filter((t) => !VERB_WORDS.has(t.toLowerCase()));
}

// Resuelve un token de ruta (relativo o absoluto, Windows o Unix) contra
// cwd, colapsando "." y ".." solo de forma lexica (path.posix.normalize
// no toca el filesystem real: no hay symlinks que resolver ni riesgo de
// I/O en un hook que debe responder en milisegundos).
function resolveCandidate(token, cwd) {
  const t = token.replace(/\\/g, "/");
  const isAbsolute = /^[a-zA-Z]:\//.test(t) || t.startsWith("/");
  const cwdPosix = typeof cwd === "string" ? cwd.replace(/\\/g, "/") : "";
  const base = isAbsolute ? t : cwdPosix ? `${cwdPosix}/${t}` : t;
  return path.posix.normalize(base).replace(/\/+$/, "");
}

function lastSegments(resolved, count) {
  const parts = resolved.split("/").filter(Boolean);
  return parts.slice(-count).map((p) => p.toLowerCase());
}

// Sufijos que abren un sub-shell/valor de comando: lo que venga justo
// despues SI es una posicion de verbo valida, aunque no sea el inicio
// absoluto del string (cmd /c, cmd /k, powershell -Command, bash/sh -c).
const SUBSHELL_FLAG_SUFFIX = /(^|\s)(\/c|\/k|-c|-command|-encodedcommand)$/i;

// Comandos "transparentes": no leen nada por si mismos, ejecutan como
// subproceso la palabra que viene despues (sudo cat .env SI lee .env,
// igual que cat .env a secas). Si no se reconocen, un verbo real detras
// de uno de estos se leeria como "argumento de otro programa" y el hook
// fallaria ABIERTO — justo el error que se encontro en la revision
// adversarial de P0.4 (sudo/env/timeout/nohup/watch/xargs/find -exec
// dejaban pasar `cat .env` sin bloquear). "command"/"exec" cubren el
// builtin de POSIX shell del mismo nombre.
const TRANSPARENT_WRAPPERS = new Set(["sudo", "doas", "env", "nohup", "watch", "xargs", "command", "exec", "timeout"]);

// -exec/-execdir de `find`: todo lo que sigue hasta el `;`/`+` que cierra
// es un comando nuevo que SI se ejecuta (find . -name .env -exec cat {} +).
const FIND_EXEC_FLAGS = new Set(["-exec", "-execdir"]);

function isWrapperArgToken(token) {
  // Argumento propio de un wrapper transparente que no cambia el verbo
  // real que sigue: duracion de `timeout` (5, 30s, 2m...) o asignacion de
  // variable de `env` (FOO=bar).
  return /^\d+[smhd]?$/i.test(token) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(token);
}

// Retrocede token por token (separados por espacio, ya normalizados a uno
// solo) desde `idx` mientras solo encuentre wrappers transparentes, sus
// propias flags/argumentos, o `find -exec`/`-execdir`. Si llega asi hasta
// un separador real o el inicio del string, lo que sigue a `idx` SI esta
// en posicion de verbo (se ejecuta de verdad), aunque no sea la primera
// palabra literal del comando completo.
function isAfterTransparentWrapperChain(cmd, idx) {
  let before = cmd.slice(0, idx).replace(/\s+$/, "");
  while (before !== "") {
    const lastChar = before[before.length - 1];
    if (lastChar === ";" || lastChar === "&" || lastChar === "|" || lastChar === "(") return true;

    const spaceIdx = before.lastIndexOf(" ");
    const token = spaceIdx === -1 ? before : before.slice(spaceIdx + 1);
    const rest = spaceIdx === -1 ? "" : before.slice(0, spaceIdx).replace(/\s+$/, "");
    const tokenLower = token.toLowerCase();

    if (TRANSPARENT_WRAPPERS.has(tokenLower) || FIND_EXEC_FLAGS.has(tokenLower)) return true;
    if (/^[-/]/.test(token) || isWrapperArgToken(token)) {
      before = rest; // flag/argumento del wrapper: sigue retrocediendo
      continue;
    }
    // Token suelto que no es flag ni wrapper: solo se perdona si el token
    // que le precede (mas a la izquierda, la posicion siguiente en este
    // retroceso) es a su vez una flag — el patron real es "-u jim", donde
    // "jim" es el valor de "-u", no una palabra de comando. Esto se repite
    // tantas veces como flags-con-valor haya (sudo -u jim -g jim ...): cada
    // ocurrencia se valida por su cuenta contra SU propia flag inmediata,
    // no hay limite de "una sola vez" — un limite asi dejaba pasar `sudo
    // -u jim -g jim cat .env` sin bloquear (hallazgo de revisor, P0.4). No
    // hace falta ningun contador para seguir excluyendo "git show HEAD":
    // "show" no tiene una flag inmediatamente a su izquierda ("git" no
    // empieza con "-"), asi que el emparejamiento simplemente falla ahi,
    // sin necesitar un limite artificial.
    const nextSpaceIdx = rest.lastIndexOf(" ");
    const nextToken = nextSpaceIdx === -1 ? rest : rest.slice(nextSpaceIdx + 1);
    if (/^[-/]/.test(nextToken)) {
      before = rest;
      continue;
    }
    return false; // palabra real que no es wrapper: lo de despues es SU argumento, no un verbo
  }
  return true; // se consumieron solo wrappers hasta el inicio del string
}

// true si el caracter en cmd[idx] arranca una "clausula de comando" nueva:
// inicio del string, separador (; & | (), o justo despues de una comilla
// que se ACABA DE ABRIR (paridad impar de comillas hasta ese punto — una
// comilla de CIERRE no cuenta, evita el falso positivo de
// `git grep "secret" HEAD`, donde la comilla que precede a HEAD es de
// cierre, no de apertura), o justo despues de una flag de sub-shell
// (cmd /c, powershell -Command, bash -c...). No es un parser de shell
// real — es la misma clase de heuristica que ya documenta SECURITY.md
// ("Limite fundamental, no resoluble por regex") — pero cubre los casos
// reales de bypass/falso-positivo revisados en P0.1-P0.4 con evidencia.
function isCommandVerbPosition(cmd, idx) {
  const before = cmd.slice(0, idx);
  const trimmed = before.replace(/\s+$/, "");
  if (trimmed === "") return true;

  const lastChar = trimmed[trimmed.length - 1];
  if (lastChar === ";" || lastChar === "&" || lastChar === "|" || lastChar === "(") {
    return true;
  }
  if (lastChar === '"' || lastChar === "'") {
    const count = (trimmed.match(new RegExp("\\" + lastChar, "g")) || []).length;
    if (count % 2 !== 1) return false; // comilla de CIERRE, no abre nada nuevo
    // Comilla recien abierta: solo cuenta como sub-shell si lo que la abre
    // es en si mismo un arranque de comando (inicio de string, separador, o
    // una flag de sub-shell como -Command/-c//c). Sin esto, un argumento de
    // texto plano entre comillas (git commit -m "cat pictures", echo "less
    // is more") se leeria como si abriera un sub-shell solo por tener una
    // palabra de READ_VERB_WORDS pegada a la comilla de apertura.
    const beforeQuote = trimmed.slice(0, -1).replace(/\s+$/, "");
    if (beforeQuote === "") return true;
    if (/[;&|(]$/.test(beforeQuote)) return true;
    if (SUBSHELL_FLAG_SUFFIX.test(beforeQuote)) return true;
    return isAfterTransparentWrapperChain(cmd, idx);
  }
  if (SUBSHELL_FLAG_SUFFIX.test(trimmed)) return true;

  // No hay separador/comilla justo antes: puede seguir siendo un verbo
  // real si todo lo que hay entre el ultimo separador y aqui es una
  // cadena de wrappers transparentes (sudo/env/timeout/find -exec...).
  return isAfterTransparentWrapperChain(cmd, idx);
}

// Devuelve true si alguna palabra de `words` aparece en cmd EN POSICION DE
// VERBO (ver isCommandVerbPosition). Reemplaza el simple lookbehind de
// P0.3 ("no precedido de guion"), que no distinguia un argumento real
// (git ref, patron de busqueda, texto entre comillas) de un verbo.
function hasVerbAtCommandPosition(cmd, words) {
  const re = new RegExp("\\b(" + words.join("|") + ")\\b", "gi");
  let m;
  while ((m = re.exec(cmd)) !== null) {
    if (isCommandVerbPosition(cmd, m.index)) return true;
    if (m.index === re.lastIndex) re.lastIndex++; // evita loop infinito en match vacio
  }
  return false;
}

// ¿El comando lee un archivo .env REAL (no una plantilla `.env*example`)? Se
// evalua POR TOKEN de ruta, no sobre el comando aplanado: asi `cat .env.example
// .env` (mezcla plantilla + .env real) SE BLOQUEA, en vez de quedar excluido por
// la sola presencia de `.env.example` en cualquier parte del comando. Con el
// chequeo antiguo sobre todo el comando, ese caso se colaba (falso negativo).
function readsRealEnv(cmd, envExclude) {
  return cmd.split(" ").some((token) => {
    const bare = token.replace(/^["']+|["']+$/g, "");
    return /\.env\b/i.test(bare) && !envExclude.test(bare);
  });
}

// Colapsa las OPCIONES GLOBALES de git (las que van ENTRE `git` y su subcomando)
// a solo `git`, para que anteponerlas no evada los patrones de subcomando
// destructivo: `git -c k=v reset --hard` / `git -C repo clean -fd` /
// `git --git-dir=x push --force` -> `git reset --hard` / `git clean -fd` /
// `git push --force`. Solo se quitan opciones globales CONOCIDAS (lista cerrada),
// nunca flags de subcomando, asi que `git commit -p` o `git clean -fd` no se tocan.
function stripGitGlobalOptions(cmd) {
  const OPT = /\bgit\s+(?:-c\s+\S+|-C\s+\S+|--git-dir(?:=\S+|\s+\S+)|--work-tree(?:=\S+|\s+\S+)|--namespace(?:=\S+|\s+\S+)|--exec-path(?:=\S+)?|--no-optional-locks|--literal-pathspecs|--no-pager|--paginate|--bare|-p)\b/i;
  let out = cmd;
  let prev;
  do {
    prev = out;
    out = out.replace(OPT, "git");
  } while (out !== prev);
  return out;
}

// Devuelve [codigo, razon] si el comando debe bloquearse, o null si es seguro.
// cwd se usa para cerrar el bypass de "ya estoy parado dentro de deploy/backups
// o prisma/migrations y borro con ruta relativa corta (sin repetir el prefijo)".
function evaluate(cmd, cwd) {
  const ENV_EXCLUDE = /\.env\.[a-z0-9]*example\b/i;

  if (hasVerbAtCommandPosition(cmd, READ_VERB_WORDS)) {
    if (readsRealEnv(cmd, ENV_EXCLUDE)) {
      return ["P0-ENV", "lectura de archivo .env bloqueada"];
    }
    if (/\bid_rsa|\bid_ed25519|\bid_ecdsa|\bid_dsa|\.pem\b|\.ppk\b|\.p12\b|\.pfx\b|\.key\b|credentials\.json|api[-_]?key/i.test(cmd)) {
      return ["P0-SECRET", "lectura de clave privada/credencial bloqueada"];
    }
  }

  if (DELETE_VERBS.test(cmd)) {
    // Ruta exacta ya cubierta desde P0.1 (borrado directo de un archivo o
    // del directorio protegido en si, sin necesitar semantica recursiva).
    for (const dir of PROTECTED_DIRS) {
      const fullPattern = new RegExp(`${dir.full[0]}[\\/\\\\]${dir.full[1]}`, "i");
      if (fullPattern.test(cmd) || fullPattern.test(cwd)) {
        return [dir.code, `borrado de ${dir.reason} bloqueado`];
      }
    }

    // P0.3: borrado del directorio PADRE (deploy/prisma completos, o ".."
    // parado dentro de ellos), que arrastra al hijo protegido. Solo aplica
    // si el comando tiene semantica recursiva/de directorio: un borrado no
    // recursivo de "deploy" a secas fallaria solo en el filesystem real si
    // no esta vacio, asi que no hace falta bloquearlo aqui.
    if (hasRecursiveDeleteSemantics(cmd)) {
      for (const token of extractPathArgs(cmd)) {
        const resolved = resolveCandidate(token, cwd);
        if (!resolved) continue;
        for (const dir of PROTECTED_DIRS) {
          const seg1 = lastSegments(resolved, 1);
          const seg2 = lastSegments(resolved, 2);
          const isRootItself = seg1[0] === dir.root;
          const isFullPath = seg2.length === 2 && seg2[0] === dir.full[0] && seg2[1] === dir.full[1];
          if (isRootItself || isFullPath) {
            return [dir.code, `borrado recursivo de ${dir.root} (contiene ${dir.reason}) bloqueado`];
          }
        }
      }
    }
  }

  // Los patrones de subcomando git se evaluan sobre el comando con las opciones
  // globales colapsadas (asi no se evaden anteponiendo `-c`/`-C`/...). Los flags
  // destructivos se acotan a la MISMA clausula con [^;&|]* (en vez de [\s\S]*),
  // lo que a la vez (a) permite flags intermedias (`git reset -q --hard`) y
  // (b) evita falsos positivos que cruzaban `;`/`&&`/`|` hacia comandos seguros
  // (p. ej. `git clean -n; git log --format=%H`, donde la `f` de `--format`
  // disparaba P0-CLEAN-F con el `[\s\S]*` codicioso anterior).
  const cmdGit = stripGitGlobalOptions(cmd);
  const BLOCK = [
    ["P0-PUSH-FORCE", /\bgit\s+push\b[^;&|]*(--force(-with-lease)?\b|\s-f\b)/i, "git push --force bloqueado"],
    ["P0-RESET-HARD", /\bgit\s+reset\b[^;&|]*--hard\b/i, "git reset --hard bloqueado"],
    ["P0-CLEAN-F", /\bgit\s+clean\b[^;&|]*-[a-z]*f/i, "git clean -f bloqueado"],
    // P0-COMPOSE-DOWN: `down` en la MISMA clausula que `docker compose`/`docker-compose`,
    // tolerando flags intermedias (`-f x`, `--profile x`). Patron LINEAL (un solo
    // `[^;&|]*`, SIN cuantificador anidado): la version previa `(\s+-{1,2}\S+(\s+\S+)?)*`
    // sufria backtracking catastrofico (ReDoS) ante muchos flags sin `down` y podia colgar
    // el hook antes de evaluar los patrones destructivos siguientes. El NEGATIVE-lookahead
    // `(?![\w-])` exige que `down` NO continue en palabra ni guion: bloquea `down` seguido de
    // fin de cadena, espacio, separador (`;&|`), parentesis/redireccion (`)<>`) y COMILLA
    // (`ssh host "docker compose down"`, `bash -c "... down"`) — todos vectores reales —
    // SIN matchear `down-service`/`downstream`/`down_svc`. Es la semantica correcta de
    // "palabra completa" sin la lista-blanca incompleta de terminadores.
    ["P0-COMPOSE-DOWN", /\bdocker[-\s]compose\b[^;&|]*\sdown(?![\w-])/i, "docker compose down bloqueado"],
    ["P0-MIGRATE-RESET", /\bprisma\s+migrate\s+reset\b/i, "prisma migrate reset bloqueado"],
    ["P0-DB-PUSH", /\bprisma\s+db\s+push\b/i, "prisma db push bloqueado"],
    ["P0-DB-SEED", /\bprisma\s+db\s+seed\b/i, "prisma db seed bloqueado"],
    ["P0-DB-RESET", /\bdb:reset\b/i, "db:reset bloqueado"],
    ["P0-DROP", /\bdrop\s+(database|table)\b/i, "DROP DATABASE/TABLE bloqueado"],
    ["P0-TRUNCATE", /\btruncate\b/i, "TRUNCATE bloqueado"],
  ];

  for (const [code, pattern, reason] of BLOCK) {
    if (pattern.test(cmdGit)) return [code, reason];
  }

  return null;
}

function deny(code, reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason: `[${code}] ${reason}. Requiere autorizacion explicita de Jim.`,
      },
    })
  );
  process.stderr.write(`[${code}] ${reason}\n`);
  process.exit(2);
}
