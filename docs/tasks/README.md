# Task docs — GestorPro

Un archivo por tarea en `docs/tasks/<slug>.md`, creado a partir de
`TEMPLATE.md`. Un task doc es el estado de trabajo de UNA tarea concreta: se
crea al empezarla, se actualiza en cada fase, y se archiva al cerrarla.

## Qué va en un task doc vs qué va en CLAUDE.md

- **Task doc**: hechos temporales de ESTA tarea — qué se decidió para este
  cambio puntual, qué archivos están en juego ahora mismo, qué falta
  probar, en qué fase del ciclo de vida está. Vive mientras la tarea está
  abierta.
- **CLAUDE.md**: reglas permanentes que aplican siempre, sin importar la
  tarea (reglas de dominio, seguridad, integridad de datos, git). Si algo
  aprendido en una tarea es una regla de largo plazo (no solo válida para
  ese cambio), se propone para CLAUDE.md — no se deja acumulado en un task
  doc cerrado.

Esta separación importa porque `CLAUDE.md` se lee en cada tarea nueva; un
task doc cerrado no. Un dato temporal escrito en CLAUDE.md nunca se
actualiza y queda mintiendo; una regla permanente escrita solo en un task
doc se pierde en cuanto la tarea se archiva.

## Ciclo de vida

```
DRAFT → INVESTIGATED → APPROVED → IMPLEMENTED → REVIEWED → COMMITTED
      → PUSHED → DEPLOYED → VERIFIED → CLOSED
```

- **DRAFT**: el task doc existe, aún no hay investigación.
- **INVESTIGATED**: `gestorpro-investigar` (o equivalente) entregó evidencia,
  causa raíz y alcance.
- **APPROVED**: el usuario aprobó explícitamente el alcance y las decisiones
  de negocio necesarias.
- **IMPLEMENTED**: `gestorpro-implementar` terminó el cambio mínimo y su
  verificación.
- **REVIEWED**: `gestorpro-revisar` (con el/los reviewer correcto)
  entregó su tabla de hallazgos y no quedan BLOCKER sin resolver.
- **COMMITTED**: hay un commit local (ver `git log`).
- **PUSHED**: el commit llegó a `origin` (con autorización explícita de esa
  tarea).
- **DEPLOYED**: el cambio está en el VPS de producción (con autorización
  explícita de deploy, backup verificado, post-check hecho).
- **VERIFIED**: el post-check de producción confirmó que el cambio funciona
  ahí (no solo en local).
- **CLOSED**: la tarea terminó; el task doc se archiva (ver abajo).

No hay que pasar por todas las fases si la tarea no llega a producción —
una tarea que se queda en `IMPLEMENTED`/`REVIEWED` sin commit sigue siendo
válida; simplemente no avanza más.

## Al cerrar una tarea

1. Verificar que el estado real coincide con lo escrito (no cerrar con
   fases marcadas que no ocurrieron).
2. Si algo aprendido es una regla permanente, proponerla para `CLAUDE.md`
   explícitamente — no asumir que quedará "recordada" solo por estar en el
   task doc.
3. Mover el archivo a `docs/tasks/archivo/<slug>.md` (crear la carpeta si no
   existe) y marcar `CLOSED` en el estado de fase.
4. **No** volcar el estado temporal del task doc a la memoria de largo plazo
   del agente — solo hechos que sigan siendo verdad después de cerrada la
   tarea (y ya deberían estar en CLAUDE.md o en otro doc permanente, no en
   memoria como sustituto).

## Plantilla

Ver `TEMPLATE.md`. Copiarla a `docs/tasks/<slug>.md` al empezar una tarea
nueva.
