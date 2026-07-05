#!/usr/bin/env bash
# Despliegue/actualización de GestorPro en el VPS. Idempotente y seguro de
# repetir. Orquesta: build → Postgres → migrate deploy (rol migrador) → grants y
# append-only → seed base → verificación append-only → backend → validar
# Caddyfile → caddy.
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

echo "==> 2b/7 Prerrequisito: gestorpro_migrador con BYPASSRLS (necesario para el seed bajo RLS+FORCE)"
# El paso 4 (post-migrate) crea FORCE ROW LEVEL SECURITY; el paso 5 (seed) corre como
# gestorpro_migrador. Sin BYPASSRLS el FORCE lo sujeta y el seed fallaría con WITH CHECK.
# Causa típica: VOLUMEN YA EXISTENTE (pre-Fase 5) — el initdb NO se re-ejecuta. Se detecta
# AQUI (fail-loud antes de migrar), no recién en el paso 5. Defensa pura: solo lee pg_roles.
mig_bypass="$(docker compose exec -T postgres \
  psql -tAX -v ON_ERROR_STOP=1 -U postgres -d postgres \
  -c "SELECT rolbypassrls FROM pg_roles WHERE rolname='gestorpro_migrador';" 2>&1 || true)"
if [[ "$mig_bypass" != "t" ]]; then
  echo "ERROR DE PRERREQUISITO: gestorpro_migrador NO tiene BYPASSRLS (valor leido: '${mig_bypass}')." >&2
  echo "Sin BYPASSRLS, el seed (paso 5) fallaria bajo FORCE ROW LEVEL SECURITY." >&2
  echo "Causa tipica: volumen ya existente (pre-Fase 5); el initdb no se re-ejecuta." >&2
  echo "Corrige como superusuario y reintenta:  ALTER ROLE gestorpro_migrador BYPASSRLS;" >&2
  exit 1
fi
echo "    OK: gestorpro_migrador tiene BYPASSRLS."

echo "==> 2c/7 Si hay migraciones pendientes (cambio estructural), exigir backup reciente (<24h)"
# Un migrate deploy con pendientes es estructural e irreversible; backup.sh es la unica
# via de rollback y deploy.sh NO lo hace solo. Solo se exige cuando HAY pendientes (un
# redeploy sin migraciones no se bloquea). Se usa el CODIGO DE SALIDA de migrate status
# (0 = todo aplicado; !=0 = pendientes O BD inaccesible -> conservador: exigir backup).
# El backup debe hacerse JUSTO ANTES de desplegar; la ventana de 24h es solo un colchon.
set +e
estado_migrate="$(DATABASE_URL="$MIGRATOR_DATABASE_URL" \
  docker compose run --rm -e DATABASE_URL backend npx prisma migrate status 2>&1)"
hay_pendientes=$?
set -e
if [[ $hay_pendientes -ne 0 ]]; then
  reciente="$(find backups -name 'gestorpro_*.dump' -mmin -1440 2>/dev/null | head -n1 || true)"
  if [[ -n "$reciente" ]]; then
    echo "    OK: hay backup reciente ($reciente)."
  elif [[ "${CONFIRMAR_SIN_BACKUP:-}" == "1" ]]; then
    echo "    AVISO: sin backup reciente, pero CONFIRMAR_SIN_BACKUP=1 -> se continua SIN red de rollback." >&2
  else
    echo "ERROR: migraciones pendientes (o BD inaccesible) y SIN backup reciente (<24h) en backups/." >&2
    echo "Haz el backup JUSTO ANTES de desplegar:  ./backup.sh   (y ./restore.sh para verificar)." >&2
    echo "Salida de 'prisma migrate status' (para distinguir 'hay pendientes' de 'no conecta'):" >&2
    printf '%s\n' "$estado_migrate" >&2
    echo "Para saltar deliberadamente (no recomendado):  CONFIRMAR_SIN_BACKUP=1 ./deploy.sh" >&2
    exit 1
  fi
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

echo "==> 4b/7 Verificando aislamiento RLS (la frontera multi-tenant está ARMADA)"
# Gate de seguridad análogo al append-only: tras post-migrate, la FRONTERA REAL
# (RLS) debe estar habilitada y FORZADA en TODAS las tablas tenant-scoped. Una
# tabla nueva sin RLS sería fail-OPEN (fuga cross-tenant) y el deploy NO debe
# dejarla pasar en silencio. Allowlist EXCLUIDA = la misma de post-migrate.sql y
# del test rls-cobertura: usuario/sesion_refresco/empresa/membresia +
# auditoria_plataforma (bitácora de PLATAFORMA, sin RLS por diseño: su aislamiento
# es el guard soloPlataforma de la ruta, no la RLS) + _prisma_migrations.
faltan_rls="$(docker compose exec -T postgres \
  psql -tAX -v ON_ERROR_STOP=1 -U gestorpro_migrador -d gestorpro -c \
  "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'public' AND c.relkind = 'r'
     AND c.relname NOT IN ('usuario','sesion_refresco','empresa','membresia','auditoria_plataforma','_prisma_migrations')
     AND NOT (c.relrowsecurity AND c.relforcerowsecurity)
   ORDER BY c.relname;" 2>&1 || true)"
if [[ -n "$faltan_rls" ]]; then
  echo "ERROR DE SEGURIDAD: tablas tenant SIN RLS habilitada+forzada (fail-OPEN):" >&2
  printf '%s\n' "$faltan_rls" >&2
  exit 1
fi

# La vista cuenta_por_pagar DEBE ejecutar como el invocador (si no, corre como su
# owner migrador BYPASSRLS y fuga datos cross-tenant a gestorpro_app).
si_ok="$(docker compose exec -T postgres \
  psql -tAX -v ON_ERROR_STOP=1 -U gestorpro_migrador -d gestorpro -c \
  "SELECT count(*) FROM pg_class WHERE relname = 'cuenta_por_pagar'
     AND 'security_invoker=true' = ANY(COALESCE(reloptions, '{}'));" 2>&1 || true)"
if [[ "$si_ok" != "1" ]]; then
  echo "ERROR DE SEGURIDAD: la vista cuenta_por_pagar NO tiene security_invoker=true." >&2
  exit 1
fi

# El rol de la app NUNCA debe tener BYPASSRLS (sería saltarse el aislamiento).
app_bypass="$(docker compose exec -T postgres \
  psql -tAX -v ON_ERROR_STOP=1 -U gestorpro_migrador -d gestorpro -c \
  "SELECT rolbypassrls FROM pg_roles WHERE rolname = 'gestorpro_app';" 2>&1 || true)"
if [[ "$app_bypass" != "f" ]]; then
  echo "ERROR DE SEGURIDAD: gestorpro_app tiene BYPASSRLS (o no existe). Debe ser NOBYPASSRLS." >&2
  echo "Valor leído: '${app_bypass}'." >&2
  exit 1
fi
echo "    OK: RLS armada en todas las tablas tenant, vista con security_invoker, app NOBYPASSRLS."

echo "==> 5/7 Seed base de producción (idempotente, rol migrador)"
# Igual que arriba: secretos por entorno (-e VAR sin valor), no por argv.
DATABASE_URL="$MIGRATOR_DATABASE_URL" \
NODE_ENV=production \
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@gestorpro.local}" \
ADMIN_PASSWORD="$ADMIN_PASSWORD" \
SUPER_ADMIN_EMAIL="${SUPER_ADMIN_EMAIL:-}" \
SUPER_ADMIN_PASSWORD="${SUPER_ADMIN_PASSWORD:-}" \
  docker compose run --rm -e DATABASE_URL -e NODE_ENV -e ADMIN_EMAIL -e ADMIN_PASSWORD \
  -e SUPER_ADMIN_EMAIL -e SUPER_ADMIN_PASSWORD backend npx prisma db seed

echo "==> 6/7 Verificando append-only de auditoria y auditoria_plataforma (rol app)"
# La FRONTERA REAL de inmutabilidad es el REVOKE de UPDATE/DELETE/TRUNCATE sobre estas
# bitácoras (post-migrate.sql). Para AMBAS tablas se exige:
#  (a) POSITIVA: el rol app conecta y la tabla existe (SELECT funciona, vacío o no); si
#      falla es conexión / base / tabla inexistente, NO append-only → abortar sin dar un
#      OK engañoso.
#  (b) NEGATIVA: UPDATE, DELETE y TRUNCATE deben ser RECHAZADOS POR PERMISOS ('permission
#      denied' / 'permiso denegado'); cualquier otro fallo (tabla inexistente, sintaxis,
#      conexión) o un ÉXITO NO cuentan como OK. Se prueban los TRES verbos porque el
#      REVOKE cubre los tres; probarlos NO borra datos (el permiso los rechaza antes de
#      ejecutar). '|| true' evita que set -e aborte en la aserción negativa.
for tabla in auditoria auditoria_plataforma; do
  if ! docker compose exec -T postgres \
       psql -v ON_ERROR_STOP=1 -U gestorpro_app -d gestorpro \
       -c "SELECT 1 FROM ${tabla} LIMIT 1;" >/dev/null 2>&1; then
    echo "ERROR: gestorpro_app no pudo SELECT ${tabla} (conexión, base o tabla inexistente). Abortando." >&2
    exit 1
  fi
  for op in "UPDATE ${tabla} SET accion = accion" "DELETE FROM ${tabla}" "TRUNCATE ${tabla}"; do
    salida_op="$(docker compose exec -T postgres \
      psql -v ON_ERROR_STOP=1 -U gestorpro_app -d gestorpro \
      -c "${op};" 2>&1 || true)"
    if ! printf '%s' "$salida_op" | grep -qiE 'permission denied|permiso denegado'; then
      echo "ERROR DE SEGURIDAD: '${op}' como app NO fue rechazado por permisos." >&2
      echo "Salida de psql:" >&2
      printf '%s\n' "$salida_op" >&2
      exit 1
    fi
  done
  echo "    OK: gestorpro_app lee pero NO puede UPDATE/DELETE/TRUNCATE ${tabla} (append-only verificado)."
done

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

echo "==> Validando el Caddyfile antes de exponer caddy"
# caddy es el ÚLTIMO servicio en levantarse (es el borde público con TLS): si su
# Caddyfile tuviera un error de sintaxis, hoy solo se vería al arrancar, con el
# backend ya healthy y la app sin reverse-proxy. Se valida ANTES en un contenedor
# efímero; con set -e, un Caddyfile inválido aborta el despliegue aquí. La imagen
# caddy no tiene ENTRYPOINT (CMD=["caddy","run",...]), por eso el comando lleva
# 'caddy'; --no-deps evita arrancar backend/postgres solo para validar.
docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile

echo "==> Levantando caddy"
docker compose up -d caddy

echo "Despliegue completo. Verifica https://api.${DOMINIO}/health"
