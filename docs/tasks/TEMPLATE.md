<!--
Plantilla de task doc — copiar a docs/tasks/<slug>.md al empezar una tarea.
Ver docs/tasks/README.md para el ciclo de vida completo y qué va aquí vs
qué va en CLAUDE.md.
-->

# <Título de la tarea>

## Contexto

<Por qué existe esta tarea: quién la pidió, qué problema resuelve, de dónde
sale (bug reportado, decisión de producto, hallazgo de un reviewer).>

## Estado actual

<Qué es cierto hoy, antes de este cambio. Hechos verificables, no
suposiciones — si algo no se comprobó, decirlo.>

## Objetivo

<Qué debe ser cierto cuando la tarea termine. Concreto y verificable.>

## Fuera de alcance

<Qué NO se va a tocar en esta tarea aunque esté relacionado. Evita el scope
creep silencioso.>

## Decisiones de negocio

<Decisiones que solo Jim puede tomar y que ya se tomaron para esta tarea
(fecha + decisión). Si una decisión sigue pendiente, listarla como
pendiente, no como si ya estuviera resuelta.>

## Archivos permitidos

<Rutas o patrones que esta tarea puede modificar. Si la tarea tiene un
alcance de Claude Code (skills/agents/settings) en vez de código de negocio,
decirlo explícitamente aquí también.>

## Prohibido

<Qué está explícitamente fuera de límites para esta tarea: rutas, acciones
(commit/push/deploy/SSH), operaciones destructivas.>

## Criterios de aceptación

<Lista verificable de "esto se considera terminado cuando...". No
ambiguo.>

## Pruebas obligatorias

<Qué comandos de verificación deben correr y pasar antes de COMMITTED
(típicamente `npm test`/`npm run typecheck`/`npm run build` en el paquete
tocado, o la suite E2E relevante). Si aplica, qué reviewer(s) de
`.claude/agents/` deben pasar sin BLOCKER.>

## Riesgos

<Qué podría salir mal, y cómo se mitiga o por qué se acepta el riesgo.>

## Estado de fase

`DRAFT` — actualizar a medida que avanza:
`DRAFT → INVESTIGATED → APPROVED → IMPLEMENTED → REVIEWED → COMMITTED →
PUSHED → DEPLOYED → VERIFIED → CLOSED`

## Estado de commit/push/deploy

- Commit local: <hash o "pendiente">
- Push a origin: <sí/no + fecha, o "pendiente autorización">
- Deploy a VPS: <sí/no + fecha, o "pendiente autorización">

## CURRENT

<Resumen de una sola sección que refleja el estado VIGENTE de la tarea en
este momento — se reescribe en cada actualización, no se acumula histórico
aquí (el histórico, si hace falta, va en el cuerpo de arriba). Esta es la
sección que alguien lee primero para saber "¿en qué quedó esto?".>
