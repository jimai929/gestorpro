#!/usr/bin/env bash
# Se ejecuta UNA sola vez, en el primer arranque del volumen (initdb), como
# superusuario. Crea los dos roles del negocio y la base propiedad del migrador,
# y deja los privilegios por defecto para que cada tabla/secuencia que cree el
# migrador (en cada migrate deploy) conceda acceso de datos al rol de la app.
#
# Las contraseñas llegan por entorno y se pasan a SQL como literales seguros
# (psql :'var'), no por interpolación de shell.
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -v migpw="$GESTORPRO_MIGRADOR_PASSWORD" -v apppw="$GESTORPRO_APP_PASSWORD" <<-'SQL'
	CREATE ROLE gestorpro_migrador LOGIN PASSWORD :'migpw';
	CREATE ROLE gestorpro_app      LOGIN PASSWORD :'apppw';
	CREATE DATABASE gestorpro OWNER gestorpro_migrador;
	GRANT CONNECT ON DATABASE gestorpro TO gestorpro_app;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname gestorpro <<-'SQL'
	-- El app usa el esquema public pero NO crea objetos en él.
	GRANT USAGE ON SCHEMA public TO gestorpro_app;
	REVOKE CREATE ON SCHEMA public FROM gestorpro_app;

	-- Privilegios por defecto: toda tabla/secuencia que cree el migrador concede
	-- acceso de datos al app. La excepción de `auditoria` (append-only) se aplica
	-- en post-migrate.sql tras cada migrate deploy.
	ALTER DEFAULT PRIVILEGES FOR ROLE gestorpro_migrador IN SCHEMA public
	  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO gestorpro_app;
	ALTER DEFAULT PRIVILEGES FOR ROLE gestorpro_migrador IN SCHEMA public
	  GRANT USAGE, SELECT ON SEQUENCES TO gestorpro_app;
SQL
