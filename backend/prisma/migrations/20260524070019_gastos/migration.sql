-- CreateTable
CREATE TABLE "categoria_gasto" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "es_pago_empleado" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "categoria_gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gasto" (
    "id" UUID NOT NULL,
    "categoria_id" UUID NOT NULL,
    "sede_id" UUID NOT NULL,
    "monto" DECIMAL(12,2) NOT NULL,
    "fecha_operacion" DATE NOT NULL,
    "descripcion" TEXT,
    "empleado_id" UUID,
    "tipo_pago" TEXT,
    "referencia_origen" TEXT,
    "tipo" "TipoMovimiento" NOT NULL DEFAULT 'normal',
    "corrige_id" UUID,
    "motivo" TEXT,
    "usuario_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gasto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categoria_gasto_nombre_key" ON "categoria_gasto"("nombre");

-- CreateIndex
CREATE INDEX "gasto_categoria_id_idx" ON "gasto"("categoria_id");

-- CreateIndex
CREATE INDEX "gasto_sede_id_idx" ON "gasto"("sede_id");

-- CreateIndex
CREATE INDEX "gasto_fecha_operacion_idx" ON "gasto"("fecha_operacion");

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_categoria_id_fkey" FOREIGN KEY ("categoria_id") REFERENCES "categoria_gasto"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_corrige_id_fkey" FOREIGN KEY ("corrige_id") REFERENCES "gasto"("id") ON DELETE SET NULL ON UPDATE CASCADE;
