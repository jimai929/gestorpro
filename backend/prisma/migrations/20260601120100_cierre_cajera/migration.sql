-- El cierre se identifica por la CAJERA (empleado con rol operativo), no por un
-- registro físico. Se renombra `caja` -> `cajera` (conserva los datos legacy:
-- texto libre como '1', '2', 'yoany', '9 yon') y se amplía a 120 para el
-- snapshot legible "E001 - Nombre Apellido". `cajera` y `cerrado_por` siguen
-- siendo SNAPSHOT string, NO FK. Se recrea el índice único parcial y el CHECK
-- sobre la columna renombrada.

-- RenameColumn (preserva los datos existentes)
ALTER TABLE "venta_diaria" RENAME COLUMN "caja" TO "cajera";

-- Quitar el índice parcial y el CHECK que dependen de la columna antes de
-- ampliar su tipo, para recrearlos limpios con el nombre nuevo.
DROP INDEX "uq_venta_normal";
ALTER TABLE "venta_diaria" DROP CONSTRAINT "chk_venta_caja_no_vacia";

-- AlterColumn: ampliar para el snapshot legible.
ALTER TABLE "venta_diaria" ALTER COLUMN "cajera" TYPE VARCHAR(120);

-- ─── SQL manual (no gestionado por Prisma) ──────────────────────────────────
-- Un cierre 'normal' por (sede, fecha, turno, cajera): una cajera cierra una vez
-- por turno. Las correcciones (reverso/correccion) quedan EXENTAS (por el WHERE).
CREATE UNIQUE INDEX "uq_venta_normal"
    ON "venta_diaria" ("sede_id", "fecha_operacion", "turno", "cajera")
    WHERE "tipo" = 'normal';

-- La cajera del cierre no puede ser una cadena vacía.
ALTER TABLE "venta_diaria"
    ADD CONSTRAINT "chk_venta_cajera_no_vacia" CHECK (length(trim("cajera")) > 0);
