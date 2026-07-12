---
name: gestorpro-implementar
description: Implementa el cambio mínimo dentro de un alcance ya aprobado en GestorPro, sin refactors oportunistas, y corre la verificación relevante al terminar. Usar después de que gestorpro-investigar o el usuario aprobó explícitamente qué debe cambiar. No decide el alcance por su cuenta.
---

# gestorpro-implementar

## Cuándo usar

Cuando ya existe un alcance aprobado (por el usuario, o salido de
`gestorpro-investigar` con luz verde explícita) y hay que escribir el cambio
mínimo que lo resuelve.

## Entrada requerida

- Alcance aprobado: qué debe cambiar y qué NO.
- Archivos/áreas permitidas (si el usuario o el task doc los especificó).
- Decisiones de negocio ya cerradas que apliquen (`docs/DECISIONES.md`).

## Pasos

1. Releer el alcance aprobado antes de escribir una línea; si es ambiguo,
   preguntar — no interpretar a favor de hacer más.
2. Implementar el cambio mínimo. Sin refactors oportunistas, sin tocar código
   no relacionado aunque "de paso" se pudiera mejorar.
3. Seguir las reglas de dominio/seguridad/integridad de `CLAUDE.md` (Decimal
   para dinero, `usuarioId` del JWT, tenant fail-closed, inmutabilidad de
   `Fichaje`/`Correccion`/`Auditoria`).
4. Ejecutar la verificación relevante al área tocada (no la suite completa por
   sistema): `npm run typecheck`/`npm test` en backend o frontend, `npm run
   build` si aplica.
5. Si la verificación falla, corregir dentro del mismo alcance; si falla 3
   veces seguidas por la misma causa, parar y reportar (regla global de
   `CLAUDE.md`).

## Prohibido

- Ampliar el alcance sin permiso explícito.
- Mezclar feature/fix/refactor/test en el mismo cambio.
- Introducir abstracciones o dependencias nuevas no pedidas.
- `git commit`/`push`/deploy (eso es `gestorpro-task-close` / `gestorpro-release`).

## Salida estándar

- Resumen de cambios por archivo:línea.
- Comandos de verificación ejecutados y su resultado real (no inventar "pasó"
  sin haberlo corrido).
- Alcance NO tocado, explícito, si algo relacionado quedó fuera a propósito.

## Punto de parada

Al terminar la implementación y su verificación. No sigue automáticamente a
`gestorpro-revisar`/commit: eso lo decide el usuario o el flujo de
`docs/claude-code/WORKFLOW.md`.
