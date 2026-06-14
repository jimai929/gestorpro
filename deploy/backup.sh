#!/usr/bin/env bash
# Backup de GestorPro: vuelca los ROLES del clúster y los DATOS de la base.
# Pensado para cron diario en el VPS. Ejecutar desde cualquier ruta.
#
# Produce dos archivos con marca de tiempo en ./backups:
#   roles_<ts>.sql     <- pg_dumpall --roles-only (roles, contraseñas, memberships)
#   gestorpro_<ts>.dump <- pg_dump -Fc (esquema + datos + ACLs de objeto)
#
# ¡IMPORTANTE! Ambos contienen secretos (hash de contraseñas) y datos: se guardan
# con permisos 600 y NO deben entrar a git (ver deploy/.gitignore). El volumen
# Docker NO es un backup: copia estos archivos FUERA del VPS (object storage
# cifrado).
set -euo pipefail
cd "$(dirname "$0")"

# Cómo ejecutar binarios DENTRO del contenedor de Postgres. Por defecto el
# servicio 'postgres' de docker compose; sobreescribible para pruebas con
# PG_EXEC_CMD (p. ej. "docker exec -i mi_contenedor").
read -ra PG_EXEC <<< "${PG_EXEC_CMD:-docker compose exec -T postgres}"

DIR_BACKUPS="${DIR_BACKUPS:-./backups}"
RETENCION_DIAS="${RETENCION_DIAS:-30}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$DIR_BACKUPS"
roles_file="$DIR_BACKUPS/roles_${TS}.sql"
data_file="$DIR_BACKUPS/gestorpro_${TS}.dump"

echo "==> Volcando roles del clúster (pg_dumpall --roles-only)"
# Sin esto, una restauración en otro servidor pierde la separación de roles y el
# append-only de auditoria.
"${PG_EXEC[@]}" pg_dumpall -U postgres --roles-only > "$roles_file"

echo "==> Volcando datos+esquema de gestorpro (pg_dump -Fc)"
# Formato custom (comprimido y restaurable con pg_restore). Incluye vistas
# (cuenta_por_pagar), índices parciales y los GRANT/REVOKE de objetos: el
# append-only de auditoria viaja como ACL del propio objeto.
"${PG_EXEC[@]}" pg_dump -U gestorpro_migrador -d gestorpro -Fc > "$data_file"

# Los volcados son sensibles: solo el dueño puede leerlos.
chmod 600 "$roles_file" "$data_file"

# Sanidad: ningún archivo debe quedar vacío (un dump vacío = backup inútil).
for f in "$roles_file" "$data_file"; do
  if [[ ! -s "$f" ]]; then
    echo "ERROR: backup vacío: $f (¿Postgres arriba? ¿roles correctos?)" >&2
    exit 1
  fi
done

echo "==> Retención: borrando backups de más de ${RETENCION_DIAS} días en $DIR_BACKUPS"
find "$DIR_BACKUPS" -type f \( -name 'roles_*.sql' -o -name 'gestorpro_*.dump' \) \
  -mtime +"$RETENCION_DIAS" -print -delete || true

echo "Backup OK:"
echo "  $roles_file"
echo "  $data_file"
echo "RECORDATORIO: copia ambos archivos FUERA del VPS (object storage cifrado);"
echo "el volumen Docker NO es un backup. Verifica restaurabilidad con restore.sh."
