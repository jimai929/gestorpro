#!/usr/bin/env bash
# Despliegue/actualización de GestorPro en el VPS. Idempotente y seguro de
# repetir. Orquesta: build → Postgres → migrate deploy (rol migrador) → grants y
# append-only → seed base → verificación append-only → levantar backend + caddy.
#
# Requiere deploy/.env (copiar de .env.example y rellenar). Ejecutar desde
# cualquier ruta: el script se sitúa en su propio directorio.
set -euo pipefail
cd "$(dirname "$0")"

if [[ ! -f .env ]]; then
  echo "ERROR: falta deploy/.env (copia deploy/.env.example y rellénalo)." >&2
  exit 1
fi
set -a; source .env; set +a

# Variables OBLIGATORIAS: si falta cualquiera, el script aborta aquí (no llega a
# imprimir "Despliegue completo"). NOTA: no se valida JWT_REFRESH_SECRET porque la
# app NO lo usa — los refresh token se guardan en la BD (SesionRefresco), el único
# secreto JWT es JWT_ACCESS_SECRET (ver backend/src/core/auth/auth.plugin.ts).
: "${POSTGRES_SUPER_PASSWORD:?define POSTGRES_SUPER_PASSWORD en .env}"
: "${GESTORPRO_MIGRADOR_PASSWORD:?define GESTORPRO_MIGRADOR_PASSWORD en .env}"
: "${GESTORPRO_APP_PASSWORD:?define GESTORPRO_APP_PASSWORD en .env}"
: "${JWT_ACCESS_SECRET:?define JWT_ACCESS_SECRET en .env}"
: "${ADMIN_PASSWORD:?define ADMIN_PASSWORD en .env}"
: "${DOMINIO:?define DOMINIO en .env}"
: "${ACME_EMAIL:?define ACME_EMAIL en .env}"

# Las contraseñas de Postgres viajan dentro de URLs de conexión
# (postgresql://user:PASS@host): deben ser URL-safe. Si llevan @ : / # ? % & o
# espacios, la URL se parte y el despliegue falla o conecta a credenciales
# truncadas. Se rechazan aquí, antes de tocar nada.
es_url_safe() {
  case "$1" in
    *[!A-Za-z0-9._-]*) return 1 ;;
    *) return 0 ;;
  esac
}
for _var in POSTGRES_SUPER_PASSWORD GESTORPRO_MIGRADOR_PASSWORD GESTORPRO_APP_PASSWORD; do
  if ! es_url_safe "${!_var}"; then
    echo "ERROR: $_var contiene caracteres no URL-safe. Usa solo [A-Za-z0-9._-] (sin @ : / # ? % & ni espacios). Genera con: openssl rand -hex 32" >&2
    exit 1
  fi
done

MIGRATOR_DATABASE_URL="postgresql://gestorpro_migrador:${GESTORPRO_MIGRADOR_PASSWORD}@postgres:5432/gestorpro?schema=public"

echo "==> 1/7 Construyendo imágenes"
docker compose build

echo "==> 2/7 Levantando Postgres y esperando a que esté healthy"
docker compose up -d postgres
cid="$(docker compose ps -q postgres)"
estado=""
for _ in $(seq 1 60); do
  estado="$(docker inspect -f '{{.State.Health.Status}}' "$cid" 2>/dev/null || true)"
  [[ "$estado" == "healthy" ]] && break
  sleep 2
done
if [[ "$estado" != "healthy" ]]; then
  echo "ERROR: Postgres no llegó a healthy (estado: ${estado:-desconocido})." >&2; exit 1
fi

# 'healthy' (pg_isready) solo prueba que el servidor responde, no que el initdb
# haya creado la base de negocio. Confirmarlo explícitamente antes de migrar para
# abortar con un mensaje claro si el initdb de roles falló.
if ! docker compose exec -T postgres \
     psql -tAX -U postgres -d postgres \
     -c "SELECT 1 FROM pg_database WHERE datname='gestorpro';" 2>/dev/null | grep -q '^1$'; then
  echo "ERROR: la base 'gestorpro' no existe (¿falló el initdb de roles?). Abortando." >&2
  exit 1
fi

echo "==> 3/7 migrate deploy (rol migrador)"
# Secretos por ENTORNO, no por argv: el prefijo inline pone la variable en el
# entorno del proceso docker y '-e VAR' (sin valor) la hereda; así la contraseña
# no queda visible en 'ps aux' del host.
DATABASE_URL="$MIGRATOR_DATABASE_URL" \
  docker compose run --rm -e DATABASE_URL backend npx prisma migrate deploy

echo "==> 4/7 Grants post-migración + append-only de auditoría (rol migrador)"
docker compose exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U gestorpro_migrador -d gestorpro < postgres/post-migrate.sql

echo "==> 5/7 Seed base de producción (idempotente, rol migrador)"
# Igual que arriba: secretos por entorno (-e VAR sin valor), no por argv.
DATABASE_URL="$MIGRATOR_DATABASE_URL" \
NODE_ENV=production \
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@gestorpro.local}" \
ADMIN_PASSWORD="$ADMIN_PASSWORD" \
  docker compose run --rm -e DATABASE_URL -e NODE_ENV -e ADMIN_EMAIL -e ADMIN_PASSWORD backend npx prisma db seed

echo "==> 6/7 Verificando append-only de auditoria (rol app)"
# (a) Aserción POSITIVA: el rol app conecta y la tabla existe. Un SELECT debe
#     funcionar (vacío o no). Si falla, el problema es conexión / base / tabla
#     inexistente, NO append-only: hay que abortar y no dar un OK engañoso.
if ! docker compose exec -T postgres \
     psql -v ON_ERROR_STOP=1 -U gestorpro_app -d gestorpro \
     -c "SELECT 1 FROM auditoria LIMIT 1;" >/dev/null 2>&1; then
  echo "ERROR: gestorpro_app no pudo SELECT auditoria (conexión, base o tabla inexistente). Abortando." >&2
  exit 1
fi
# (b) Aserción NEGATIVA: el UPDATE debe ser RECHAZADO POR PERMISOS. Se exige que
#     el mensaje sea 'permission denied' / 'permiso denegado'; cualquier otro
#     fallo (tabla inexistente, error de sintaxis, conexión) NO cuenta como OK, y
#     que el UPDATE tenga éxito tampoco. '|| true' evita que set -e aborte aquí.
salida_update="$(docker compose exec -T postgres \
  psql -v ON_ERROR_STOP=1 -U gestorpro_app -d gestorpro \
  -c "UPDATE auditoria SET accion = accion;" 2>&1 || true)"
if ! printf '%s' "$salida_update" | grep -qiE 'permission denied|permiso denegado'; then
  echo "ERROR DE SEGURIDAD: el UPDATE de auditoria como app NO fue rechazado por permisos." >&2
  echo "Salida de psql:" >&2
  printf '%s\n' "$salida_update" >&2
  exit 1
fi
echo "    OK: gestorpro_app lee pero NO puede modificar auditoria (append-only verificado)."

echo "==> 7/7 Levantando backend y esperando a que esté healthy"
docker compose up -d backend
cid_backend="$(docker compose ps -q backend)"
estado_backend=""
for _ in $(seq 1 60); do
  estado_backend="$(docker inspect -f '{{.State.Health.Status}}' "$cid_backend" 2>/dev/null || true)"
  [[ "$estado_backend" == "healthy" ]] && break
  sleep 2
done
if [[ "$estado_backend" != "healthy" ]]; then
  echo "ERROR: el backend no llegó a healthy (estado: ${estado_backend:-desconocido}). Revisa 'docker compose logs backend'." >&2
  exit 1
fi
echo "    Backend healthy."

echo "==> Levantando caddy"
docker compose up -d caddy

echo "Despliegue completo. Verifica https://api.${DOMINIO}/health"
