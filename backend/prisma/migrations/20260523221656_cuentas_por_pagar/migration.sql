-- CreateEnum
CREATE TYPE "TipoMovimiento" AS ENUM ('normal', 'reverso', 'correccion');

-- CreateTable
CREATE TABLE "proveedor" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "identificacion_fiscal" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compra" (
    "id" UUID NOT NULL,
    "proveedor_id" UUID NOT NULL,
    "sede_id" UUID NOT NULL,
    "numero_factura" TEXT NOT NULL,
    "monto_total" DECIMAL(12,2) NOT NULL,
    "fecha_emision" DATE NOT NULL,
    "fecha_vencimiento" DATE NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pago_proveedor" (
    "id" UUID NOT NULL,
    "compra_id" UUID NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha_pago" DATE NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL DEFAULT 'normal',
    "corrige_id" UUID,
    "motivo" TEXT,
    "usuario_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pago_proveedor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compra_sede_id_idx" ON "compra"("sede_id");

-- CreateIndex
CREATE UNIQUE INDEX "uq_compra_factura" ON "compra"("proveedor_id", "numero_factura");

-- CreateIndex
CREATE INDEX "pago_proveedor_compra_id_idx" ON "pago_proveedor"("compra_id");

-- AddForeignKey
ALTER TABLE "compra" ADD CONSTRAINT "compra_proveedor_id_fkey" FOREIGN KEY ("proveedor_id") REFERENCES "proveedor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compra" ADD CONSTRAINT "compra_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_proveedor" ADD CONSTRAINT "pago_proveedor_compra_id_fkey" FOREIGN KEY ("compra_id") REFERENCES "compra"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pago_proveedor" ADD CONSTRAINT "pago_proveedor_corrige_id_fkey" FOREIGN KEY ("corrige_id") REFERENCES "pago_proveedor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── SQL manual (no gestionado por Prisma) ──────────────────────────────────
-- Vista derivada cuenta_por_pagar: el saldo de una factura NO se persiste, se
-- calcula aquí a partir de los pagos. Un 'reverso' resta; 'normal' y
-- 'correccion' suman. El estado se deriva del saldo y la fecha de vencimiento.
CREATE VIEW "cuenta_por_pagar" AS
SELECT
    base.compra_id,
    base.proveedor_id,
    base.sede_id,
    base.numero_factura,
    base.monto_total,
    base.fecha_emision,
    base.fecha_vencimiento,
    base.total_pagado,
    base.monto_total - base.total_pagado AS saldo,
    CASE
        WHEN base.monto_total - base.total_pagado <= 0 THEN 'pagado'
        WHEN base.total_pagado > 0                    THEN 'parcial'
        WHEN base.fecha_vencimiento < CURRENT_DATE    THEN 'vencida'
        ELSE 'debido'
    END AS estado
FROM (
    SELECT
        c."id"                AS compra_id,
        c."proveedor_id"      AS proveedor_id,
        c."sede_id"           AS sede_id,
        c."numero_factura"    AS numero_factura,
        c."monto_total"       AS monto_total,
        c."fecha_emision"     AS fecha_emision,
        c."fecha_vencimiento" AS fecha_vencimiento,
        COALESCE(SUM(CASE WHEN p."tipo" = 'reverso' THEN -p."monto" ELSE p."monto" END), 0) AS total_pagado
    FROM "compra" c
    LEFT JOIN "pago_proveedor" p ON p."compra_id" = c."id"
    GROUP BY c."id"
) base;
