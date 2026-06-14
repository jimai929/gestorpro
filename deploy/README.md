# Despliegue de GestorPro (P0)

Infra como código del despliegue descrito en `docs/DESPLIEGUE.md`: una instancia
en un VPS con **Caddy** (TLS + SPA + reverse proxy), **backend** Fastify y
**Postgres** con dos roles (`gestorpro_migrador` / `gestorpro_app`). El stack se
levanta con `deploy.sh`, que aplica migraciones, fija los permisos (incluido el
append-only de `auditoria`) y verifica la integridad antes de exponer la app.

> Lo que NO automatiza este repo (necesita tus cuentas): comprar el VPS, el DNS,
> el correo de ACME y generar los secretos. Eso son los pasos manuales de abajo.

## Arquitectura

- `app.<dominio>` → SPA estático (Vite, `VITE_API_URL=https://api.<dominio>` en build).
- `api.<dominio>` → backend (`CORS_ORIGEN=https://app.<dominio>`), sin puerto público.
- Postgres en la red interna (sin puerto público). TZ `America/Panama` en todo.
- El backend corre con `gestorpro_app` (datos, sin DDL; en `auditoria` solo
  SELECT/INSERT). Las migraciones corren con `gestorpro_migrador` (dueño).

## Requisitos del VPS

- 2 vCPU / 4 GB / 40 GB SSD basta (decenas de usuarios).
- Docker Engine + plugin Compose v2.
- Puertos 80 y 443 abiertos. DNS: registros A de `app.<dominio>` y `api.<dominio>`
  apuntando a la IP del VPS (necesarios para que Caddy emita los certificados).

## Pasos

1. Instalar Docker y clonar el repo en el VPS:
   ```bash
   git clone https://github.com/jimai929/gestorpro.git
   cd gestorpro/deploy
   ```
2. Crear y rellenar el entorno (NUNCA se commitea):
   ```bash
   cp .env.example .env
   chmod 600 .env
   # editar .env: DOMINIO, ACME_EMAIL, las 3 contraseñas de Postgres,
   # JWT_ACCESS_SECRET, ADMIN_PASSWORD. FICHAJE_REVISION_TOTAL=true.
   ```
   **Contraseñas de Postgres**: van dentro de URLs de conexión, así que solo
   pueden ser URL-safe `[A-Za-z0-9._-]` (sin `@ : / # ? % &` ni espacios);
   genera cada una con `openssl rand -hex 32`. `deploy.sh` aborta si no lo son.
   **JWT_ACCESS_SECRET**: `openssl rand -base64 48` (no va en una URL, admite
   cualquier carácter). No existe `JWT_REFRESH_SECRET`: los refresh token se
   guardan en la BD, no se firman con un secreto aparte.
3. Desplegar:
   ```bash
   chmod +x deploy.sh
   ./deploy.sh
   ```
   `deploy.sh` valida primero que estén todas las variables críticas
   (`:?`) y que las contraseñas de DB sean URL-safe; luego: build → Postgres →
   `migrate deploy` (migrador) → grants + append-only → seed base → **verifica el
   append-only exigiendo que el UPDATE de `auditoria` como app sea rechazado por
   permisos** (con aserción positiva de que la tabla existe) → levanta backend,
   **espera a que esté `healthy`** y solo entonces levanta caddy.
4. Verificar:
   ```bash
   curl -fsS https://api.<dominio>/health        # {"estado":"ok",...}
   # y abrir https://app.<dominio> en el navegador
   ```

## Actualizaciones

Volver a desplegar es seguro y repetible:
```bash
git pull
cd deploy && ./deploy.sh
```
`deploy.sh` reaplica grants y la verificación append-only tras cada `migrate
deploy` (las migraciones futuras crean tablas que heredan los grants por los
default privileges del initdb; la excepción de `auditoria` se reimpone siempre).

## Roles de Postgres (resumen)

- `gestorpro_migrador`: dueño de la base y de las tablas. Solo lo usa el paso de
  migración/seed de `deploy.sh`. Su URL se construye en el script desde `.env`.
- `gestorpro_app`: login de la app. SELECT/INSERT/UPDATE/DELETE en las tablas de
  negocio; en `auditoria` solo SELECT/INSERT (append-only). Es el `DATABASE_URL`
  del servicio backend.

## Backups y restauración

- **Backup** (`backup.sh`): vuelca roles (`pg_dumpall --roles-only`) y datos
  (`pg_dump -Fc`) a `deploy/backups/` con marca de tiempo y permisos 600;
  retención configurable (`RETENCION_DIAS`, 30 días por defecto). `backups/` está
  en `.gitignore` (los volcados contienen datos y hash de contraseñas). Programar
  por cron diario, p. ej.:
  ```cron
  15 3 * * * cd /ruta/gestorpro/deploy && ./backup.sh >> /var/log/gestorpro-backup.log 2>&1
  ```
- **Prueba de restauración** (`restore.sh [TS]`): restaura el último backup (o el
  TS indicado) en un contenedor Postgres EFÍMERO y verifica roles + datos +
  append-only de `auditoria`, **sin tocar producción**. Correr al montar el
  entorno y luego trimestralmente.
- **Recuperación real** en un servidor nuevo (mismos pasos que verifica
  `restore.sh`, contra el Postgres destino):
  1. `psql -U postgres -f roles_<ts>.sql` (los roles, primero).
  2. `createdb -O gestorpro_migrador gestorpro`.
  3. `pg_restore -d gestorpro gestorpro_<ts>.dump`.
  4. Verificar: un `UPDATE auditoria` como `gestorpro_app` debe dar `permission denied`.

## Pendiente fuera de este P0 (ver docs/DESPLIEGUE.md)

- Backups: scripts `backup.sh` / `restore.sh` listos (ver arriba). Falta el lado
  operativo: programar el cron y la copia cifrada FUERA del VPS (el volumen
  Docker no es backup).
- Monitoreo de `https://api.<dominio>/health` con alerta.
- Allowlist de IPs del kiosco en el `Caddyfile` (gate de P2; bloque ya listo,
  comentado): define `SEDE_IPS` en `.env` y descoméntalo.
