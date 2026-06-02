-- El catálogo de cajas físicas queda OBSOLETO: el cierre se identifica por la
-- cajera (empleado con rol operativo), no por un registro físico. Se elimina la
-- tabla; `DROP TABLE` arrastra su índice parcial `uq_caja_sede_numero_activa` y
-- su FK a sede. Migración de DROP nueva — no se edita el histórico ya aplicado.

-- DropTable
DROP TABLE "caja";
