# Reporte de trabajo no vigilado — 2026-07-12

Sesión autónoma local. Todo el trabajo quedó en **ramas y commits locales**; no
hubo push, merge, deploy, ni escritura remota de ningún tipo. Dos worktrees
aislados creados desde `origin/main` (PR #1 ya fusionado).

---

## A. Estado inicial

| Referencia | Hash | Estado |
|---|---|---|
| `origin/main` | `107b733` | PR #1 (config Claude Code) ya fusionado |
| PR #1 | `chore/claude-code-hardening` @ `e6e7ba9` | **MERGED** (mergeCommit `107b733`) |
| PR #2 | `feat/navegacion-enter` @ `52cd60b` | **Draft / OPEN** (intacto, no tocado) |

Worktrees creados (ambos base `origin/main` = `107b733`):

| Worktree | Ruta | Rama |
|---|---|---|
| A — config Claude Code | `../gestorpro-overnight-claude` | `chore/overnight-claude-hardening-20260712` |
| B — producto GestorPro | `../gestorpro-overnight-app` | `fix/overnight-gestorpro-20260712` |

El worktree de negocio existente `../gestorpro` (rama `feat/navegacion-enter`) **no
se tocó**.

---

## B. Resultados — optimización de la config de Claude Code (worktree A)

Auditoría adversarial en 5 dimensiones (rutas/nombres, PowerShell, seguridad del
hook, settings, gobernanza) + síntesis. Se aplicaron **solo** cambios de bajo
riesgo, con evidencia clara, que no reducen seguridad. Los cambios de mayor
sensibilidad (self-protection) se **deferieron a decisión de Jim** (ver abajo).

### Hallazgos aplicados

**1. Endurecimiento de `deploy-guard.js`** (commit `704f3d3`). Revisado
adversarialmente (revisor: **sin regresión de seguridad**; el hook sigue
fail-closed y P0-SECRET solo *añade* patrones):

- **Exclusión `.env*example` por token** (`readsRealEnv`): antes se evaluaba
  sobre todo el comando aplanado, así que `cat .env.example .env` se colaba (el
  `.example` desactivaba el bloqueo del `.env` real). Falso negativo HIGH cerrado.
- **`stripGitGlobalOptions`**: `git -c k=v reset --hard`, `git -C repo clean -fd`,
  `git --git-dir=x push --force` evadían los patrones anclados a `git <sub>`.
  Falso negativo HIGH cerrado.
- **Acotado a la cláusula** (`[\s\S]*` → `[^;&|]*`): permite flags intermedias
  (`git reset -q --hard`) y **elimina** falsos positivos cross-cláusula
  (`git clean -n; git log --format=%H` ya no se bloquea).
- **`docker compose -f x down`** (uso real de despliegue) ahora se detecta.
- **Verbos de volcado nuevos**: `strings`/`xxd`/`base64` (argumento siempre un
  archivo → sin falsos positivos de patrón de búsqueda, a diferencia de grep/sed/awk).
- **P0-SECRET** amplía claves privadas: `id_ecdsa`, `id_dsa`, `.p12`, `.pfx`, `.key`.

**2. Statusline compatible con Mac/Unix** (commit `a889dcd`): el `-replace
'/','\'` de `statusline.ps1` rompía en el Mac mini M4 (pwsh Core sobre Unix),
devolviendo la ruta entera en vez del nombre del worktree. Se aplica `Split-Path
-Leaf` sobre la salida cruda de git (que siempre usa `/`). Doc `STATUSLINE.md`
alineada al output real (`<ahead>up <behind>dn`).

**3. Escala de severidad del revisor** (commit `7f0142a`): `revisor.md` entregaba
`alta/media/baja`, distinto de los 8 reviewers especializados y de la tabla
consolidada de `gestorpro-revisar`. Unificado a `BLOCKER/HIGH/MEDIUM/LOW`.

**4. Doc de seguridad** (dentro de `704f3d3`): `SECURITY.md` corrige la
imprecisión de que la excepción `.env*example` aplicaba al tool Read (no: el tool
Read bloquea todo `.env*`; la excepción solo existe en el hook para lectura vía
shell), y documenta el endurecimiento + los gaps deferidos.

### Tests del hook

- Base previa: **118/118**. Ahora **139/139** (+21 casos de regresión).
- Nuevos casos: bypass `.env.example .env`, verbos `strings/xxd/base64`, claves
  `id_ecdsa/id_dsa/.key/.p12/.pfx`, opciones globales de git, flag intermedia
  `reset -q --hard`, `compose -f down`, y **negativos** clave: mención de
  `api-key` en un doc permitida, `cat SECURITY.md` permitido, `git clean -n; git
  log` no bloqueado, `git commit -F "ruta con espacios"` (PowerShell) no bloqueado.
- `node --check` OK en hook y test; `statusline.ps1` valida sintaxis PowerShell
  (parser) y produce salida correcta.

### Commits locales (worktree A)

```
7f0142a refactor(claude): unifica la escala de severidad del revisor
a889dcd fix(claude): statusline de proyecto compatible con PowerShell en Mac/Unix
704f3d3 fix(claude): endurece deploy-guard contra bypass de secretos y git destructivo
```

### Riesgos / gaps NO resueltos (deferidos a Jim — requieren su decisión)

- **Self-protection (no tocados por regla)**: `settings.json` y el `CLAUDE.md` del
  proyecto. Hallazgos pendientes: añadir `scp*`/`rsync*` al bloque `ask`; el deny
  `Read(**/.env*)` bloquea también `.env.example` (alinear doc vs impl — **no**
  añadir allow, debilitaría el fail-closed); `CLAUDE.md §Agent skills` no lista las
  8 skills / 8 reviewers / WORKFLOW.md y apunta a `.scratch/` (inexistente).
- **Hook — gaps de detección deferidos por riesgo de falso positivo**: sustitución
  con backtick (`` echo `cat .env` ``) — el fix arriesga falsos positivos en
  mensajes de commit; verbos `grep`/`sed`/`awk` (su 1er arg puede ser el texto a
  buscar); cobertura SQL adicional (`DELETE`/`UPDATE` sin `WHERE`, `DROP
  SCHEMA/INDEX/COLUMN`, `curl | bash`) y los falsos positivos SQL de lenguaje
  natural (`git commit -m "drop table..."`, `vitest run truncate.test.ts`).
- **Falsos positivos menores introducidos (tolerables, fail-closed)**: `cat
  .env.example > .env` (crear `.env` desde plantilla por redirección) ahora se
  bloquea — usar `cp .env.example .env`; `\.key\b` es un match de extensión amplio
  (0 archivos `.key` rastreados hoy).
- **Gobernanza (refactor multi-archivo, decisión de diseño)**: preámbulo de ~15
  líneas duplicado en los 8 reviewers; falta instrucción común "distinguir
  hallazgos en-alcance vs deuda preexistente (`docs/BUGS_PREEXISTENTES.md`)" y "no
  abortar el inventario ante un punto bloqueado"; `docs/agents/domain.md` /
  `issue-tracker.md` / `triage-labels.md` son imports genéricos que apuntan a
  rutas inexistentes (`CONTEXT.md`, `docs/adr/`, `.scratch/`).

---

## C. Resultados — producto GestorPro (worktree B)

### B1 — FormularioVenta: envío accidental con Enter (confirmado y corregido)

**Riesgo confirmado.** `FormularioVenta` (cierre de caja, registra dinero) usa un
`<form>` nativo cuyo botón se habilita en cuanto el arqueo tiene un monto > 0 y los
selects están completos. Pulsar **Enter** en un input de número/fecha/hora disparaba
el **envío implícito** del formulario y registraba un cierre con datos parciales
(p. ej. tras teclear solo "efectivo"). Además el guard de doble-envío era débil:
el botón compartido `Boton` quedaba clicable durante el envío en curso (ver B3).

**Corrección (conservadora, solo FormularioVenta):**
- `onKeyDown={bloquearEnvioImplicito}` en el `<form>`: Enter en inputs de
  texto/número/fecha/hora hace `preventDefault` (no envía). Respeta `<select>`
  (teclado del desplegable), `<textarea>`, botones, teclas con modificador e IME
  (composición china). **No** añade navegación por Enter — eso vive en el hook
  compartido `useNavegacionEnter` de PR #2, que **no se tocó**.
- Cerrojo síncrono `enviandoRef` (useRef) en `manejarEnvio`: inmune al cierre
  obsoleto del estado; atrapa dos envíos en el mismo tick antes del re-render.

Sin cambios en el cálculo del arqueo, el payload de `registrarVenta`, permisos ni
reglas de negocio (verificado por revisor).

### B2 — Escaneo de formularios equivalentes

Escaneados los 5 formularios que PR #2 **no** cubre (Sede, CrearUsuario, Kiosco,
Categoria, CrearEmpresa; los de PR #2 —Gasto/Factura/Proveedor/Empleado— **no se
tocan** para no chocar con su hook genérico). **Conclusión basada en evidencia: 0
formularios necesitan el fix de Enter.** El patrón exacto de FormularioVenta
(form nativo + submit gateado por "completo" + se completa antes de tiempo) no
aparece en ninguno: los 3 con gate son `<div>`+`onClick` (sin Enter implícito) y
los 2 con `<form>` nativo (CrearUsuario/CrearEmpresa) validan todo en cada submit
y `cargando` los deshabilita, así que un Enter prematuro no crea nada.

### B3 — Tarea extra de alto valor / bajo riesgo: `Boton` anti doble-envío

**Evidencia**: el componente compartido `Boton` hacía `disabled={disabled ??
cargando}`. Al pasar un `disabled` booleano explícito (p. ej.
`disabled={!formularioCompleto}` → `false` con el form completo), `?? cargando`
quedaba muerto y el botón seguía **clicable durante el envío en curso** → doble
registro posible en ~20 formularios (crear kiosco+token, sede, categoría, etc.).

**Impacto / por qué bajo riesgo**: `disabled || cargando` solo cambia el caso
`disabled===false && cargando===true` (ahora deshabilita), que es el contrato
documentado del prop. Los botones que no cargan no cambian; los "Cancelar"
secundarios usan `disabled={guardando}` (no `cargando`) y no se ven afectados
(revisor lo confirmó revisando los ~20 usos). Fallo posible = botón temporalmente
deshabilitado durante su propia carga (benigno, se auto-recupera).

**Aceptación**: suite frontend completa verde + `Boton.test.tsx` nuevo.

### Archivos cambiados (worktree B)

```
frontend/src/finanzas/dashboard/FormularioVenta.tsx        (B1)
frontend/src/finanzas/dashboard/FormularioVenta.test.tsx   (B1, +8 tests)
frontend/src/core/ui/Boton.tsx                             (B3, 1 línea)
frontend/src/core/ui/Boton.test.tsx                        (B3, nuevo, 5 tests)
```

### Commits locales (worktree B)

```
1b4ef65 fix(ui): Boton deshabilita durante `cargando` (anti doble envio)
2d5af96 fix(ventas): evita registro accidental del cierre con Enter y doble envio
```
(+ el commit de este reporte.)

Ambos reviewers adversariales (guard y producto) cerraron **sin BLOCKER/HIGH**.
Los hallazgos LOW de calidad de tests (test falso-verde por jsdom; `enviandoRef`
sin test aislado) **se corrigieron** antes de commitear: se reforzó el test de
Enter para afirmar `preventDefault`, y se añadió un test que aísla `enviandoRef`
con dos `fireEvent.submit` en el mismo tick.

---

## D. Resultados de verificación

| Verificación | Resultado |
|---|---|
| Hook `deploy-guard` (worktree A) | **139/139** (base 118 + 21 nuevos) |
| `node --check` hook + test | OK |
| `statusline.ps1` sintaxis PowerShell | OK (parser) + salida correcta |
| Tests dirigidos B (FormularioVenta + Boton) | **21/21** |
| Suite frontend completa (worktree B) | **177/177** (28 archivos; base 164 + 13 nuevos) |
| Typecheck (`tsc -b`, dentro de build) | OK |
| Build (`vite build`) | OK (1962 módulos) |
| ESLint — archivos tocados por mí | **limpio** (0 errores) |
| ESLint — repo completo | 1 error + 5 warnings **preexistentes** en archivos NO tocados (`e2e/global-setup.ts:16` `_config` sin usar; `e2e/global-teardown.ts`; `ContextoAuth.tsx`; `ContextoIdioma.tsx`) — no ampliados por esta sesión |
| Backend | No tocado → no ejecutado |
| E2E | No ejecutado (requiere entorno; sin cambios E2E) |
| `git diff --check` (A y B) | limpio |
| Working tree A / B | ambos limpios |

---

## E. Operaciones NO ejecutadas

- **No** hubo `git push` (ninguna rama).
- **No** hubo merge a `main`.
- **No** hubo deploy.
- **No** se modificó, cerró, fusionó ni actualizó ningún PR remoto (PR #2 sigue
  Draft @ `52cd60b`; PR #1 sigue MERGED).
- **No** se leyó, mostró, copió, movió ni borró ningún secreto (`.env`, tokens,
  `~/.claude/github apikey.txt`, etc.).
- **No** se tocó el VPS (`45.77.198.133`).
- **No** se conectó ni escribió a la base de datos de producción.
- **No** se editó `settings.json`, el `CLAUDE.md` del proyecto ni el `guard.js`
  global (self-protection: deferido a Jim).

---

## F. Recomendaciones para mañana (prioridad)

1. **Revisar y preparar PR de `fix/overnight-gestorpro-20260712`** (worktree B):
   commits `2d5af96` (FormularioVenta Enter + doble-envío) y `1b4ef65` (Boton).
   Ambos verificados (177/177, revisor sin BLOCKER/HIGH). Listos para PR contra
   `main`. Nota: el fix de `Boton` es compartido (~20 formularios) — vale una
   última mirada aunque la suite completa esté verde.
2. **Revisar `chore/overnight-claude-hardening-20260712`** (worktree A): commits
   `704f3d3`/`a889dcd`/`7f0142a`. El endurecimiento del hook (`704f3d3`) es
   seguridad — conviene tu lectura antes de merge, aunque revisor no halló
   regresión y 139/139 pasan.
3. **Decidir los cambios de self-protection deferidos** (requieren tu mano):
   `settings.json` (scp/rsync en `ask`; alineación `.env.example`) y `CLAUDE.md
   §Agent skills` (apunta a `.scratch/`, no lista skills/reviewers reales).
4. **Decidir los gaps de detección del hook con riesgo de falso positivo**:
   backtick-substitución, verbos grep/sed/awk, cobertura SQL ampliada. Cada uno
   necesita tu criterio sobre el trade-off cobertura vs. fricción.
5. **NO auto-tratar** (riesgo/decisión de producto): el FP menor `cat .env.example
   > .env` (workaround: `cp`); el refactor del preámbulo duplicado de los 8
   reviewers; reescribir/eliminar `docs/agents/domain.md`+`issue-tracker.md`+
   `triage-labels.md` (imports genéricos con rutas inexistentes); el lint error
   preexistente en `e2e/global-setup.ts` (fuera de alcance de esta sesión).

---

*Generado en sesión autónoma local. Ver `git log` de cada rama para el detalle.*
