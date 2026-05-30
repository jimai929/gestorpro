-- Proveedor: datos de contacto (teléfono y persona de contacto). Nullables.
ALTER TABLE "proveedor"
    ADD COLUMN "telefono" TEXT,
    ADD COLUMN "persona_contacto" TEXT;

-- Compra: forma de pago contado/credito. Las compras existentes quedan a
-- 'credito' (el DEFAULT rellena las filas previas en el ADD COLUMN).
CREATE TYPE "TipoCompra" AS ENUM ('contado', 'credito');
ALTER TABLE "compra" ADD COLUMN "tipo" "TipoCompra" NOT NULL DEFAULT 'credito';

-- Una compra de contado se paga en el acto y no tiene vencimiento.
ALTER TABLE "compra" ALTER COLUMN "fecha_vencimiento" DROP NOT NULL;

-- ─── SQL manual (no gestionado por Prisma) ──────────────────────────────────
-- La vista cuenta_por_pagar ahora EXCLUYE las compras de contado: ya están
-- pagadas en el acto, no hay saldo que seguir. El resto de la vista (cálculo de
-- saldo y estado) no cambia. Mismas columnas de salida -> CREATE OR REPLACE.
CREATE OR REPLACE VIEW "cuenta_por_pagar" AS
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
    WHERE c."tipo" = 'credito'
    GROUP BY c."id"
) base;
