# Claude Code — worktrees en GestorPro

Claude Code 2.1.207 tiene soporte nativo de worktree confirmado (flag
`--worktree`, herramientas de entrar/salir de un worktree, y `isolation:
"worktree"` como opción del tool `Agent` para agentes que mutan archivos en
paralelo). Este documento es la política de USO sobre esa capacidad real,
no una re-explicación de cómo funciona `git worktree`.

## Cuándo usar un worktree separado

Usar un worktree nuevo cuando dos líneas de trabajo necesitan existir en
disco al mismo tiempo sin pisarse:

- Una tarea de negocio (feature/fix) mientras otra sesión sigue en la rama
  principal.
- Un cambio de configuración de Claude Code (hooks/skills/agents, como este
  mismo P0-P2) en paralelo a desarrollo de producto, para no mezclar
  ambos diffs en la misma copia de trabajo.
- Una investigación de seguridad (p. ej. reproducir un hallazgo de
  `tenant-security-reviewer`) que no debe compartir working tree con
  cambios de negocio a medio hacer.
- Correr la suite E2E completa (`gestorpro-e2e` / `e2e-qa-playwright`) sin
  bloquear la copia de trabajo principal mientras corre.

No usar un worktree solo para "estar más seguro" sin una razón concreta de
aislamiento — cada worktree es un checkout completo (espacio en disco,
otro `npm install` si las dependencias difieren) y una copia más que
mantener sincronizada.

## Reglas de aislamiento por tipo de tarea

| Tipo de tarea | Regla |
|---|---|
| Desarrollo de negocio (frontend/backend) | Worktree propio si hay otra línea de trabajo activa en la rama principal; si es la única tarea en curso, no hace falta. |
| Configuración de Claude Code (`.claude/**`, `docs/claude-code/**`) | Worktree propio cuando coincide en el tiempo con desarrollo de negocio — evita que un `git status` mezcle ambos diffs. |
| Seguridad / investigación de un hallazgo de reviewer | Worktree propio, desechable: se reproduce, se documenta, y se descarta sin necesidad de mergear nada si no produjo un fix. |
| E2E (`gestorpro-e2e`) | Worktree propio si la copia principal necesita seguir editable mientras la suite corre; si no hay conflicto de uso, no hace falta. |

## Reglas duras

- **Dos sesiones nunca editan el mismo worktree a la vez.** Un worktree es
  de una sola sesión activa; si otra sesión necesita tocar los mismos
  archivos, usa su propio worktree o espera.
- **Antes de merge/cherry-pick: worktree limpio.** `git status --short`
  vacío en el worktree origen antes de traer sus cambios a otro lado —
  igual que la regla general de "antes de cualquier operación que pueda
  descartar trabajo, correr `git status` primero".
- **Antes de borrar un worktree: confirmar que el commit está a salvo.**
  Si tiene trabajo sin commitear, o commits que no llegaron a ninguna rama
  que sobreviva al borrado (ni a `origin`), no se borra — se comitea, se
  mueve a una rama, o se pregunta antes de descartar.
- **Finanzas / migraciones / release se quedan seriales, nunca en
  worktrees paralelos.** Una migración de Prisma, un cambio de dinero, o un
  paso de `gestorpro-release` no se ejecutan en un worktree aislado
  mientras otro worktree pueda estar tocando el mismo schema o el mismo
  commit rumbo a producción — el riesgo de dos migraciones o dos releases
  pisándose es justamente lo que la serialización de `CLAUDE.md`
  ("Producción y despliegue") ya exige: una operación de este tipo a la
  vez, con autorización explícita, sin paralelismo que la oculte.

## Qué no cambia

Todas las reglas de `CLAUDE.md` aplican igual dentro de un worktree: git
push/deploy/SSH siguen necesitando la misma autorización, sin importar
desde qué worktree se dispare la acción.
