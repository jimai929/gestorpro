---
name: gestorpro-investigar
description: Investigación de solo lectura en GestorPro — reúne evidencia (archivo:línea), causa raíz e impacto (tenant/dinero/permisos) sin modificar nada. Usar cuando el usuario reporta un bug, pregunta "por qué pasa X", o antes de cualquier cambio para entender el alcance real antes de tocar código. Primer paso obligatorio del flujo de docs/claude-code/WORKFLOW.md.
---

# gestorpro-investigar

## Cuándo usar

Antes de tocar código: bug reportado, comportamiento dudoso, pregunta de "por qué
pasa X", o para preparar el alcance de una tarea nueva.

## Entrada requerida

- Síntoma o pregunta concreta.
- Alcance sugerido si el usuario lo tiene (área, pantalla, endpoint, tabla).

## Pasos

1. Leer el código relevante (`Read`/`Grep`/`Glob`) y, si aplica, `git log`/`git
   blame` de solo lectura.
2. Reconstruir el flujo real: request → ruta → servicio → Prisma/RLS →
   respuesta, o el flujo de UI equivalente.
3. Diferenciar evidencia comprobada (archivo:línea, log, test que reproduce) de
   hipótesis sin confirmar.
4. Evaluar alcance: ¿toca dinero, tenant/RLS, permisos, datos inmutables
   (`Fichaje`/`Correccion`/`Auditoria`)? Si sí, marcarlo explícitamente.
5. Formular la causa raíz más probable y las alternativas descartadas (y por
   qué se descartaron).

## Prohibido

- `Edit`/`Write`, `git commit`, instalar dependencias, ejecutar migraciones o
  cualquier comando con efecto.
- "Probar" una hipótesis modificando código temporalmente.
- Proponer el fix como si ya estuviera implementado.

## Salida estándar

- Evidencia: archivo:línea por cada afirmación.
- Causa raíz (o las 2-3 hipótesis más probables si no hay evidencia
  concluyente).
- Alcance/impacto: qué se rompe, qué tenant/rol/flujo de dinero toca.
- Severidad estimada (BLOCKER/HIGH/MEDIUM/LOW).
- Próximo paso recomendado (sin ejecutarlo).

## Punto de parada

Entregar el informe y esperar que el usuario apruebe el alcance antes de pasar
a `gestorpro-implementar`.
