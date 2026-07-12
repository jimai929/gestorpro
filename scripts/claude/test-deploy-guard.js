#!/usr/bin/env node
// Test sin efectos secundarios para .claude/hooks/deploy-guard.js.
// Alimenta JSON simulado por stdin (igual que Claude Code) y verifica
// permissionDecision=deny/allow. No ejecuta los comandos reales.

const { spawnSync } = require("child_process");
const path = require("path");

const HOOK_PATH = path.join(__dirname, "..", "..", ".claude", "hooks", "deploy-guard.js");

function encodedCommand(psCommand) {
  return Buffer.from(psCommand, "utf16le").toString("base64");
}

// Casos estructurados: [tool_name, command, shouldBlock, label]
const CASES = [
  ["Bash", "git push --force origin main", true, "git push --force (Bash)"],
  ["PowerShell", "git push --force origin main", true, "git push --force (PowerShell)"],
  ["Bash", "git reset --hard HEAD", true, "git reset --hard"],
  ["Bash", "git clean -fd", true, "git clean -fd"],
  ["Bash", "docker compose down", true, "docker compose down"],
  ["PowerShell", "docker compose down", true, "docker compose down (PowerShell)"],
  ["Bash", "npx prisma migrate reset", true, "prisma migrate reset"],
  ["Bash", "npx prisma db push", true, "prisma db push"],
  ["Bash", "npx prisma db seed", true, "prisma db seed"],
  ["Bash", "npm run db:reset", true, "npm run db:reset"],
  ["Bash", "psql -h localhost -c \"DROP TABLE empleado;\"", true, "psql DROP TABLE"],
  ["Bash", "psql -h localhost -c \"TRUNCATE venta_diaria;\"", true, "psql TRUNCATE"],
  ["PowerShell", "Remove-Item deploy/backups/x.dump", true, "Remove-Item deploy/backups"],
  ["Bash", "rm prisma/migrations/20260101_x/migration.sql", true, "rm prisma/migrations"],
  ["PowerShell", "Get-Content .env", true, "Get-Content .env"],
  ["Bash", "cat ~/.ssh/id_rsa", true, "cat id_rsa"],

  ["Bash", "git status", false, "git status"],
  ["Bash", "git diff", false, "git diff"],
  ["Bash", "git log --oneline -3", false, "git log --oneline -3"],
  ["Bash", "git diff --check", false, "git diff --check"],
  ["Bash", "npm test", false, "npm test"],
  ["Bash", "npm run typecheck", false, "npm run typecheck"],
  ["Bash", "npm run build", false, "npm run build"],
  ["Bash", "pg_restore -l backup.dump", false, "pg_restore -l (solo listado)"],
  ["PowerShell", "Get-ChildItem deploy/backups", false, "Get-ChildItem deploy/backups (listado)"],
  ["PowerShell", "Get-Content prisma/migrations/20260101_x/migration.sql", false, "Get-Content migration.sql (lectura normal)"],

  // --- P0.3: falso positivo de "type" en posicion de flag ---
  ["Bash", "find . -type f", false, "find -type (falso positivo type, debe permitirse)"],
  ["Bash", 'find . -type f -name "*.env.example"', false, "find -type + .env.example (no debe leerse como .env sensible)"],
  ["Bash", "node --expose-gc script.js", false, "--expose-gc (falso positivo gc en flag)"],
  ["Bash", "type README.md", false, "type de archivo no sensible"],
  ["Bash", "type .env", true, "type .env (verbo real, debe seguir bloqueado)"],
  ["Bash", 'cmd /c type .env', true, "cmd /c type .env (sub-shell, debe seguir bloqueado)"],

  // --- P0.3: bypass de borrado de directorio padre ---
  ["Bash", "git diff -- deploy", false, "git diff -- deploy (no es un verbo de borrado)"],
  ["PowerShell", "Get-ChildItem deploy", false, "Get-ChildItem deploy (listado, no borrado)"],
  ["Bash", "find deploy -type f", false, "find deploy -type f (lectura, no borrado)"],
  ["PowerShell", "Get-Content prisma/migrations/20260101_x/migration.sql", false, "Get-Content de una migracion puntual (lectura, no borrado)"],
  ["Bash", "rm -r deploy", true, "rm -r deploy (borrado recursivo del padre de backups)"],
  ["Bash", "rm -rf ./deploy", true, "rm -rf ./deploy (ruta relativa explicita)"],
  ["PowerShell", "Remove-Item -Recurse deploy", true, "Remove-Item -Recurse deploy"],
  ["PowerShell", "Remove-Item -Recurse deploy\\backups\\..\\..\\deploy", true, "Remove-Item -Recurse con .. que resuelve a deploy"],
  ["PowerShell", "rmdir /s /q deploy", true, "rmdir /s /q deploy (CMD recursivo)"],
  ["Bash", "rm -r prisma", true, "rm -r prisma (borrado recursivo del padre de migrations)"],
  ["PowerShell", "Remove-Item -Recurse prisma", true, "Remove-Item -Recurse prisma"],
  [
    "PowerShell",
    "Remove-Item -Recurse C:\\Users\\jimfe\\dev\\gestorpro-claude-config\\deploy",
    true,
    "borrado recursivo de deploy con ruta absoluta (Windows)",
  ],
  ["Bash", "rm -r /c/Users/jimfe/dev/gestorpro-claude-config/prisma", true, "borrado recursivo de prisma con ruta absoluta (Unix)"],
  ["Bash", "Remove-Item -Recurse deploy_extra", false, "directorio de nombre parecido pero distinto (no debe bloquearse)"],
  ["Bash", "rm -r deployment", false, "'deployment' no es 'deploy' (no debe bloquearse por substring)"],

  // --- P0.4: falso positivo de READ_VERBS contra la referencia git HEAD ---
  ["Bash", "git show HEAD", false, "git show HEAD (HEAD es argumento, no el comando head)"],
  ["Bash", "git diff HEAD", false, "git diff HEAD"],
  ["Bash", "git diff HEAD~1..HEAD", false, "git diff HEAD~1..HEAD (HEAD aparece dos veces, ambas como argumento)"],
  ["Bash", "git rev-parse HEAD", false, "git rev-parse HEAD"],
  ["Bash", "git log HEAD --oneline", false, "git log HEAD --oneline"],
  ["Bash", 'grep -i "apikey" docs/file.md', false, "grep -i apikey docs/file.md (ningun verbo de lectura presente)"],
  ["Bash", 'git grep "secret" HEAD', false, "git grep secret HEAD (comilla de cierre antes de HEAD, no de apertura)"],
  [
    "Bash",
    'git commit -m "menciona HEAD y apikey en el mismo mensaje"',
    false,
    "HEAD + apikey coexistiendo en un string sin verbo de lectura real",
  ],
  ["PowerShell", "git diff Head", false, "referencia HEAD con mayus/minus mixta, sigue siendo argumento"],
  ["Bash", "GIT SHOW HEAD", false, "comando completo en mayusculas, HEAD sigue siendo argumento"],
  ["Bash", "docker logs --tail 50 backend", false, "docker logs --tail (flag real llamada 'tail', no el comando tail)"],
  ["Bash", 'echo "less is more"', false, "palabra de READ_VERB_WORDS pegada a una comilla que NO abre un sub-shell"],
  [
    "Bash",
    'git log --pretty=format:"cat and more are just words here"',
    false,
    "READ_VERB_WORDS dentro de un string de formato de git log, no un sub-shell",
  ],

  ["Bash", "head .env", true, "head .env (verbo real al inicio de la clausula)"],
  ["Bash", "tail .env", true, "tail .env"],
  ["Bash", "cat .env", true, "cat .env"],
  ["Bash", "gc .env", true, "gc .env (alias PowerShell de Get-Content)"],
  [
    "PowerShell",
    'powershell -Command "Get-Content .env"',
    true,
    "powershell -Command con verbo real recien despues de la comilla de apertura",
  ],
  ["Bash", "head ~/.ssh/id_rsa", true, "head id_rsa"],
  ["Bash", 'bash -c "cat .env"', true, "bash -c con verbo real dentro de comillas (sub-shell Unix)"],
  ["Bash", "sh -c 'cat .env'", true, "sh -c con comillas simples"],

  // --- P0.4 (revision adversarial): wrappers transparentes que SI ejecutan
  // el verbo siguiente como subproceso real. Regresion encontrada por
  // release-reviewer en la primera version del fix: al exigir que el verbo
  // fuera la primera palabra literal de la clausula, sudo/env/timeout/
  // nohup/watch/xargs/find -exec dejaban de detectarse aunque SI leen el
  // archivo sensible en runtime.
  ["Bash", "sudo cat .env", true, "sudo cat .env (sudo ejecuta cat como subproceso real)"],
  ["Bash", "env cat .env", true, "env cat .env"],
  ["Bash", "timeout 5 cat .env", true, "timeout 5 cat .env (5 es el argumento de duracion de timeout)"],
  ["Bash", "timeout 30s cat .env", true, "timeout 30s cat .env (duracion con sufijo de unidad)"],
  ["Bash", "nohup cat .env", true, "nohup cat .env"],
  ["Bash", "watch cat .env", true, "watch cat .env"],
  ["Bash", "echo .env | xargs cat", true, "xargs cat (verbo real tras el wrapper, aunque haya un pipe antes)"],
  [
    "Bash",
    "find . -name .env -exec cat {} +",
    true,
    "find -exec cat (el flag -exec arranca un comando nuevo que SI se ejecuta)",
  ],
  ["Bash", "sudo cat ~/.ssh/id_rsa", true, "sudo cat id_rsa (P0-SECRET tras wrapper)"],
  ["Bash", "timeout 5 cat credentials.json", true, "timeout cat credentials.json (P0-SECRET tras wrapper)"],
  ["Bash", "sudo -u jim cat .env", true, "sudo con su propia flag (-u jim) antes del verbo real"],
  ["Bash", "env FOO=bar cat .env", true, "env con asignacion de variable (FOO=bar) antes del verbo real"],
  [
    "Bash",
    "sudo -u jim -g jim cat .env",
    true,
    "sudo con DOS flags de valor suelto (-u jim -g jim): el perdon no debe agotarse tras la primera",
  ],
  ["Bash", "env -u FOO -u BAR cat .env", true, "env con dos flags -u repetidas antes del verbo real"],
  ["Bash", "sudo -u jim -p prompt cat .env", true, "sudo con tres tokens de flag+valor antes del verbo real"],
  ["Bash", "watch git status", false, "watch de un comando seguro (git status) no debe bloquearse"],
  ["Bash", "env FOO=bar npm test", false, "env envolviendo un comando seguro, sin verbo de lectura"],
  ["PowerShell", 'powershell -c "cat .env"', true, "powershell -c (forma corta de -Command)"],
  ["Bash", "GET-CONTENT .env", true, "verbo en mayusculas puras, sigue bloqueado (case-insensitive)"],
  ["Bash", "; cat .env", true, "cat .env tras separador ; (segunda clausula)"],
  ["Bash", "echo hola && cat .env", true, "cat .env tras && (segunda clausula real)"],

  // --- P0.1: formas de bypass revisadas ---
  ["PowerShell", "GiT PuSh --FORCE origin main", true, "mayus/minus mezclado"],
  ["Bash", "git   push\n--force   origin   main", true, "espacios y saltos de linea multiples"],
  ["Bash", "& git push --force origin main", true, "prefijo & (call operator)"],
  ["PowerShell", 'powershell -Command "git reset --hard"', true, "sub-shell powershell -Command"],
  ["Bash", 'cmd /c "git clean -fd"', true, "sub-shell cmd /c"],
  ["Bash", "npm.cmd run db:reset", true, "npm.cmd (alias Windows)"],
  ["Bash", "npx.cmd prisma db push", true, "npx.cmd (alias Windows)"],
  ["PowerShell", "Remove-Item -Recurse deploy\\backups", true, "Remove-Item -Recurse con backslash"],
  ["PowerShell", "del /s prisma\\migrations\\20260101_x", true, "del /s con backslash"],
  ["PowerShell", "Rem`ove-Item deploy/backups/x.dump", true, "backtick partiendo la palabra clave"],
  ["PowerShell", `powershell -EncodedCommand ${encodedCommand("git reset --hard HEAD")}`, true, "-EncodedCommand base64/UTF-16LE"],
  ["PowerShell", `powershell -enc ${encodedCommand("Remove-Item deploy/backups/x.dump")}`, true, "-enc (forma corta) base64/UTF-16LE"],

  // --- Endurecimiento 2026-07-12: exclusion .env por TOKEN (no por comando) ---
  ["Bash", "cat .env.example .env", true, "cat .env.example .env (el .example no debe excluir el .env real)"],
  ["Bash", "cat .env.example", false, "cat .env.example (plantilla: se permite)"],
  ["Bash", "cat docs/claude-code/SECURITY.md", false, "cat de un doc que MENCIONA 'apikey' (el comando no lee ningun secreto real)"],
  ["Bash", "grep -n api-key docs/claude-code/SECURITY.md", false, "grep de 'api-key' en un doc (mencion textual, grep no es verbo de volcado)"],

  // --- Endurecimiento 2026-07-12: mas verbos de volcado y mas claves privadas ---
  ["Bash", "strings .env", true, "strings .env (volcado de contenido, verbo nuevo)"],
  ["Bash", "xxd .env", true, "xxd .env (volcado hex, verbo nuevo)"],
  ["Bash", "base64 .env", true, "base64 .env (volcado codificado, verbo nuevo)"],
  ["Bash", "strings README.md", false, "strings de un archivo no sensible (el verbo nuevo no sobre-bloquea)"],
  ["Bash", "cat ~/.ssh/id_ecdsa", true, "cat id_ecdsa (clave privada)"],
  ["Bash", "cat ~/.ssh/id_dsa", true, "cat id_dsa (clave privada)"],
  ["Bash", "cat server.key", true, "cat server.key (.key: clave privada)"],
  ["Bash", "cat cert.p12", true, "cat cert.p12 (almacen de claves)"],
  ["Bash", "cat store.pfx", true, "cat store.pfx (almacen de claves)"],

  // --- Endurecimiento 2026-07-12: opciones globales de git no evaden el bloqueo ---
  ["Bash", "git -c advice.setupRename=false reset --hard", true, "git -c ... reset --hard (opcion global antepuesta)"],
  ["Bash", "git -c http.version=2 push --force origin main", true, "git -c ... push --force (opcion global antepuesta)"],
  ["Bash", "git -C repo clean -fd", true, "git -C repo clean -fd (opcion global -C antepuesta)"],
  ["Bash", "git reset -q --hard HEAD", true, "git reset -q --hard (flag intermedia entre reset y --hard)"],
  ["Bash", "docker compose -f deploy/compose.yml down", true, "docker compose -f x down (-f intermedio, uso real de despliegue)"],

  // --- Endurecimiento 2026-07-12: [^;&|]* NO cruza clausulas (menos falsos positivos) ---
  ["Bash", "git clean -n; git log --format=%H", false, "git clean -n (dry-run) seguido de git log: la 'f' de --format no debe disparar P0-CLEAN-F"],
  ["Bash", "git push origin main && grep -f patrones.txt f.txt", false, "el -f de grep en la 2a clausula no debe disparar P0-PUSH-FORCE"],
  ["PowerShell", 'git commit -F "C:/ruta con espacios/mensaje.txt"', false, "git commit -F con ruta que contiene espacios (PowerShell): no debe bloquearse"],
];

// Casos adversariales de input malformado: [rawStdin, shouldBlock, label]
// Se escriben directo a stdin, sin pasar por JSON.stringify({tool_name,...}).
const RAW_CASES = [
  ["esto no es json {{{", true, "JSON invalido"],
  ["", true, "input vacio"],
  ["{}", true, "objeto vacio"],
  [JSON.stringify({ tool_name: "Bash" }), true, "tool_input ausente"],
  [JSON.stringify({ tool_name: "Bash", tool_input: {} }), true, "tool_input.command ausente"],
  [JSON.stringify({ tool_name: "Bash", tool_input: { command: null } }), true, "command = null"],
  [JSON.stringify({ tool_name: "Bash", tool_input: { command: ["git", "push"] } }), true, "command = array"],
  [JSON.stringify({ tool_name: "Bash", tool_input: { command: "" } }), true, "command = string vacio"],
  [JSON.stringify({ tool_name: "Read", tool_input: { file_path: "x" } }), false, "tool_name fuera de alcance (Read)"],
  [JSON.stringify({ tool_name: "Bash", tool_input: { command: "git status" } }), false, "estructura valida, comando seguro"],
];

// Casos de bypass via cwd: ruta relativa corta cuando ya se esta parado
// dentro del directorio protegido (sin repetir "deploy/backups" en el comando).
// [tool_name, command, cwd, shouldBlock, label]
const CWD_CASES = [
  ["PowerShell", "Remove-Item x.dump", "C:\\gestorpro\\deploy\\backups", true, "borrado con ruta relativa, cwd ya dentro de deploy/backups"],
  ["Bash", "rm 20260101_x/migration.sql", "/c/gestorpro/prisma/migrations", true, "borrado con ruta relativa, cwd ya dentro de prisma/migrations"],
  ["Bash", "rm tmp.txt", "/c/gestorpro/scratch", false, "borrado de archivo no relacionado (cwd normal)"],

  // --- P0.3: borrado del padre via ".." parado dentro del protegido ---
  ["Bash", "rm -r ..", "/c/gestorpro/deploy/backups", true, "rm -r .. parado en deploy/backups (resuelve a deploy)"],
  ["PowerShell", "Remove-Item -Recurse ..", "C:\\gestorpro\\prisma\\migrations\\20260101_x", true, "Remove-Item -Recurse .. parado dentro de una migracion (resuelve a prisma/migrations)"],
  ["Bash", "rm -r deploy", "/c/gestorpro", true, "rm -r deploy con cwd en la raiz del repo"],
  ["Bash", "Get-ChildItem ..", "/c/gestorpro/deploy/backups", false, "listado de .. (no es borrado)"],
];

let failures = 0;

function report(label, toolLabel, result, shouldBlock) {
  const blocked = result.status === 2;
  let decision = null;
  if (result.stdout) {
    try {
      decision = JSON.parse(result.stdout).hookSpecificOutput?.permissionDecision;
    } catch {
      // stdout no era JSON valido; se reporta como fallo mas abajo si no coincide
    }
  }
  const ok = blocked === shouldBlock;
  if (!ok) failures++;
  console.log(
    `${ok ? "OK  " : "FAIL"} [${toolLabel}] ${label} -> exit=${result.status} decision=${decision ?? "(none)"} esperado=${shouldBlock ? "bloquear" : "permitir"}`
  );
}

for (const [toolName, command, shouldBlock, label] of CASES) {
  const input = JSON.stringify({ tool_name: toolName, tool_input: { command } });
  const result = spawnSync(process.execPath, [HOOK_PATH], { input, encoding: "utf8" });
  report(label, toolName, result, shouldBlock);
}

for (const [rawInput, shouldBlock, label] of RAW_CASES) {
  const result = spawnSync(process.execPath, [HOOK_PATH], { input: rawInput, encoding: "utf8" });
  report(label, "raw", result, shouldBlock);
}

for (const [toolName, command, cwd, shouldBlock, label] of CWD_CASES) {
  const input = JSON.stringify({ tool_name: toolName, tool_input: { command }, cwd });
  const result = spawnSync(process.execPath, [HOOK_PATH], { input, encoding: "utf8" });
  report(label, toolName, result, shouldBlock);
}

const total = CASES.length + RAW_CASES.length + CWD_CASES.length;
console.log(`\n${total - failures}/${total} casos correctos.`);
process.exit(failures > 0 ? 1 : 0);
