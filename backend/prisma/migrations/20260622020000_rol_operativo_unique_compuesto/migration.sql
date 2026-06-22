-- Fase 5 (slice de Fase 3): rol_operativo.clave pasa de UNICA GLOBAL a UNICA POR
-- EMPRESA, ahora que rol_operativo tiene empresa_id (Ola 3a/3b). Permite que cada
-- empresa tenga su 'cajera'/'verificador' sin colisionar entre tenants (era un
-- riesgo de aislamiento: el upsert por clave global devolvia la fila de OTRA empresa).
--
-- Se CREA el indice compuesto ANTES de dropear el global (doc §7.2; una migracion =
-- una transaccion en Postgres, asi que no hay ventana sin unicidad). Datos
-- existentes: tras el backfill (Ola 2) todo esta en la empresa default con claves
-- unicas, asi que el compuesto se satisface sin conflicto (seguro en el VPS).

-- CreateIndex
CREATE UNIQUE INDEX "rol_operativo_empresa_id_clave_key" ON "rol_operativo"("empresa_id", "clave");

-- DropIndex
DROP INDEX "rol_operativo_clave_key";
