# Categorías de gasto — gestión flexible por empresa

Cada empresa gestiona su PROPIO catálogo de categorías de gasto: **flexible, sin límite de
cantidad, sin catálogo global**. `Gasto.categoriaId` es obligatorio; el catálogo es
`CategoriaGasto` con `@@unique([empresaId, nombre])` (mismo nombre permitido en empresas
distintas; único dentro de una). SIN migration: el modelo ya tiene `activo`.

## Principios
- Flexible por empresa; cada una crea las que quiera.
- Nombre único POR empresa; distintas empresas pueden repetir nombre.
- Los 4 por defecto (`Servicios públicos`, `Alquiler`, `Mantenimiento`, `Pago a empleado`)
  se siembran al crear la empresa (ver `EMPRESA_DEFAULTS_BACKFILL.md`) y no se pueden borrar
  físicamente; las personalizadas conviven con ellas.
- **Soft delete** (`activo=false`), NUNCA físico: los gastos históricos la referencian por FK.
- Invariante: cada empresa conserva ≥1 categoría **activa con `esPagoEmpleado=true`** (la base
  del cobro de horas extra). No se puede desactivar / borrar / quitar el flag a la última.
  *Residuo conocido y ACEPTADO*: el chequeo usa `count()` sin lock (READ COMMITTED), así que dos
  operaciones de admin CONCURRENTES sobre las dos últimas podrían dejar 0. Es TOCTOU de baja
  probabilidad y **auto-recuperable**: el consumidor (`cobro.service.pagarCobro`) falla FUERTE con
  un error claro (no corrompe dinero ni datos) y un admin reactiva/crea otra. No se añade lock por
  no complicar una operación tan poco concurrente.

## API (`backend/src/finanzas/gastos`)
| Endpoint | Rol | Comportamiento |
|---|---|---|
| `GET /categorias-gasto` | autenticado | Solo ACTIVAS (select del formulario de gasto) |
| `GET /categorias-gasto?incluirInactivas=true` | supervisor/admin | Activas + inactivas (gestión). Empleado → **403** |
| `POST /categorias-gasto` | supervisor/admin | Crea; si el nombre coincide con una **inactiva**, la **reactiva** (`reactivada:true`) en vez de duplicar; con una **activa** → 409 |
| `PATCH /categorias-gasto/:id` | supervisor/admin | `nombre` / `esPagoEmpleado` / `activo`. Otra empresa → 404; duplicado → 409; invariante → 409 |
| `DELETE /categorias-gasto/:id` | supervisor/admin | Baja LÓGICA (`activo=false`). Otra empresa → 404; invariante → 409 |

Seguridad: el DTO NO expone `empresaId`; el body no lo acepta (se descarta). `create` deriva
`empresa_id` del GUC `app.empresa_id` (nunca del body). Aislamiento por **RLS + txEmpresa**
(no se relaja ninguna policy). `esPagoEmpleado` cambiable por PATCH: NO altera gastos ya
registrados (su coherencia se validó al crearlos), solo afecta a los futuros.

## Frontend
- **Pantalla de gestión** `/categorias-gasto` (sidebar Finanzas, solo admin/supervisor; un
  empleado que entre por URL es redirigido). Lista, crear/reactivar, editar (nombre +
  esPagoEmpleado), activar/desactivar, toggle "mostrar inactivas", aviso de reactivación.
- **Crear categoría inline** en el formulario de gasto (`FormularioGasto`): admin/supervisor
  pueden crear una categoría sin salir del formulario; se auto-selecciona y no se pierde lo
  ya escrito. Si el nombre reusa una inactiva, se reactiva y auto-selecciona (con aviso). El
  select de gasto solo muestra ACTIVAS.
- i18n es/en/zh completa (paridad verificada por `idiomas.test.ts`).

## Estado
- ✅ CRUD + soft delete + aislamiento + permisos + reactivar + invariante pago-a-empleado.
- ✅ **Crear categoría inline en el formulario de gasto** (ya NO es backlog).
- Tests: backend 27 (`test/finanzas/categorias.test.ts`) + gasto; frontend
  (`PantallaCategorias.test`, `FormularioGasto.test`).
- Sin schema/migration.

### Ideas futuras (no comprometidas)
- Reasignar gastos de una categoría a otra antes de desactivar (hoy la baja lógica basta).
- Búsqueda/paginación si un catálogo crece mucho.
