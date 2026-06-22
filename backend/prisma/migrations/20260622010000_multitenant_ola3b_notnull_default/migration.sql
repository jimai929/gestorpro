-- Ola 3b (Fase 5 Seg 2): endurecer las 8 tablas raíz directas.
-- empresa_id pasa de NULLABLE a NOT NULL + DEFAULT desde el GUC de tenant.
--   * NOT NULL  → fail-closed: un INSERT sin contexto de tenant (GUC sin fijar)
--     da empresa_id NULL → viola NOT NULL → ERROR, no fila huérfana.
--   * DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid → la app
--     inserta SIN empresa_id (campo opcional en Prisma por el @default) y la DB lo
--     rellena desde el GUC que fija txEmpresa. NULLIF normaliza el '' residual del
--     pool a NULL (ver post-migrate.sql / PLAN_FASE5_RLS.md §2). El migrador/seed
--     (BYPASSRLS) pasa empresa_id explícito y no usa el DEFAULT.
-- Aditivo y sin pérdida. El backfill (Ola 2) ya dejó 0 NULL (verificado).

-- Guard de seguridad: abortar con mensaje claro si quedara algún NULL (SET NOT NULL
-- fallaría igual, pero menos legible). Las 8 tablas en un solo conteo.
DO $$
DECLARE nulos bigint;
BEGIN
  SELECT (SELECT count(*) FROM sede                WHERE empresa_id IS NULL)
       + (SELECT count(*) FROM proveedor           WHERE empresa_id IS NULL)
       + (SELECT count(*) FROM categoria_gasto     WHERE empresa_id IS NULL)
       + (SELECT count(*) FROM rol_operativo       WHERE empresa_id IS NULL)
       + (SELECT count(*) FROM turno               WHERE empresa_id IS NULL)
       + (SELECT count(*) FROM dia_festivo         WHERE empresa_id IS NULL)
       + (SELECT count(*) FROM configuracion_cobro WHERE empresa_id IS NULL)
       + (SELECT count(*) FROM auditoria           WHERE empresa_id IS NULL)
    INTO nulos;
  IF nulos > 0 THEN
    RAISE EXCEPTION 'Ola3b abortada: % filas con empresa_id NULL en las tablas raiz; correr el backfill (Ola 2) antes de SET NOT NULL', nulos;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "sede" ALTER COLUMN "empresa_id" SET NOT NULL,
ALTER COLUMN "empresa_id" SET DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid;

-- AlterTable
ALTER TABLE "auditoria" ALTER COLUMN "empresa_id" SET NOT NULL,
ALTER COLUMN "empresa_id" SET DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid;

-- AlterTable
ALTER TABLE "proveedor" ALTER COLUMN "empresa_id" SET NOT NULL,
ALTER COLUMN "empresa_id" SET DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid;

-- AlterTable
ALTER TABLE "categoria_gasto" ALTER COLUMN "empresa_id" SET NOT NULL,
ALTER COLUMN "empresa_id" SET DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid;

-- AlterTable
ALTER TABLE "rol_operativo" ALTER COLUMN "empresa_id" SET NOT NULL,
ALTER COLUMN "empresa_id" SET DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid;

-- AlterTable
ALTER TABLE "turno" ALTER COLUMN "empresa_id" SET NOT NULL,
ALTER COLUMN "empresa_id" SET DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid;

-- AlterTable
ALTER TABLE "dia_festivo" ALTER COLUMN "empresa_id" SET NOT NULL,
ALTER COLUMN "empresa_id" SET DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid;

-- AlterTable
ALTER TABLE "configuracion_cobro" ALTER COLUMN "empresa_id" SET NOT NULL,
ALTER COLUMN "empresa_id" SET DEFAULT NULLIF(current_setting('app.empresa_id', true), '')::uuid;
