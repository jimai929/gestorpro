---
name: gestorpro-task-close
description: Cierra una tarea de GestorPro — corre la verificación relevante, revisa el diff completo, identifica riesgos residuales, actualiza el task doc (docs/tasks/<slug>.md) y prepara el candidato de commit (mensaje + lista exacta de archivos). Nunca ejecuta commit/push/deploy por su cuenta. Usar al terminar el trabajo de una tarea.
---

# gestorpro-task-close

## Cuándo usar

Al terminar el trabajo de una tarea, antes de decidir si se comitea.

## Entrada requerida

- El task doc de referencia (`docs/tasks/<slug>.md`) si existe, o el alcance
  de la tarea en curso.

## Pasos

1. Correr la verificación relevante al área tocada (test/typecheck/build; no
   la suite completa por sistema salvo que el alcance lo pida).
2. Revisar el diff completo (`git status`, `git diff --stat`, `git diff
   --check`).
3. Identificar riesgos residuales (qué quedó pendiente, qué no se probó).
4. Actualizar el task doc: estado del ciclo de vida, sección `CURRENT` con el
   resumen vigente.
5. Preparar el candidato de commit: mensaje propuesto (español, un solo tema)
   y lista EXACTA de archivos a stagear.

## Prohibido

- Ejecutar `git commit`/`push`/deploy automáticamente.
- Dar por corrido lo que no se corrió.
- Dejar el task doc con un estado que no refleja la realidad.

## Salida estándar

- Resumen de verificación (comando + resultado real).
- `git diff --stat`.
- Riesgos residuales.
- Mensaje de commit propuesto.
- Lista exacta de archivos a stagear.

## Punto de parada

Antes de `git commit` (el usuario decide) y explícitamente antes de cualquier
push/deploy.
