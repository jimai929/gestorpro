-- CreateEnum
CREATE TYPE "TipoFichaje" AS ENUM ('entrada', 'salida_comida', 'entrada_comida', 'salida');

-- CreateEnum
CREATE TYPE "MecanismoExcepcion" AS ENUM ('pin', 'supervisor');

-- CreateTable
CREATE TABLE "empleado" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "sede_id" UUID NOT NULL,
    "qr_token" TEXT NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "foto_referencia" TEXT,
    "salario_fijo" DECIMAL(12,2) NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empleado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosco" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "sede_id" UUID NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kiosco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fichaje" (
    "id" UUID NOT NULL,
    "empleado_id" UUID NOT NULL,
    "kiosco_id" UUID NOT NULL,
    "tipo" "TipoFichaje" NOT NULL,
    "momento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "es_excepcion" BOOLEAN NOT NULL DEFAULT false,
    "mecanismo_excepcion" "MecanismoExcepcion",
    "requiere_revision" BOOLEAN NOT NULL DEFAULT false,
    "foto_captura" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fichaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revision_fichaje" (
    "id" UUID NOT NULL,
    "fichaje_id" UUID NOT NULL,
    "jefe_id" UUID NOT NULL,
    "valido" BOOLEAN NOT NULL,
    "motivo" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revision_fichaje_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empleado_numero_key" ON "empleado"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "empleado_qr_token_key" ON "empleado"("qr_token");

-- CreateIndex
CREATE INDEX "fichaje_empleado_id_idx" ON "fichaje"("empleado_id");

-- CreateIndex
CREATE INDEX "fichaje_kiosco_id_idx" ON "fichaje"("kiosco_id");

-- CreateIndex
CREATE INDEX "fichaje_momento_idx" ON "fichaje"("momento");

-- CreateIndex
CREATE UNIQUE INDEX "revision_fichaje_fichaje_id_key" ON "revision_fichaje"("fichaje_id");

-- AddForeignKey
ALTER TABLE "empleado" ADD CONSTRAINT "empleado_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosco" ADD CONSTRAINT "kiosco_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichaje" ADD CONSTRAINT "fichaje_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleado"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fichaje" ADD CONSTRAINT "fichaje_kiosco_id_fkey" FOREIGN KEY ("kiosco_id") REFERENCES "kiosco"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_fichaje" ADD CONSTRAINT "revision_fichaje_fichaje_id_fkey" FOREIGN KEY ("fichaje_id") REFERENCES "fichaje"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
