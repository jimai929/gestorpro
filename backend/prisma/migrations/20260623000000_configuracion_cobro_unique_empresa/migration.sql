-- Fase 3 (slice §7.2.4/I3): configuracion_cobro es la fila UNICA de config por
-- empresa. Anadir @@unique([empresaId]) lo fuerza a nivel BD (fail-closed): una
-- empresa no puede tener dos filas de config. La tabla YA tiene empresa_id NOT
-- NULL + FK + RLS directa (Olas 1/2/3a/3b + Fase 5); esto solo anade la unicidad.
--
-- global->per-empresa NO aplica aqui: la tabla NUNCA tuvo unique global (nace en
-- 20260525001812 sin @unique). Es ADDITIVE PURO: solo CREATE, sin DROP de indice
-- previo, sin ventana sin unicidad.
--
-- Pre-check (debe dar 0 filas antes de migrar en cada entorno con datos):
--   SELECT empresa_id, count(*) FROM configuracion_cobro GROUP BY 1 HAVING count(*)>1;
-- Verificado en dev (2026-06-23, rol migrador BYPASSRLS): 0 filas.

CREATE UNIQUE INDEX "configuracion_cobro_empresa_id_key" ON "configuracion_cobro"("empresa_id");
