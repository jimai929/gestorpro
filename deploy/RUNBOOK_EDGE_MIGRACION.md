# Runbook — migración al borde compartido (`/srv/edge`) en el VPS

Contexto (estado real verificado 2026-08-24): en el VPS `45.77.198.133` conviven
**GestorPro** (`/srv/gestorpro`, compose `deploy`: caddy con 80/443 + backend +
postgres, red `deploy_interna`) y **WinFleet** (contenedor suelto `winfleet`,
`docker run` desde `/opt/winfleet/releases/<tag>/deploy/upgrade-vps.sh`, datos en
`/var/lib/winfleet`, entorno en `/etc/winfleet/`). WinFleet estaba enchufado a la
red `deploy_interna` y expuesto por un bloque escrito a mano en el `Caddyfile` de
GestorPro (sin versionar, `git status` sucio en el VPS). El Caddyfile se hornea en
la imagen caddy (`Caddy.Dockerfile`), así que cada deploy de GestorPro dependía de
esa modificación local.

Objetivo: un solo Caddy de borde en `/srv/edge` (TLS, 80/443, `import sites/*.caddy`),
GestorPro con caddy interno HTTP, WinFleet con su propio fragmento. Ninguno toca la
configuración del otro.

Cada paso con SSH/deploy requiere autorización de Jim. Sin excepción.

---

## Fase A (repo, ya hecha) — commit "borde compartido"

`deploy/edge/` (compose + Caddyfile + `sites/gestorpro.caddy`), `Caddyfile` interno
(`auto_https off`, `http://`, `trusted_proxies`), `docker-compose.yml` (`name: deploy`,
caddy sin puertos, red externa `edge`, alias `gestorpro-web`), `deploy.sh` (paso 0:
red + `/srv/edge`; al final: valida borde → caddy interno → instala fragmento → reload).

## Fase B (VPS) — switch, ventana de corte de segundos

Orden importa: el borde arranca SOLO cuando el caddy viejo suelta 80/443, y WinFleet
tiene que estar alcanzable desde la red `edge` ANTES de que el borde lo enrute.

1. **Backup normal** de GestorPro (`bash /srv/gestorpro/deploy/backup.sh`, verificar
   `pg_restore -l < dump`). No hay migraciones en este release, pero es el switch
   del borde público: red de seguridad completa.
2. **Preparar el borde sin arrancarlo**:
   ```bash
   docker network create edge
   mkdir -p /srv/edge/sites && chmod 700 /srv/edge
   ```
   `/srv/edge/.env` (ACME_EMAIL) NO se crea a mano: lo siembra `deploy.sh` (paso 0)
   con el mismo correo de GestorPro, así se reutiliza la cuenta ACME existente.
3. **WinFleet → fragmento propio + red edge** (sin cortarlo; puede estar en dos redes):
   ```bash
   docker network connect edge winfleet
   cat > /srv/edge/sites/winfleet.caddy <<'EOF'
   # WinFleet (proyecto ajeno a GestorPro). Fragmento propiedad de WinFleet.
   45-77-198-133.sslip.io {
   	encode zstd gzip
   	request_body {
   		max_size 1MB
   	}
   	header {
   		Strict-Transport-Security "max-age=31536000; includeSubDomains"
   		-Server
   	}
   	reverse_proxy winfleet:4173
   }
   EOF
   ```
   (Es el bloque literal que estaba en el Caddyfile de GestorPro.)
4. **Conservar los certificados** (evita reemisión en Let's Encrypt): copiar el
   volumen del caddy viejo al del borde ANTES del primer `up` del borde. El volumen
   destino se llama `edge_caddy_data` (proyecto `edge`); crearlo con la etiqueta de
   compose para que `up` lo adopte sin quejarse:
   ```bash
   docker volume create --label com.docker.compose.project=edge --label com.docker.compose.volume=caddy_data edge_caddy_data
   docker volume create --label com.docker.compose.project=edge --label com.docker.compose.volume=caddy_config edge_caddy_config
   docker run --rm -v deploy_caddy_data:/from:ro -v edge_caddy_data:/to alpine sh -c 'cp -a /from/. /to/ && ls /to/caddy/certificates'
   ```
   Debe listar `acme-v02.api.letsencrypt.org-directory/` con `app.<dominio>` y
   `api.<dominio>`. Los locks obsoletos en `/to/caddy/locks/` los expira Caddy solo.
5. **Limpiar el working tree del VPS y traer el commit**. El bloque de WinFleet ya
   vive en `/srv/edge/sites/winfleet.caddy` (paso 3), así que descartar la
   modificación local es seguro:
   ```bash
   cd /srv/gestorpro
   git diff deploy/Caddyfile            # confirmar que lo ÚNICO local es el bloque WinFleet
   git checkout -- deploy/Caddyfile
   rm -f deploy/Caddyfile.before-winfleet-20260714 deploy/Caddyfile.winfleet-new
   git status --short                   # limpio
   git pull --ff-only
   ```
6. **Deploy** (`bash deploy/deploy.sh`). Secuencia relevante: paso 0 encuentra red y
   `/srv/edge/.env` ya creados (no los toca) e instala compose + Caddyfile del borde →
   … → valida el borde completo (gestorpro + winfleet) → recrea el caddy interno
   (suelta 80/443; aquí empieza el corte) → `edge up -d` (toma 80/443; termina el
   corte) → reload.
7. **Post-check** (todo obligatorio):
   ```bash
   docker ps --format '{{.Names}}\t{{.Ports}}'        # SOLO edge-proxy publica 80/443
   curl -fsS https://api.<dominio>/health
   curl -fsSI https://app.<dominio> | head -1          # 200
   curl -fsSI https://45-77-198-133.sslip.io | head -1 # WinFleet 200/30x
   docker compose --project-directory /srv/edge logs proxy | grep -ci 'obtain'  # 0 = sin reemisión
   cd /srv/gestorpro && git rev-parse HEAD             # = local = origin
   ```
   Y desde el navegador: login en app.<dominio>.
8. **Desenchufar WinFleet de la red de GestorPro** (ya no la necesita; cierra el
   acoplamiento): `docker network disconnect deploy_interna winfleet`. Verificar
   otra vez la URL de WinFleet.

### Rollback de la Fase B

El caddy viejo necesita 80/443, que ahora tiene el borde: primero tumbar el borde.
```bash
docker compose --project-directory /srv/edge down          # libera 80/443
cd /srv/gestorpro && git checkout 3527120 -- deploy/       # versión pre-borde
cat /srv/edge/sites/winfleet.caddy >> deploy/Caddyfile      # WinFleet vuelve al Caddyfile
docker compose -f deploy/docker-compose.yml up -d --build caddy
```
`deploy_caddy_data` NO se borra en ningún paso (queda como respaldo de certificados).
Nada de esto toca `deploy_pgdata` ni la base de datos.

## Fase C (HECHA 2026-08-25) — ordenar y limpiar

Layout final del VPS:
```
/srv/edge/        borde compartido (compose `edge`, Caddyfile, sites/*.caddy, .env)
/srv/gestorpro/   este repo (compose `deploy`; symlink de compatibilidad /root/gestorpro)
/srv/winfleet/    releases/ data/ etc/ README  (symlinks /opt/winfleet, /var/lib/winfleet,
                  /etc/winfleet → aquí, para que upgrade-vps.sh del repo WinFleet siga funcionando)
/root/ops/        cron de backup + monitor de GestorPro (rutas ya en /srv/gestorpro)
```
- WinFleet: reubicado con `mv` + symlinks (sin recrear el contenedor). PENDIENTE en el
  repo WinFleet: `upgrade-vps.sh` usa `NETWORK=deploy_interna` por defecto; hasta que
  cambie a `edge`, cada deploy de WinFleet debe pasar `edge` como 3er argumento (si no,
  el contenedor nuevo no está en la red del borde → 502).
- Limpieza: 12 contenedores parados `winfleet-backup-*`/`rollback-*`, 11 imágenes
  viejas (quedan `winfleet:7655108` actual y `1.2.0` anterior), `/opt/winfleet-*`,
  `/root/deploy_*.log`, 4 volúmenes anónimos sin referencias, build cache (30 GB).
  `deploy_caddy_data`/`deploy_caddy_config` se conservan como respaldo de certificados.
- `/root/gestorpro` → `/srv/gestorpro`: `mv` + symlink; `docker compose up -d` recreó
  los contenedores (working_dir nuevo; volúmenes y red intactos, proyecto sigue
  siendo `deploy`); rutas actualizadas en `/root/ops/*.sh`, `deploy/offsite-diario.sh`
  y la whitelist del guard (`.claude/hooks/deploy-guard.js` + su suite).
