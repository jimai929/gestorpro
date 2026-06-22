-- Fase 5 (Ola 0 complementaria): restaurar al ROL DE MIGRACIÓN los privilegios de
-- escritura sobre auditoria que la migración 20260523224500 revocó de current_user.
--
-- Contexto: 20260523224500 hizo `REVOKE UPDATE, DELETE, TRUNCATE ON auditoria FROM
-- current_user`. En la era single-role, current_user ERA el rol de la app; con los
-- roles separados (Fase 5) current_user al migrar es gestorpro_migrador (NO
-- superusuario, según deploy.sh / 01-init-roles.sh), así que ese REVOKE lo dejó
-- sin UPDATE. El backfill de Ola 2 (siguiente migración, 20260621223904) hace
-- `UPDATE auditoria` como ese mismo rol → fallaría con "permission denied for table
-- auditoria". Aquí se re-conceden ANTES de Ola 2.
--
-- Se concede a current_user (el rol que migra; owner de la tabla → puede
-- auto-concederse aunque antes se hubiera revocado). NO afecta el append-only de la
-- bitácora: éste se EXIGE sobre gestorpro_app, que sigue SIN estos privilegios
-- (post-migrate.sql lo reasegura tras cada deploy). En Testcontainers current_user
-- es el superusuario del contenedor → no-op. ADITIVA: no edita ninguna migración ya
-- aplicada (el VPS, parado en kiosco_token, aún no tiene esta ni Ola 2).
DO $$
BEGIN
  EXECUTE format('GRANT UPDATE, DELETE, TRUNCATE ON TABLE auditoria TO %I', current_user);
END
$$;
