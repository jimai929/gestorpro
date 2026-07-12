# Claude Code — statusline en GestorPro

Verificado contra el binario instalado (`@anthropic-ai/claude-code@2.1.207`)
y el script global real (`~/.claude/statusline.ps1`, leído solo para
entender su estructura — sin secretos, es un formateador de texto).

## ¿Puede un proyecto sobreescribir el statusline global?

Sí. `statusLine` es una clave de `settings.json` real (confirmada en el
binario junto al resto de claves reconocidas). El binario también confirma
la regla general de precedencia: **"project settings override
~/.claude/settings.json"**. No se encontró una cadena que documente una
fusión campo-por-campo específica para `statusLine` (es un objeto
`{command, padding, refreshInterval}`, no una lista); se asume reemplazo
completo del objeto, consistente con cómo se combinan el resto de claves de
objeto único en `settings.json`.

## Qué muestra hoy el statusline global

Leído `~/.claude/statusline.ps1` completo (estructura, no secretos):

- `[nombre del modelo]`
- Barra de uso de la ventana de 5 horas (`5h`, con reset relativo)
- Barra de uso de la ventana semanal de 7 días (`7d`, con reset relativo)
- Barra de contexto usado (`ctx`)

## Qué le falta para GestorPro

- Rama actual (`branch`)
- HEAD corto
- Limpio/sucio (`clean`/`dirty`)
- Adelante/atrás del remoto (`ahead`/`behind`)
- Nombre del worktree actual

Ninguno de estos cinco existe hoy en el statusline global. Dado que
GestorPro está en medio de trabajo de hardening por fases (P0-P2, ramas
dedicadas) y que `docs/claude-code/WORKTREES.md` habilita trabajo en
worktrees paralelos, tener el estado de git a la vista sin tener que
preguntar es una ganancia real, no cosmética — reduce el riesgo de operar
sobre la rama/worktree equivocado.

## Decisión: sí se crea `scripts/claude/statusline.ps1` — sin activarlo todavía

Justificación para crearlo: (1) el override de proyecto está confirmado
soportado, (2) el hueco de información es real y verificado leyendo el
script actual, (3) hay beneficio concreto para este proyecto en este
momento.

**No se registra en `.claude/settings.json` en este P2.** Ese archivo es
gobernado por P0 (`docs/claude-code/SECURITY.md`) y el alcance de este P2
excluye explícitamente modificar archivos de P0/P1 salvo este mismo índice
de `README.md`. Activarlo es un cambio de una línea
(`"statusLine": {"type": "command", "command": "pwsh -NoProfile -File
\"${CLAUDE_PROJECT_DIR}/scripts/claude/statusline.ps1\""}` dentro de
`.claude/settings.json`, mismo patrón `${CLAUDE_PROJECT_DIR}` que ya usan
los hooks de P0) — deliberadamente dejado como siguiente paso explícito
para que Jim lo autorice, no decidido de forma unilateral en esta tarea.

**Trade-off que Jim debe conocer**: el `statusLine` de este proyecto
**reemplaza** al global mientras se trabaje aquí — las barras de `5h`/`7d`/
`ctx`/modelo dejan de verse en sesiones dentro de este repo. La
especificación pedida para este P2 es explícitamente solo los cinco campos
de git (`branch | HEAD corto | clean/dirty | ahead/behind | worktree`); no
se combinó con las barras de uso para no exceder lo pedido. Si se prefiere
tener ambos, es una decisión de Jim para una iteración futura (script más
largo, mismo mecanismo).

## Contenido del statusline de proyecto

Formato de una línea, en este orden:

```
<rama> | <hash corto> | <clean|dirty> | <ahead>↑<behind>↓ | wt:<nombre-worktree>
```

- `<rama>`: `git rev-parse --abbrev-ref HEAD` sobre `workspace.current_dir`
  del JSON de entrada (campo real confirmado en el binario:
  `"current_dir": "string", // Current working directory path`).
- `<hash corto>`: `git rev-parse --short HEAD`.
- `clean`/`dirty`: `git status --porcelain` vacío o no.
- `ahead`/`behind`: contra el upstream configurado (`@{u}`); si no hay
  upstream, se omite ese segmento en vez de fallar.
- `wt:<nombre>`: nombre de la carpeta raíz del worktree actual (`git
  rev-parse --show-toplevel`, último segmento de la ruta) — así se
  distingue un worktree de otro de un vistazo.

## Qué NUNCA muestra

Secretos, tokens, credenciales, IP o dominio de producción. El script no
lee `.env`, no hace red, no llama a nada fuera de `git` local.

## Degradación

`$ErrorActionPreference = 'SilentlyContinue'` + cada llamada a `git` en su
propio `try/catch`: si `git` no está disponible, el directorio no es un
repo, o cualquier comando falla, ese segmento se omite silenciosamente. El
script nunca debe hacer que Claude Code se detenga o muestre un error — en
el peor caso, la línea de estado sale vacía o incompleta.
