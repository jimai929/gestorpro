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
