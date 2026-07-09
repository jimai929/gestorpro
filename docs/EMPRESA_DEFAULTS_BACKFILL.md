# Directorios por defecto de una empresa + backfill de tenants

## Problema (raíz)

`Gasto.categoriaId` es **obligatorio** y `FormularioGasto` solo permite **elegir** una
`CategoriaGasto` existente (no crear una). Las categorías son un catálogo **por empresa**
(`@@unique([empresaId, nombre])`). Antes, los catálogos base solo se sembraban para la
empresa `default` (en `seed.ts`); `crearEmpresa` (alta de tenant de plataforma) **no
sembraba nada**. Resultado: cada empresa creada por plataforma nacía con **0 categorías,
0 roles operativos y 0 configuración de cobro** → no podía registrar gastos, y el pago de
cobros de horas extra (que exige una categoría `esPagoEmpleado`) también fallaba.
**Dead-lock de onboarding**, sin UI ni endpoint para desbloquearlo.

## Solución (sin migration)

Sin cambios de esquema. Una **fuente única** de defaults, reutilizada por seed, alta de
tenant y backfill:

- `backend/src/core/empresa/directorios-defaults.ts` → `sembrarDirectoriosEmpresa(cliente, empresaId)`
  (idempotente; escribe solo para ese `empresaId`).
- `crearEmpresa` la llama **en la misma transacción** del alta: si falla, todo el alta
  revierte (atomicidad). RLS: la tx corre con `app.bypass_tenant='on'` (bypass de
  plataforma, super-admin) y la policy `bypass_plataforma` permite el `WITH CHECK`.
- `seed.ts` usa la **misma** función para la empresa `default` (sin duplicar el catálogo).

### Qué se siembra por empresa

| Directorio | Contenido por defecto |
|---|---|
| `CategoriaGasto` | `Servicios públicos`, `Alquiler`, `Mantenimiento` (esPagoEmpleado=false) y **`Pago a empleado`** (esPagoEmpleado=true) |
| `RolOperativo` | `cajera`, `verificador` |
| `ConfiguracionCobro` | 1 fila con los defaults del modelo (80% cobrable, umbral B/. 100) |

## Backfill de tenants YA existentes

Script idempotente que **solo completa lo faltante** (no toca lo presente):
`backend/prisma/scripts/backfill-directorios-empresa.ts`. Corre como `gestorpro_migrador`
(BYPASSRLS), igual que el seed.

```bash
# En backend/. DRY-RUN (por defecto): reporta qué falta por empresa, NO escribe.
npm run backfill:directorios -- --dry-run

# APPLY: completa lo faltante (idempotente; correrlo 2 veces = mismo resultado).
npm run backfill:directorios -- --apply
```

### Procedimiento en PRODUCCIÓN (obligatorio, en orden)

La app NO se conecta a producción desde esta tarea. Cuando se autorice ejecutar el backfill
en el VPS:

1. **Backup**: `bash backup.sh` (rollback disponible).
2. **Dry-run**: `npm run backfill:directorios -- --dry-run` → guardar la salida.
3. **Revisión humana**: confirmar que la lista de empresas y faltantes es la esperada
   (solo tenants no sembrados; la `default` no debe aparecer).
4. **Apply**: `npm run backfill:directorios -- --apply`.
5. **Post-check**: re-correr `--dry-run` → debe decir *"Todas las empresas ya tienen sus
   directorios por defecto"*. Verificar que un tenant afectado ya puede crear un gasto.

Rollback: el backfill solo **añade** filas de catálogo por defecto (nunca modifica ni
borra); ante un problema, basta el backup del paso 1.

## No requiere migration

No hay cambios en `schema.prisma` ni en `prisma/migrations/`. Es código + datos
(seed/backfill idempotentes). `prisma migrate status` sigue sin pendientes.
