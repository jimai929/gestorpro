-- El numero de caja se RECICLA: la unicidad de (sede, numero) pasa de total a
-- PARCIAL sobre las cajas ACTIVAS. Al dar de baja una caja, su numero queda
-- libre para reusarse en una nueva. Las inactivas no cuentan para la unicidad.
--
-- SQL manual (no gestionado por el schema declarativo: Prisma no soporta unique
-- parcial; igual que uq_venta_normal). Si una futura `prisma migrate dev`
-- intenta dropearlo por drift, hay que conservarlo a mano.

DROP INDEX "uq_caja_sede_numero";

CREATE UNIQUE INDEX "uq_caja_sede_numero_activa"
    ON "caja" ("sede_id", "numero")
    WHERE "activo" = true;
