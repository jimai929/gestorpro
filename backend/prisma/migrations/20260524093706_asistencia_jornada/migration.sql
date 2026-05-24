-- AlterTable
ALTER TABLE "empleado" ADD COLUMN     "turno_id" UUID;

-- CreateTable
CREATE TABLE "turno" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "sede_id" UUID,
    "hora_inicio" TEXT NOT NULL,
    "hora_fin" TEXT NOT NULL,
    "tolerancia_min" INTEGER NOT NULL DEFAULT 0,
    "pausa_por_defecto_min" INTEGER NOT NULL DEFAULT 0,
    "dia_descanso" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "turno_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "jornada" (
    "id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "minutos_presencia" INTEGER NOT NULL DEFAULT 0,
    "minutos_pausa" INTEGER NOT NULL DEFAULT 0,
    "minutos_trabajados" INTEGER NOT NULL DEFAULT 0,
    "minutos_ordinarios" INTEGER NOT NULL DEFAULT 0,
    "minutos_extra" INTEGER NOT NULL DEFAULT 0,
    "clasificacion" TEXT,
    "recargos_detalle" JSONB,
    "monto_extra" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "es_festivo" BOOLEAN NOT NULL DEFAULT false,
    "anomalia" BOOLEAN NOT NULL DEFAULT false,
    "detalle_anomalia" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'calculada',
    "calculada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "jornada_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "correccion" (
    "id" UUID NOT NULL,
    "jornada_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "valor_anterior" JSONB,
    "valor_nuevo" JSONB,
    "motivo" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "correccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dia_festivo" (
    "id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "nombre" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dia_festivo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "uq_jornada_empleado_fecha" ON "jornada"("empleado_id", "fecha");

-- CreateIndex
CREATE INDEX "correccion_jornada_id_idx" ON "correccion"("jornada_id");

-- CreateIndex
CREATE UNIQUE INDEX "dia_festivo_fecha_key" ON "dia_festivo"("fecha");

-- AddForeignKey
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_turno_id_fkey" FOREIGN KEY ("turno_id") REFERENCES "turno"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "turno" ADD CONSTRAINT "turno_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "jornada" ADD CONSTRAINT "jornada_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "correccion" ADD CONSTRAINT "correccion_jornada_id_fkey" FOREIGN KEY ("jornada_id") REFERENCES "jornada"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
