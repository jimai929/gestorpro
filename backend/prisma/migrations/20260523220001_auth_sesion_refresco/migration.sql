-- CreateTable
CREATE TABLE "sesion_refresco" (
    "id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sesion_refresco_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sesion_refresco_token_hash_key" ON "sesion_refresco"("token_hash");

-- CreateIndex
CREATE INDEX "sesion_refresco_usuario_id_idx" ON "sesion_refresco"("usuario_id");

-- AddForeignKey
ALTER TABLE "sesion_refresco" ADD CONSTRAINT "sesion_refresco_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
