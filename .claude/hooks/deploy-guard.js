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
// y equivalentes Unix (cat/more/less/head/tail). El (?<!-) evita que un
// verbo aparezca como sufijo de una flag (find -type, node --expose-gc):
// una flag siempre tiene un "-" pegado justo antes de la palabra, un verbo
// real de comando nunca lo tiene ahi (P0.3 — antes "find . -type f" se
// leia como el comando "type").
const READ_VERBS = /(?<!-)\b(cat|type|more|less|head|tail|get-content|gc)\b/i;

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

// Devuelve [codigo, razon] si el comando debe bloquearse, o null si es seguro.
// cwd se usa para cerrar el bypass de "ya estoy parado dentro de deploy/backups
// o prisma/migrations y borro con ruta relativa corta (sin repetir el prefijo)".
function evaluate(cmd, cwd) {
  const ENV_EXCLUDE = /\.env\.[a-z0-9]*example\b/i;

  if (READ_VERBS.test(cmd)) {
    if (/\.env\b/i.test(cmd) && !ENV_EXCLUDE.test(cmd)) {
      return ["P0-ENV", "lectura de archivo .env bloqueada"];
    }
    if (/\bid_rsa|\bid_ed25519|\.pem\b|\.ppk\b|credentials\.json|api[-_]?key/i.test(cmd)) {
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

  const BLOCK = [
    ["P0-PUSH-FORCE", /\bgit\s+push\b[\s\S]*(--force(-with-lease)?\b|\s-f\b)/i, "git push --force bloqueado"],
    ["P0-RESET-HARD", /\bgit\s+reset\s+--hard\b/i, "git reset --hard bloqueado"],
    ["P0-CLEAN-F", /\bgit\s+clean\b[\s\S]*-[a-z]*f/i, "git clean -f bloqueado"],
    ["P0-COMPOSE-DOWN", /\bdocker[-\s]compose\s+down\b/i, "docker compose down bloqueado"],
    ["P0-MIGRATE-RESET", /\bprisma\s+migrate\s+reset\b/i, "prisma migrate reset bloqueado"],
    ["P0-DB-PUSH", /\bprisma\s+db\s+push\b/i, "prisma db push bloqueado"],
    ["P0-DB-SEED", /\bprisma\s+db\s+seed\b/i, "prisma db seed bloqueado"],
    ["P0-DB-RESET", /\bdb:reset\b/i, "db:reset bloqueado"],
    ["P0-DROP", /\bdrop\s+(database|table)\b/i, "DROP DATABASE/TABLE bloqueado"],
    ["P0-TRUNCATE", /\btruncate\b/i, "TRUNCATE bloqueado"],
  ];

  for (const [code, pattern, reason] of BLOCK) {
    if (pattern.test(cmd)) return [code, reason];
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
