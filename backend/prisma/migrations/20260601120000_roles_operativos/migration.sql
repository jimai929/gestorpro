-- Roles OPERATIVOS del empleado (cajera, verificador, …). Distintos de
-- Usuario.rol (autorización del sistema). Relación N:M con baja lógica; los
-- roles base se siembran de forma idempotente desde prisma/seed.ts.

-- CreateTable
CREATE TABLE "rol_operativo" (
    "id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rol_operativo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rol_operativo_clave_key" ON "rol_operativo"("clave");

-- CreateTable
CREATE TABLE "empleado_rol_operativo" (
    "empleado_id" UUID NOT NULL,
    "rol_operativo_id" UUID NOT NULL,
    "asignado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "empleado_rol_operativo_pkey" PRIMARY KEY ("empleado_id", "rol_operativo_id")
);

-- CreateIndex
CREATE INDEX "empleado_rol_operativo_rol_operativo_id_idx" ON "empleado_rol_operativo"("rol_operativo_id");

-- AddForeignKey
ALTER TABLE "empleado_rol_operativo" ADD CONSTRAINT "empleado_rol_operativo_empleado_id_fkey" FOREIGN KEY ("empleado_id") REFERENCES "empleado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "empleado_rol_operativo" ADD CONSTRAINT "empleado_rol_operativo_rol_operativo_id_fkey" FOREIGN KEY ("rol_operativo_id") REFERENCES "rol_operativo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
