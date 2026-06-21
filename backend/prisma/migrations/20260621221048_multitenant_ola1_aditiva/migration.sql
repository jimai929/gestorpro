-- AlterTable
ALTER TABLE "categoria_gasto" ADD COLUMN     "empresa_id" UUID;

-- AlterTable
ALTER TABLE "configuracion_cobro" ADD COLUMN     "empresa_id" UUID;

-- AlterTable
ALTER TABLE "dia_festivo" ADD COLUMN     "empresa_id" UUID;

-- AlterTable
ALTER TABLE "proveedor" ADD COLUMN     "empresa_id" UUID;

-- AlterTable
ALTER TABLE "rol_operativo" ADD COLUMN     "empresa_id" UUID;

-- AlterTable
ALTER TABLE "sede" ADD COLUMN     "empresa_id" UUID;

-- AlterTable
ALTER TABLE "turno" ADD COLUMN     "empresa_id" UUID;

-- AlterTable
ALTER TABLE "usuario" ADD COLUMN     "es_super_admin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "empresa" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "plan" TEXT NOT NULL DEFAULT 'base',
    "zona_horaria" TEXT NOT NULL DEFAULT 'America/Panama',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "membresia" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "empresa_id" UUID NOT NULL,
    "rol" "Rol" NOT NULL DEFAULT 'empleado',
    "predeterminada" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membresia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "empresa_slug_key" ON "empresa"("slug");

-- CreateIndex
CREATE INDEX "membresia_empresa_id_idx" ON "membresia"("empresa_id");

-- CreateIndex
CREATE UNIQUE INDEX "membresia_usuario_id_empresa_id_key" ON "membresia"("usuario_id", "empresa_id");

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "membresia" ADD CONSTRAINT "membresia_empresa_id_fkey" FOREIGN KEY ("empresa_id") REFERENCES "empresa"("id") ON DELETE CASCADE ON UPDATE CASCADE;
