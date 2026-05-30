-- Catálogo de cajas registradoras por sede. Tabla NUEVA: no hay datos previos
-- que migrar. El seed no crea cajas, y el `caja` de `venta_diaria` es un texto
-- independiente (snapshot), NO esta tabla. El admin crea sus cajas desde la app.

-- CreateTable
CREATE TABLE "caja" (
    "id" UUID NOT NULL,
    "sede_id" UUID NOT NULL,
    "numero" VARCHAR(20) NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "caja_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: una caja por (sede, numero); la "Caja 1" de una sede no choca
-- con la de otra.
CREATE UNIQUE INDEX "uq_caja_sede_numero" ON "caja"("sede_id", "numero");

-- CreateIndex
CREATE INDEX "caja_sede_id_idx" ON "caja"("sede_id");

-- AddForeignKey
ALTER TABLE "caja" ADD CONSTRAINT "caja_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
