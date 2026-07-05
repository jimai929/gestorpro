-- Bitácora APPEND-ONLY de operaciones de PLATAFORMA (super-admin), SEPARADA de la
-- auditoría de tenant (`auditoria`). No lleva RLS ni empresa_id de partición: es un
-- registro a nivel plataforma. `empresa_afectada_id` (nullable) referencia la empresa
-- objeto de la acción; NULL en acciones sin empresa. El append-only (REVOKE de
-- UPDATE/DELETE) y la EXCLUSIÓN de RLS (allowlist) se aplican en post-migrate.sql,
-- igual que para `auditoria`.

-- CreateTable
CREATE TABLE "auditoria_plataforma" (
    "id" UUID NOT NULL,
    "actor_usuario_id" UUID NOT NULL,
    "empresa_afectada_id" UUID,
    "accion" TEXT NOT NULL,
    "detalle" JSONB,
    "ip" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_plataforma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auditoria_plataforma_empresa_afectada_id_idx" ON "auditoria_plataforma"("empresa_afectada_id");

-- CreateIndex
CREATE INDEX "auditoria_plataforma_actor_usuario_id_idx" ON "auditoria_plataforma"("actor_usuario_id");

-- AddForeignKey
ALTER TABLE "auditoria_plataforma" ADD CONSTRAINT "auditoria_plataforma_empresa_afectada_id_fkey" FOREIGN KEY ("empresa_afectada_id") REFERENCES "empresa"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
