-- Ola 2 (multi-tenant): BACKFILL idempotente de los datos existentes a la
-- "Empresa Default". Corre como el rol de migracion (owner): puede UPDATE
-- auditoria pese al REVOKE UPDATE/DELETE (ese REVOKE es sobre gestorpro_app, no
-- sobre el owner). NO destructivo, re-ejecutable: cada paso solo toca filas aun
-- sin tenant. Prepara el endurecimiento NOT NULL + FK de Ola 3.

-- 1. Empresa default (idempotente por slug). gen_random_uuid() es nativo en pg13+.
INSERT INTO "empresa" ("id", "nombre", "slug", "activo", "plan", "zona_horaria", "creado_en")
VALUES (gen_random_uuid(), 'Empresa Default', 'default', true, 'base', 'America/Panama', CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- 2. Backfill de empresa_id en las 7 tablas raiz directas + auditoria. Solo las
--    filas sin tenant (WHERE empresa_id IS NULL) -> idempotente.
UPDATE "sede"                SET "empresa_id" = (SELECT "id" FROM "empresa" WHERE "slug" = 'default') WHERE "empresa_id" IS NULL;
UPDATE "proveedor"           SET "empresa_id" = (SELECT "id" FROM "empresa" WHERE "slug" = 'default') WHERE "empresa_id" IS NULL;
UPDATE "categoria_gasto"     SET "empresa_id" = (SELECT "id" FROM "empresa" WHERE "slug" = 'default') WHERE "empresa_id" IS NULL;
UPDATE "rol_operativo"       SET "empresa_id" = (SELECT "id" FROM "empresa" WHERE "slug" = 'default') WHERE "empresa_id" IS NULL;
UPDATE "turno"               SET "empresa_id" = (SELECT "id" FROM "empresa" WHERE "slug" = 'default') WHERE "empresa_id" IS NULL;
UPDATE "dia_festivo"         SET "empresa_id" = (SELECT "id" FROM "empresa" WHERE "slug" = 'default') WHERE "empresa_id" IS NULL;
UPDATE "configuracion_cobro" SET "empresa_id" = (SELECT "id" FROM "empresa" WHERE "slug" = 'default') WHERE "empresa_id" IS NULL;
UPDATE "auditoria"           SET "empresa_id" = (SELECT "id" FROM "empresa" WHERE "slug" = 'default') WHERE "empresa_id" IS NULL;

-- 3. Una Membresia por cada Usuario existente, con su rol actual, en la empresa
--    default y marcada como predeterminada. Idempotente: WHERE NOT EXISTS + el
--    @@unique(usuario_id, empresa_id) evitan duplicados al re-ejecutar.
INSERT INTO "membresia" ("id", "usuario_id", "empresa_id", "rol", "predeterminada", "creado_en")
SELECT
  gen_random_uuid(),
  u."id",
  (SELECT "id" FROM "empresa" WHERE "slug" = 'default'),
  u."rol",
  true,
  CURRENT_TIMESTAMP
FROM "usuario" u
WHERE NOT EXISTS (
  SELECT 1 FROM "membresia" m
  WHERE m."usuario_id" = u."id"
    AND m."empresa_id" = (SELECT "id" FROM "empresa" WHERE "slug" = 'default')
);
