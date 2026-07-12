---
name: gestorpro-e2e
description: Ejecuta E2E de GestorPro reutilizando la skill global e2e-qa-playwright, añadiendo la matriz de roles/tenant y los escenarios financieros propios del dominio (gasto, corrección/reverso, cierre de venta, pago a proveedor). Distingue escritura en local de smoke de solo lectura en producción. Usar para verificar que un cambio no rompió un flujo real.
---

# gestorpro-e2e

## Cuándo usar

Verificar que un flujo o un cambio no rompió nada end-to-end: local con
escritura, o smoke de solo lectura en producción.

## Entrada requerida

- Entorno objetivo: local/dev o producción.
- Alcance: qué flujo o pantalla (o "todo" para regresión general).

## Pasos

1. Invocar la skill global `e2e-qa-playwright` (vía `Skill`) — no reinventar
   el runner; GestorPro ya tiene Playwright configurado
   (`frontend/package.json`: `e2e`, `e2e:smoke`, `e2e:full`, `e2e:readonly`).
2. Añadir el contexto propio de GestorPro que la skill genérica no conoce:
   - Matriz de roles: administrador / supervisor / empleado, y roles
     operativos (cajera/verificador) que son snapshot string, no permiso del
     sistema.
   - Aislamiento multi-tenant: repetir el flujo con empresa A y empresa B,
     confirmar 404/0-filas cruzado, nunca datos ajenos.
   - Escenarios financieros: registrar gasto, corrección/reverso, cierre de
     venta diaria, pago a proveedor — con foco en que no se pueda
     doble-corregir ni sobrepagar.
3. En producción: usar `e2e:readonly` (o el modo equivalente), nunca activar
   escritura.

## Prohibido

- Cualquier escritura contra producción.
- Modificar código de negocio para que un test pase.
- Reportar en verde algo no corrido.

## Salida estándar

Mismo formato que `e2e-qa-playwright` (total/passed/skipped/flaky/failed +
clasificación de fallos) más una sección "GestorPro": aislamiento tenant
confirmado sí/no, roles cubiertos, escenarios financieros cubiertos.

## Punto de parada

Al entregar el reporte. Desplegar es tarea de `gestorpro-release`, no de esta
skill.
