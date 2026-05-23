-- Auditoría APPEND-ONLY · tercera capa de garantía.
--
-- Revoca UPDATE/DELETE/TRUNCATE sobre la tabla auditoria al rol que ejecuta la
-- migración (el rol de la aplicación). Las otras dos capas son la superficie
-- cerrada del repositorio (solo expone `registrar`) y la ausencia de campos
-- mutables en el modelo. INSERT y SELECT se conservan: la app solo inserta y lee.
--
-- Se usa current_user (vía DO/format) para no acoplar la migración al nombre del
-- rol de un entorno concreto.
DO $$
BEGIN
  EXECUTE format('REVOKE UPDATE, DELETE, TRUNCATE ON TABLE auditoria FROM %I', current_user);
END
$$;
