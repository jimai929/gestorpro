-- CreateTable
CREATE TABLE "venta_diaria" (
    "id" UUID NOT NULL,
    "sede_id" UUID NOT NULL,
    "fecha_operacion" DATE NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "tipo" "TipoMovimiento" NOT NULL DEFAULT 'normal',
    "corrige_id" UUID,
    "motivo" TEXT,
    "usuario_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "venta_diaria_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "venta_diaria_sede_id_idx" ON "venta_diaria"("sede_id");

-- CreateIndex
CREATE INDEX "venta_diaria_fecha_operacion_idx" ON "venta_diaria"("fecha_operacion");

-- AddForeignKey
ALTER TABLE "venta_diaria" ADD CONSTRAINT "venta_diaria_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "venta_diaria" ADD CONSTRAINT "venta_diaria_corrige_id_fkey" FOREIGN KEY ("corrige_id") REFERENCES "venta_diaria"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── SQL manual (no gestionado por Prisma) ──────────────────────────────────
-- Índice único parcial: un solo cierre 'normal' por (sede, fecha). Los asientos
-- de corrección (reverso/correccion) quedan EXENTOS, por eso el WHERE.
CREATE UNIQUE INDEX "uq_venta_normal" ON "venta_diaria" ("sede_id", "fecha_operacion") WHERE "tipo" = 'normal';
