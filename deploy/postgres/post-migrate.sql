-- Se ejecuta como gestorpro_migrador (dueño de las tablas) tras CADA
-- `prisma migrate deploy`. Reasegura los grants de datos al app sobre los
-- objetos existentes (idempotente) y reimpone el append-only de `auditoria`.
--
-- El append-only se verifica además en deploy.sh: un UPDATE de auditoria como
-- gestorpro_app DEBE fallar tras este paso.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gestorpro_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gestorpro_app;

-- Auditoría: el app puede LEER e INSERTAR, nunca modificar ni borrar.
REVOKE UPDATE, DELETE, TRUNCATE ON auditoria FROM gestorpro_app;
REVOKE UPDATE, DELETE, TRUNCATE ON auditoria FROM PUBLIC;
