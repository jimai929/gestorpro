#!/usr/bin/env bash
# Se ejecuta en el primer arranque del volumen (initdb), como superusuario. Crea
# los dos roles del negocio y la base propiedad del migrador, y deja los
# privilegios por defecto para que cada tabla/secuencia que cree el migrador (en
# cada migrate deploy) conceda acceso de datos al rol de la app.
#
# IDEMPOTENTE y seguro de re-ejecutar a mano (reparación): los roles se crean solo
# si faltan y la contraseña se fija/ROTA con ALTER ROLE; la base se crea solo si
# falta. Las contraseñas llegan por entorno y se pasan como literales seguros de
# psql (:'var'), no por interpolación de shell.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v migpw="$GESTORPRO_MIGRADOR_PASSWORD" -v apppw="$GESTORPRO_APP_PASSWORD" <<'SQL'
-- Roles: crear solo si no existen. OJO: :'var' NO interpola dentro de DO $$, por
-- eso la contraseña se fija/ROTA aparte con ALTER ROLE, a nivel superior.
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gestorpro_migrador') THEN
    CREATE ROLE gestorpro_migrador LOGIN;
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'gestorpro_app') THEN
    CREATE ROLE gestorpro_app LOGIN;
  END IF;
END
$$;
ALTER ROLE gestorpro_migrador LOGIN PASSWORD :'migpw';
ALTER ROLE gestorpro_app      LOGIN PASSWORD :'apppw';
-- Base propiedad del migrador: crear solo si no existe (\gexec ejecuta el CREATE
-- DATABASE generado por el SELECT únicamente cuando la base falta).
SELECT 'CREATE DATABASE gestorpro OWNER gestorpro_migrador'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'gestorpro')
\gexec
GRANT CONNECT ON DATABASE gestorpro TO gestorpro_app;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname gestorpro <<'SQL'
-- El app usa el esquema public pero NO crea objetos en él.
GRANT USAGE ON SCHEMA public TO gestorpro_app;
REVOKE CREATE ON SCHEMA public FROM gestorpro_app;
-- Privilegios por defecto: toda tabla/secuencia que cree el migrador concede
-- acceso de datos al app. La excepción de auditoria (append-only) se aplica en
-- post-migrate.sql tras cada migrate deploy.
ALTER DEFAULT PRIVILEGES FOR ROLE gestorpro_migrador IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gestorpro_app;
ALTER DEFAULT PRIVILEGES FOR ROLE gestorpro_migrador IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO gestorpro_app;
SQL
