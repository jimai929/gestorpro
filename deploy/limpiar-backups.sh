#!/usr/bin/env bash
# Limpieza CONTROLADA de backups antiguos en deploy/backups.
#
# UNICA via autorizada para borrar backups desde una sesion de Claude Code:
# el hook .claude/hooks/deploy-guard.js bloquea cualquier borrado directo
# sobre deploy/backups (P0-BACKUP) y solo whitelista la invocacion completa
# de ESTE script (ver P0-BACKUP-LIMPIEZA en el hook). Autorizado por Jim el
# 2026-07-21.
#
# Invariantes duras (el script las impone, la whitelist confia en ellas):
#   - Solo toca archivos gestorpro_*.dump / roles_*.sql dentro de
#     deploy/backups (nunca otro directorio, nunca otro patron de nombre).
#   - Conserva SIEMPRE los --conservar pares mas recientes (minimo 3),
#     por timestamp del nombre, aunque superen la edad limite.
#   - Solo borra pares con mas de --dias dias (minimo 7) de antiguedad,
#     medida por el timestamp UTC del NOMBRE del archivo (no mtime).
#   - --dry-run lista lo que borraria sin borrar nada.
#
# Uso:  bash limpiar-backups.sh [--dias=30] [--conservar=5] [--dry-run]

set -euo pipefail

DIAS=30
CONSERVAR=5
DRY=0

for arg in "$@"; do
  case "$arg" in
    --dias=*)      DIAS="${arg#*=}" ;;
    --conservar=*) CONSERVAR="${arg#*=}" ;;
    --dry-run)     DRY=1 ;;
    *) echo "argumento desconocido: $arg (permitidos: --dias=N --conservar=N --dry-run)" >&2; exit 1 ;;
  esac
done

[[ "$DIAS" =~ ^[0-9]+$ ]]      || { echo "--dias debe ser un entero" >&2; exit 1; }
[[ "$CONSERVAR" =~ ^[0-9]+$ ]] || { echo "--conservar debe ser un entero" >&2; exit 1; }
(( DIAS >= 7 ))      || { echo "--dias minimo 7: una ventana menor borraria backups demasiado recientes" >&2; exit 1; }
(( CONSERVAR >= 3 )) || { echo "--conservar minimo 3 pares" >&2; exit 1; }

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/backups"
[[ -d "$DIR" ]] || { echo "no existe el directorio $DIR" >&2; exit 1; }

# Corte de edad por NOMBRE (timestamps UTC tipo 20260722T010527Z: el orden
# lexicografico coincide con el cronologico). GNU date usa -d; BSD date
# (macOS, el Mac mini de dev) usa -v. Si ninguno produce un timestamp
# valido, se ABORTA: con CORTE vacio la comparacion conservaria todo pero
# la salida del script mentiria.
CORTE="$(date -u -d "$DIAS days ago" +%Y%m%dT%H%M%SZ 2>/dev/null || true)"
if [[ ! "$CORTE" =~ ^[0-9]{8}T[0-9]{6}Z$ ]]; then
  CORTE="$(date -u -v-"${DIAS}"d +%Y%m%dT%H%M%SZ 2>/dev/null || true)"
fi
[[ "$CORTE" =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || { echo "no se pudo calcular el corte de edad (date -d/-v)" >&2; exit 1; }

# Dumps ordenados del mas reciente al mas viejo.
mapfile -t DUMPS < <(cd "$DIR" && ls gestorpro_*.dump 2>/dev/null | sort -r)

if (( ${#DUMPS[@]} <= CONSERVAR )); then
  echo "hay ${#DUMPS[@]} pares y se conservan ${CONSERVAR}: nada que borrar"
  exit 0
fi

BORRADOS=0
for ((i = CONSERVAR; i < ${#DUMPS[@]}; i++)); do
  f="${DUMPS[$i]}"
  ts="${f#gestorpro_}"
  ts="${ts%.dump}"
  # Mas reciente que el corte -> no cumple la edad minima, se conserva.
  if [[ ! "$ts" < "$CORTE" ]]; then
    continue
  fi
  roles="roles_${ts}.sql"
  if (( DRY )); then
    echo "[dry-run] borraria: $f + $roles"
  else
    rm -- "$DIR/$f"
    if [[ -f "$DIR/$roles" ]]; then
      rm -- "$DIR/$roles"
    fi
    echo "borrado: $f + $roles"
  fi
  BORRADOS=$(( BORRADOS + 1 ))
done

echo "pares afectados: $BORRADOS (se conservan los $CONSERVAR mas recientes y todo lo de menos de $DIAS dias)"
if (( DRY )); then
  echo "[dry-run] no se borro nada"
fi
echo "contenido actual de $DIR:"
ls -la "$DIR"
