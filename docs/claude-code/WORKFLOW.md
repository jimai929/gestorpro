# Claude Code — flujo de trabajo de GestorPro

Flujo fijo para cualquier tarea no trivial. No repite las reglas de
`CLAUDE.md` (mandan si hay conflicto); aquí se explica en qué orden se
usan las skills/agents de `.claude/skills/` y `.claude/agents/`, y dónde
están los puntos donde el usuario debe aprobar antes de seguir.

## Flujo

```
1. Investigación (solo lectura)
2. Usuario aprueba la(s) decisión(es) de negocio
3. Implementación mínima
4. Reviewer(s) independiente(s)
5. Tests de regresión
6. Usuario aprueba el commit
7. Commit local
8. Usuario aprueba el push
9. Push
10. Usuario aprueba el deploy
11. Backup / deploy / post-check
```

| Paso | Skill/agent | Punto de parada |
|---|---|---|
| 1. Investigación | `gestorpro-investigar` | Entrega evidencia + causa raíz; NO avanza sin aprobación de alcance. |
| 2. Aprobación de negocio | — (gate del usuario) | Cualquier decisión de `docs/DECISIONES.md` que no esté ya cerrada se pregunta aquí, no se asume. |
| 3. Implementación | `gestorpro-implementar` | Cambio mínimo dentro del alcance aprobado; corre su propia verificación. |
| 4. Review | `gestorpro-revisar` (dispara el/los reviewer de `.claude/agents/` según el área — ver tabla en la skill) | Entrega tabla BLOCKER/HIGH/MEDIUM/LOW; NO corrige nada. |
| 5. Regresión | `gestorpro-e2e` y/o `npm test`/`npm run typecheck` del paquete tocado | Reporta verde/rojo real, sin inventar resultados. |
| 6. Aprobación de commit | — (gate del usuario) | Ver el diff final antes de comitear, no después. |
| 7. Commit local | `gestorpro-task-close` prepara el candidato; el commit en sí sigue la regla autónoma de `CLAUDE.md` (un tema por commit, mensaje en español). | — |
| 8. Aprobación de push | — (gate del usuario, una vez por tarea) | Sin esto, no se ejecuta `git push`. |
| 9. Push | `gestorpro-release` (paso 3 de su checklist) | — |
| 10. Aprobación de deploy | — (gate del usuario, independiente de la de push) | Sin esto, no se ejecuta `deploy.sh`. |
| 11. Backup/deploy/post-check | `gestorpro-release` (pasos 2, 4 y 5) | Post-check debe confirmar hash local = `origin/main` = VPS antes de dar la tarea por `DEPLOYED`. |

## Reglas del flujo

- **No saltar pasos silenciosamente.** Si una tarea no llega a producción,
  se detiene en el paso que le corresponda (p. ej. `IMPLEMENTED` sin
  commit) — no se fuerza a pasar por push/deploy porque "ya se hizo antes".
- **Cada aprobación es de ESTA tarea.** Una autorización de push/deploy de
  una tarea anterior no cubre la actual, salvo que el usuario diga
  explícitamente "puedes seguir libre en esta tarea" (y ahí aplica solo
  dentro de esa tarea, por regla de `CLAUDE.md`).
- **Producción y VPS**: cualquier paso que toque el servidor de producción
  (ver `CLAUDE.md` para el destino real) requiere confirmación de Jim ANTES,
  sin excepción — esto no lo relaja ninguna skill.
- **Incidentes rompen el flujo lineal.** Si en cualquier punto aparece un
  síntoma de producción (no un cambio planeado), se sale de este flujo y se
  usa `gestorpro-incidente` — investigación de solo lectura primero,
  contención después, nunca una corrección directa sobre datos de
  producción.
- **El task doc (`docs/tasks/<slug>.md`) es el registro del avance.** Cada
  paso completado actualiza su `Estado de fase` y su sección `CURRENT` (ver
  `docs/tasks/README.md`); el flujo de arriba describe el ORDEN, el task doc
  describe el ESTADO real de una tarea concreta en ese orden.

## Fuera de este flujo

- `gestorpro-ui-audit`: auditoría de UI independiente, puede correr en
  cualquier punto (antes de cerrar un cambio visual, o como chequeo suelto)
  sin ser parte de la secuencia lineal.
- `gestorpro-incidente`: ver arriba, rompe el flujo lineal a propósito.
