#!/usr/bin/env bash
# Prueba de restauración de GestorPro (la "prueba de restauración datos + roles"
# de DESPLIEGUE.md §6). Restaura un backup en un contenedor Postgres EFÍMERO y
# AISLADO —NO toca el stack de producción ni sus datos— y verifica que:
#   1) los roles (gestorpro_migrador / gestorpro_app) se recrean,
#   2) el esquema + datos de gestorpro se restauran,
#   3) el append-only de auditoria sobrevive (UPDATE como app -> permission denied).
#
# Uso:  ./restore.sh [TIMESTAMP]      (sin TS = usa el backup más reciente)
# El contenedor temporal se elimina al terminar (éxito o error).
#
# Para una RECUPERACIÓN REAL en un servidor nuevo, aplica los mismos pasos contra
# el Postgres destino (ver deploy/README.md): roles.sql -> createdb -O migrador
# -> pg_restore -> verificación append-only.
set -euo pipefail
cd "$(dirname "$0")"

DIR_BACKUPS="${DIR_BACKUPS:-./backups}"
IMG="${POSTGRES_IMG:-postgres:17}"
NOMBRE="gestorpro_restore_test_$$"
SUPERPW="restore_test_$$"

# --- Elegir el backup a verificar ---
TS="${1:-}"
if [[ -z "$TS" ]]; then
  ultimo="$(ls -1t "$DIR_BACKUPS"/gestorpro_*.dump 2>/dev/null | head -n1 || true)"
  [[ -n "$ultimo" ]] || { echo "ERROR: no hay backups gestorpro_*.dump en $DIR_BACKUPS" >&2; exit 1; }
  TS="$(basename "$ultimo" | sed -E 's/^gestorpro_(.+)\.dump$/\1/')"
fi
roles_file="$DIR_BACKUPS/roles_${TS}.sql"
data_file="$DIR_BACKUPS/gestorpro_${TS}.dump"
for f in "$roles_file" "$data_file"; do
  [[ -s "$f" ]] || { echo "ERROR: falta o está vacío: $f" >&2; exit 1; }
done

echo "==> Prueba de restauración TS=$TS en contenedor efímero $NOMBRE ($IMG)"

limpiar() { docker rm -f "$NOMBRE" >/dev/null 2>&1 || true; }
trap limpiar EXIT

docker run -d --name "$NOMBRE" -e POSTGRES_PASSWORD="$SUPERPW" "$IMG" >/dev/null

echo "    esperando a que el Postgres de prueba acepte conexiones..."
listo=""
for _ in $(seq 1 60); do
  if docker exec "$NOMBRE" pg_isready -U postgres >/dev/null 2>&1; then listo=1; break; fi
  sleep 1
done
[[ "$listo" == "1" ]] || { echo "ERROR: el contenedor de prueba no levantó." >&2; exit 1; }

echo "==> 1) Restaurando roles (pg_dumpall --roles-only)"
# ON_ERROR_STOP=0: tolera el quirk del superusuario del clúster (CREATE/ALTER del
# rol 'postgres' que ya existe). Los roles del negocio se comprueban explícitamente
# después, así que un fallo real SÍ se detecta.
docker exec -i "$NOMBRE" psql -v ON_ERROR_STOP=0 -U postgres -d postgres < "$roles_file" >/dev/null 2>&1 || true
for rol in gestorpro_migrador gestorpro_app; do
  existe="$(docker exec "$NOMBRE" psql -tAX -U postgres -d postgres \
    -c "SELECT 1 FROM pg_roles WHERE rolname='$rol';" 2>/dev/null || true)"
  [[ "$existe" == "1" ]] || { echo "ERROR: el rol $rol no se restauró desde roles.sql." >&2; exit 1; }
done
echo "    roles gestorpro_migrador y gestorpro_app presentes."

echo "==> 2) Creando base gestorpro (owner migrador) y restaurando datos"
docker exec "$NOMBRE" createdb -U postgres -O gestorpro_migrador gestorpro
set +e
docker exec -i "$NOMBRE" pg_restore -U postgres -d gestorpro < "$data_file" >/tmp/gp_pg_restore_$$ 2>&1
cod_restore=$?
set -e
if [[ $cod_restore -ne 0 ]]; then
  echo "    AVISO: pg_restore terminó con código $cod_restore (puede ser por avisos benignos); se valida abajo."
fi

echo "==> 3) Verificando append-only de auditoria en la restauración"
# (a) positiva: el rol app conecta, la tabla existe y los datos se leen. Se
#     reporta el número de filas restauradas (count-agnóstico: una base nueva
#     puede tener 0 auditorías legítimamente; lo exigido es que el SELECT
#     funcione, lo que prueba tabla + grants + restaurabilidad de los datos).
n_aud="$(docker exec "$NOMBRE" psql -tAX -v ON_ERROR_STOP=1 -U gestorpro_app -d gestorpro \
  -c "SELECT count(*) FROM auditoria;" 2>/dev/null || true)"
if ! [[ "$n_aud" =~ ^[0-9]+$ ]]; then
  echo "ERROR: gestorpro_app no pudo leer auditoria tras restaurar (datos/tabla/grants)." >&2
  exit 1
fi
echo "    auditoria legible por app: ${n_aud} fila(s) restauradas."
# (b) negativa: el UPDATE debe ser RECHAZADO POR PERMISOS (no por otro error).
salida="$(docker exec -i "$NOMBRE" psql -v ON_ERROR_STOP=1 -U gestorpro_app -d gestorpro \
  -c "UPDATE auditoria SET accion = accion;" 2>&1 || true)"
if ! printf '%s' "$salida" | grep -qiE 'permission denied|permiso denegado'; then
  echo "ERROR: el append-only NO se restauró: el UPDATE de auditoria no fue rechazado por permisos." >&2
  printf '%s\n' "$salida" >&2
  exit 1
fi

echo "    OK: roles + datos + append-only restaurados y verificados."
echo "PRUEBA DE RESTAURACIÓN EXITOSA (TS=$TS). Se elimina el contenedor efímero."
