---
name: gestorpro-revisar
description: Selecciona y ejecuta el/los reviewer(s) adversariales correctos de GestorPro según el área tocada (dinero, tenant, migración, API, UI, E2E, release, flujo de usuario) y consolida los hallazgos en una tabla única de severidad. No corrige nada por su cuenta. Usar después de implementar, antes de proponer un commit.
---

# gestorpro-revisar

## Cuándo usar

Después de implementar, antes de proponer un commit. Siempre que el cambio
toque dinero, permisos, tenant/RLS, migraciones, contrato API, UI o un flujo
E2E relevante.

## Entrada requerida

- El diff a revisar (o el alcance de la tarea).
- Qué áreas toca, para elegir el/los reviewer(s) correctos.

## Pasos

1. Mapear el diff a reviewer(s) según el área:
   - Dinero/correcciones/proveedores → `finance-reviewer`
   - Tenant/RLS/empresaId → `tenant-security-reviewer`
   - `prisma/migrations/**` → `migration-reviewer`
   - DTO/rutas/status codes → `api-contract-reviewer`
   - UI/tema/formularios/accesibilidad → `ux-accessibility-reviewer`
   - Specs E2E o cobertura de roles/tenant → `e2e-gap-reviewer`
   - Proceso de despliegue → `release-reviewer`
   - Flujos de usuario/navegación → `product-workflow-reviewer`
   - Cualquier otra cosa / errores silenciados generales → `revisor`
2. Invocar cada reviewer aplicable (vía `Agent`) con el diff/alcance real, no
   un resumen editorializado.
3. Consolidar hallazgos sin filtrar ni suavizar severidad.

## Prohibido

- Arreglar los hallazgos uno mismo dentro de esta skill (eso es una nueva
  pasada de `gestorpro-implementar`).
- Bajar la severidad de un hallazgo para que "pase".
- Inventar que se corrió un reviewer que no se corrió.

## Salida estándar

Tabla única, más severa primero:

| Severidad | Reviewer | Archivo:línea | Hallazgo | Comprobado/Sospecha |
|---|---|---|---|---|

BLOCKER/HIGH/MEDIUM/LOW. Cada fila cita el reviewer que lo encontró.

## Punto de parada

Entregar la tabla y esperar que el usuario decida qué corregir antes de seguir
a commit.
