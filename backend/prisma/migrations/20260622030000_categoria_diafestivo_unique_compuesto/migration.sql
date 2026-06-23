-- Fase 3 (slice): categoria_gasto.nombre y dia_festivo.fecha pasan de UNICA GLOBAL
-- a UNICA POR EMPRESA, ahora que ambas tienen empresa_id NOT NULL (Ola 1/2/3). Era
-- un riesgo de aislamiento: el upsert por la clave global devolvia/colisionaba con la
-- fila de OTRA empresa. Mismo patron que rol_operativo (20260622020000).
--
-- Se CREA el indice compuesto ANTES de DROPear el global (doc §7.2; una migracion =
-- una transaccion en Postgres, asi que no hay ventana sin unicidad y un fallo del
-- CREATE revierte el DROP). Los nombres/definiciones de indice son identicos a los que
-- genera `prisma migrate diff`; solo se reordena a "crear antes de borrar". Datos
-- existentes: tras el backfill (Ola 2) todo esta en la empresa default con valores
-- unicos, y global->compuesto es RELAJACION, asi que el compuesto se satisface sin
-- conflicto (seguro en el VPS).

-- categoria_gasto
CREATE UNIQUE INDEX "categoria_gasto_empresa_id_nombre_key" ON "categoria_gasto"("empresa_id", "nombre");
DROP INDEX "categoria_gasto_nombre_key";

-- dia_festivo
CREATE UNIQUE INDEX "dia_festivo_empresa_id_fecha_key" ON "dia_festivo"("empresa_id", "fecha");
DROP INDEX "dia_festivo_fecha_key";
