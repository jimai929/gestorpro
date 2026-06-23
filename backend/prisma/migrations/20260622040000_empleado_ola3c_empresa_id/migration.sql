-- Fase 3 Ola 3c: empleado pasa de "hereda" a tabla DIRECTA con empresa_id propio.
-- Da unicidad per-empresa de numero/qr_token a nivel BD (fail-closed) y RLS directa.
-- Etapas Ola 1->2->3 dentro de la misma transaccion. La FK COMPUESTA
-- (sede_id, empresa_id) -> sede(id, empresa_id) fuerza empleado.empresa_id =
-- sede.empresa_id a nivel motor (sede.id es PK), reemplazando cualquier CHECK/trigger.
--
-- Nombres de indice/constraint IDENTICOS a `prisma migrate diff`. Dos calibraciones
-- frente al SQL auto de Prisma, ambas seguras y necesarias:
--   1) Prisma genera `ADD COLUMN empresa_id NOT NULL DEFAULT NULLIF(...)` en un paso;
--      eso FALLARIA porque durante `migrate deploy` no hay GUC -> el DEFAULT es NULL ->
--      viola NOT NULL en las filas existentes. Se hace en etapas: nullable -> backfill
--      desde la sede -> SET NOT NULL + DEFAULT.
--   2) Los uniques compuestos se CREAN antes de DROPear los globales (§7.2; una
--      migracion = una transaccion, sin ventana sin unicidad).
-- El resto (sede_id_empresa_id_key como UNIQUE INDEX, FK compuesta, FK a empresa,
-- DROP de la FK simple) coincide con Prisma. global->compuesto es RELAJACION.

-- ── Ola 1: ADD COLUMN nullable (metadata-only, no reescribe filas) ───────────
ALTER TABLE "empleado" ADD COLUMN "empresa_id" UUID;

-- ── Ola 2: backfill idempotente desde la sede (empresa_id = sede.empresa_id) ──
UPDATE "empleado" e
   SET "empresa_id" = s."empresa_id"
  FROM "sede" s
 WHERE s."id" = e."sede_id" AND e."empresa_id" IS NULL;

-- Guard fail-closed: abortar si quedo algun NULL (sede sin empresa_id no deberia
-- existir tras Ola 3b; si pasa, NO endurecer a ciegas).
DO $$
DECLARE nulos bigint;
BEGIN
  SELECT count(*) INTO nulos FROM "empleado" WHERE "empresa_id" IS NULL;
  IF nulos > 0 THEN
    RAISE EXCEPTION 'Ola3c abortada: % empleados con empresa_id NULL tras backfill', nulos;
  END IF;
END $$;

-- ── Ola 3: endurecer ─────────────────────────────────────────────────────────
ALTER TABLE "empleado"
  ALTER COLUMN "empresa_id" SET NOT NULL,
  ALTER COLUMN "empresa_id" SET DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid;

-- FK a empresa (RESTRICT), como las demas tablas directas (Ola 3a)
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_empresa_id_fkey"
  FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Uniques compuestos: CREAR antes de DROPear los globales (§7.2)
CREATE UNIQUE INDEX "empleado_empresa_id_numero_key"   ON "empleado"("empresa_id", "numero");
CREATE UNIQUE INDEX "empleado_empresa_id_qr_token_key" ON "empleado"("empresa_id", "qr_token");
DROP INDEX "empleado_numero_key";
DROP INDEX "empleado_qr_token_key";

-- ── Coherencia empleado.empresa_id = sede.empresa_id (FK compuesta declarativa) ─
-- sede.id ya es PK; este UNIQUE INDEX (id, empresa_id) habilita la FK compuesta como
-- destino. Reemplaza la FK simple sede_id->sede(id) (queda subsumida).
CREATE UNIQUE INDEX "sede_id_empresa_id_key" ON "sede"("id", "empresa_id");
ALTER TABLE "empleado" DROP CONSTRAINT "empleado_sede_id_fkey";
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_sede_id_empresa_id_fkey"
  FOREIGN KEY ("sede_id", "empresa_id") REFERENCES "sede"("id", "empresa_id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
