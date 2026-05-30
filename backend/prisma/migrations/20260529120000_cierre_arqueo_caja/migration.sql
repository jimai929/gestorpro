-- Cierre de caja por turno con arqueo: el cierre gana turno/caja/cerradoPor y
-- horas descriptivas; el desglose por tipo (efectivo, tarjeta, Yappy, lotería)
-- vive en `detalle_cierre`. La unicidad pasa de (sede, fecha) a
-- (sede, fecha, turno, caja). Datos previos (demo) se rellenan con un arqueo de
-- una sola línea de efectivo igual al total.

-- CreateEnum
CREATE TYPE "TurnoVenta" AS ENUM ('manana', 'tarde', 'noche');

-- CreateEnum
CREATE TYPE "TipoArqueo" AS ENUM ('efectivo', 'tarjeta', 'yappy', 'loteria');

-- AlterTable: nuevas columnas del cierre (nullables primero, para backfillear)
ALTER TABLE "venta_diaria"
    ADD COLUMN "turno"         "TurnoVenta",
    ADD COLUMN "caja"          VARCHAR(20),
    ADD COLUMN "cerrado_por"   TEXT,
    ADD COLUMN "hora_apertura" TEXT,
    ADD COLUMN "hora_cierre"   TEXT;

-- CreateTable: líneas del arqueo
CREATE TABLE "detalle_cierre" (
    "id" UUID NOT NULL,
    "venta_id" UUID NOT NULL,
    "tipo_arqueo" "TipoArqueo" NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "detalle_cierre_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "detalle_cierre_venta_id_tipo_arqueo_key" ON "detalle_cierre"("venta_id", "tipo_arqueo");

-- CreateIndex
CREATE INDEX "detalle_cierre_venta_id_idx" ON "detalle_cierre"("venta_id");

-- AddForeignKey
ALTER TABLE "detalle_cierre" ADD CONSTRAINT "detalle_cierre_venta_id_fkey" FOREIGN KEY ("venta_id") REFERENCES "venta_diaria"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill de cierres existentes (datos demo pre-producción): valores por
-- defecto de turno/caja/cerradoPor y un arqueo de una sola línea de efectivo
-- igual al total, para sostener la invariante total = suma del arqueo.
UPDATE "venta_diaria"
   SET "turno" = 'manana', "caja" = '1', "cerrado_por" = 'migración'
 WHERE "turno" IS NULL;

INSERT INTO "detalle_cierre" ("id", "venta_id", "tipo_arqueo", "monto")
SELECT gen_random_uuid(), "id", 'efectivo', "monto" FROM "venta_diaria";

-- Ahora sí, NOT NULL en los campos obligatorios del cierre.
ALTER TABLE "venta_diaria"
    ALTER COLUMN "turno" SET NOT NULL,
    ALTER COLUMN "caja" SET NOT NULL,
    ALTER COLUMN "cerrado_por" SET NOT NULL;

-- ─── SQL manual (no gestionado por Prisma) ──────────────────────────────────
-- La unicidad del cierre pasa de (sede, fecha) a (sede, fecha, turno, caja):
-- una caja cierra una vez por turno. Los asientos de corrección quedan EXENTOS
-- (por el WHERE), igual que antes.
DROP INDEX "uq_venta_normal";
CREATE UNIQUE INDEX "uq_venta_normal"
    ON "venta_diaria" ("sede_id", "fecha_operacion", "turno", "caja")
    WHERE "tipo" = 'normal';

-- CHECK donde aplica: una línea del arqueo nunca es negativa y la caja no es
-- una cadena vacía.
ALTER TABLE "detalle_cierre"
    ADD CONSTRAINT "chk_detalle_monto_no_negativo" CHECK ("monto" >= 0);
ALTER TABLE "venta_diaria"
    ADD CONSTRAINT "chk_venta_caja_no_vacia" CHECK (length(trim("caja")) > 0);
