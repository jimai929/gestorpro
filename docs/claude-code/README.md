# Claude Code — configuración de GestorPro

Este directorio documenta la configuración de Claude Code específica de
GestorPro. No repite las reglas de `CLAUDE.md` (esas mandan si hay
conflicto); aquí se explica cómo está montada la infraestructura de
permisos/hooks y por qué.

## Dos capas de configuración

1. **Global (`~/.claude/`, fuera de este repo)**: aplica a *todos* los
   proyectos de esta máquina. Incluye `hooks/guard.js` (bloqueo genérico de
   `rm -rf`, `git reset --hard`, `git clean -f`, `git push --force`,
   `prisma migrate reset`, `db:reset`, `DROP`, `TRUNCATE`, y **todo**
   `git commit`) y `agents-policy.md` (disciplina de uso de subagentes).
   Esta capa no se modifica desde este repositorio.
2. **Proyecto (`.claude/` en este repo)**: reglas específicas de GestorPro
   que no tiene sentido aplicar globalmente (rutas de `deploy/backups`,
   `prisma/migrations`, IP de producción, etc.).
   - `.claude/settings.json` — `permissions.allow/ask/deny` + registro del
     hook de proyecto.
   - `.claude/hooks/deploy-guard.js` — bloqueo duro que `permissions.deny`
     no puede expresar con precisión (contenido del comando, no solo
     prefijo/ruta).

Las dos capas se combinan: un comando pasa solo si sobrevive al hook
global **y** al hook de proyecto **y** a las reglas de `permissions`.

## Qué NO cubre esta capa

- Base de datos de producción, VPS, deploy real: siguen prohibidos por
  `CLAUDE.md` (sección "Producción y despliegue"); esta configuración es
  una red de seguridad técnica adicional, no el mecanismo principal de
  autorización (eso sigue siendo pedir confirmación a Jim).
- Skills y agents específicos de GestorPro: no forman parte de este P0,
  quedan para una fase posterior (ver plan de auditoría en el historial de
  la tarea).
- MCP / plugins: sin cambios en esta fase; ver `MCP_POLICY.md` /
  `PLUGIN_PLAN.md` para el estado y los planes.

Detalle de reglas y matrices de prueba: `SECURITY.md`.
