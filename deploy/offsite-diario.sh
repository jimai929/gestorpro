#!/usr/bin/env bash
# Offsite diario de los backups de GestorPro (corre en la MAQUINA DE JIM, no
# en el VPS): baja los pares gestorpro_*.dump / roles_*.sql que aun no esten
# en el directorio offsite local, verifica sha256 remoto-vs-local ANTES de
# cifrar, cifra con la clave GPG publica de Jim y borra el plano. Los .gpg
# nunca se borran aqui (la poda del offsite es decision manual: contiene
# backups-hito como el pre-v1.0).
#
# Programado via Task Scheduler de Windows (tarea "GestorPro offsite diario");
# tambien se puede correr a mano. Requiere: ssh con clave (BatchMode), gpg de
# Git for Windows con la clave publica importada.
#
# Automatizado con autorizacion de Jim el 2026-07-21.

set -euo pipefail

VPS="root@45.77.198.133"
REMOTO="/root/gestorpro/deploy/backups"
DESTINO="/c/Users/jimfe/backups/gestorpro"
CLAVE="3ED5860220978524755F98851FEC3C754C15C7D0"

echo "===== $(date -u +%Y-%m-%dT%H:%M:%SZ) inicio offsite diario ====="
[[ -d "$DESTINO" ]] || { echo "no existe $DESTINO" >&2; exit 1; }

# Timestamps disponibles en el VPS (del nombre de los dumps).
mapfile -t TSS < <(ssh -o BatchMode=yes -o ConnectTimeout=15 "$VPS" "ls $REMOTO/gestorpro_*.dump 2>/dev/null" \
  | sed 's/.*gestorpro_//; s/\.dump$//' | sort)
(( ${#TSS[@]} > 0 )) || { echo "el VPS no tiene dumps en $REMOTO" >&2; exit 1; }

# Pendientes = los que no tienen ya su .gpg local.
PENDIENTES=()
for ts in "${TSS[@]}"; do
  [[ -f "$DESTINO/gestorpro_${ts}.dump.gpg" ]] || PENDIENTES+=("$ts")
done

if (( ${#PENDIENTES[@]} == 0 )); then
  echo "offsite al dia: ${#TSS[@]} pares remotos, todos cifrados en local"
  exit 0
fi
echo "pares pendientes: ${#PENDIENTES[@]} (${PENDIENTES[*]})"

# Si algo falla a mitad de un par, no dejar planos sueltos en el offsite.
# OJO: el trap corre tambien en la salida normal (con ts vacio); tiene que
# terminar con exito para no pisar el codigo de salida del script.
ts=""
limpiar_plano() {
  if [[ -n "$ts" ]]; then
    rm -f "$DESTINO/gestorpro_${ts}.dump" "$DESTINO/roles_${ts}.sql"
  fi
}
trap limpiar_plano EXIT

for ts in "${PENDIENTES[@]}"; do
  dump="gestorpro_${ts}.dump"
  roles="roles_${ts}.sql"

  scp -o BatchMode=yes "$VPS:$REMOTO/$dump" "$VPS:$REMOTO/$roles" "$DESTINO/"

  # Integridad de transferencia: sha256 remoto y local deben coincidir.
  REM_SHA="$(ssh -o BatchMode=yes "$VPS" "cd $REMOTO && sha256sum $dump $roles" | awk '{print $1}' | paste -sd: -)"
  LOC_SHA="$(cd "$DESTINO" && sha256sum "$dump" "$roles" | awk '{print $1}' | paste -sd: -)"
  if [[ -z "$REM_SHA" || "$REM_SHA" != "$LOC_SHA" ]]; then
    echo "ERROR: sha256 no coincide para $ts (remoto=$REM_SHA local=$LOC_SHA)" >&2
    exit 1
  fi

  gpg --batch --yes -r "$CLAVE" -e "$DESTINO/$dump"
  gpg --batch --yes -r "$CLAVE" -e "$DESTINO/$roles"
  [[ -s "$DESTINO/$dump.gpg" && -s "$DESTINO/$roles.gpg" ]] || { echo "ERROR: cifrado vacio para $ts" >&2; exit 1; }

  rm -- "$DESTINO/$dump" "$DESTINO/$roles"
  echo "offsite OK: $ts (sha256 verificado, cifrado a ${CLAVE:0:8}..., plano borrado)"
done
ts=""

echo "total .gpg en offsite: $(ls "$DESTINO"/*.gpg 2>/dev/null | wc -l)"
echo "===== $(date -u +%Y-%m-%dT%H:%M:%SZ) fin offsite diario ====="
