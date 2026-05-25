-- CreateEnum
CREATE TYPE "EstadoSolicitudCobro" AS ENUM ('pendiente', 'aprobada', 'rechazada', 'pagada');

-- CreateTable
CREATE TABLE "saldo_horas_extra" (
    "id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "saldo" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saldo_horas_extra_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud_cobro" (
    "id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "estado" "EstadoSolicitudCobro" NOT NULL DEFAULT 'pendiente',
    "aprobado_por_id" UUID,
    "motivo_rechazo" TEXT,
    "resuelto_en" TIMESTAMP(3),
    "pagado_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "solicitud_cobro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_cobro" (
    "id" UUID NOT NULL,
    "porcentaje_cobrable" INTEGER NOT NULL DEFAULT 80,
    "umbral_aprobacion" DECIMAL(12,2) NOT NULL DEFAULT 100,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_cobro_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "saldo_horas_extra_empleado_id_key" ON "saldo_horas_extra"("empleado_id");

-- CreateIndex
CREATE INDEX "solicitud_cobro_empleado_id_idx" ON "solicitud_cobro"("empleado_id");

-- CreateIndex
CREATE INDEX "solicitud_cobro_estado_idx" ON "solicitud_cobro"("estado");

-- AddForeignKey
ALTER TABLE "saldo_horas_extra" ADD CONSTRAINT "saldo_horas_extra_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud_cobro" ADD CONSTRAINT "solicitud_cobro_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── SQL manual (no gestionado por Prisma) ──────────────────────────────────
-- Tercera capa de integridad del cobro: el saldo NUNCA negativo y el porcentaje
-- cobrable acotado a 0–100. El servicio transaccional es la primera garantía;
-- estos CHECK son la red de seguridad a nivel de base de datos.
ALTER TABLE "saldo_horas_extra" ADD CONSTRAINT "saldo_no_negativo" CHECK ("saldo" >= 0);
ALTER TABLE "configuracion_cobro" ADD CONSTRAINT "porcentaje_cobrable_valido" CHECK ("porcentaje_cobrable" BETWEEN 0 AND 100);
