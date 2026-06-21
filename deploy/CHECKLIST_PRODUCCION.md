# Checklist de pre-producción — GestorPro

Puntos que faltan ANTES (o justo DESPUÉS) de poner la app en producción. Cada
ítem indica **tipo** (Bloqueante / Recomendado), **estado actual** y
**responsable** (Legal = Jim busca al asesor · Técnico = Claude Code).

> Estado del producto: Fases 0–6 completas, tests verdes (backend 136/136,
> frontend 34/34), i18n es/en/zh, `deploy/` validado en LOCAL. El único
> obstáculo real para producción es desplegar en un VPS real.

## Resumen

| # | Ítem | Tipo | Estado | Responsable |
|---|------|------|--------|-------------|
| 1 | Validación legal de `legal.ts` | 🔴 Bloqueante | ✅ Validado — J. M. Jaramillo, 2026-06-14 | Legal (Jim) |
| 2 | Rol app no-owner + REVOKE de `auditoria` | 🔴 Bloqueante | Implementado en scripts + verificado local; falta correr en VPS | Técnico |
| 3 | L5: quitar `modoExcepcion` de `GET /kioscos` | 🔴 Bloqueante (seguridad) | ✅ Hecho (commits f8de57b + 6e59405) | Técnico |
| 4 | Firestec — total de ventas diario | 🟡 Recomendado | Cerrado (manual) | Legal (Jim) |
| 5 | Post-deploy: backup cron + copia externa + monitoreo | 🔴 Bloqueante | Scripts listos; falta operativa | Técnico (+ VPS de Jim) |

---

## 1. Validación legal panameña (`backend/src/asistencia/jornada/legal.ts`)

- **Tipo:** 🔴 Bloqueante (gate de la asistencia en producción — se calculan
  salarios y recargos legales).
- **Estado actual:** ✅ VALIDADO. Asesor laboral panameño **Jose Moise
  Jaramillo**, fecha **2026-06-14**; los 11 parámetros (divisor 240; recargos
  25/50/75/150 %; franja 18:00–06:00; jornadas 8/7/7.5 h; topes 3 h/día y
  9 h/semana) confirmados SIN cambios. Registro trazable en
  `docs/VALIDACION_LEGAL.md` (banner de cabecera + sección "Cierre del gate" con
  el veredicto por parámetro). Firma física en poder de Jim. **Pendiente menor
  (no bloquea):** anotar la matrícula del asesor cuando Jim la facilite.
- **Responsable:** Legal (Jim aporta firma y matrícula) → Técnico (Claude Code)
  ya dejó el registro en `docs/VALIDACION_LEGAL.md`.

## 2. Postgres: rol de app no-owner + REVOKE de `auditoria` verificado

- **Tipo:** 🔴 Bloqueante (seguridad e integridad: el backend no debe poder
  alterar `auditoria`; append-only).
- **Estado actual:** ✅ IMPLEMENTADO EN LOS SCRIPTS (no solo documentado) y
  verificado en LOCAL. Confirmado leyendo:
  - `deploy/docker-compose.yml:45` — el servicio `backend` se conecta con
    `DATABASE_URL=postgresql://gestorpro_app:…` → **la app usa el rol restringido
    `gestorpro_app`, que NO es dueño de las tablas**.
  - `deploy/postgres/initdb/01-init-roles.sh` — crea la base con
    `OWNER gestorpro_migrador`; crea `gestorpro_app` con `REVOKE CREATE ON SCHEMA
    public` y default privileges de solo datos (SELECT/INSERT/UPDATE/DELETE).
  - `deploy/postgres/post-migrate.sql:17-18` — tras cada migración,
    `REVOKE UPDATE, DELETE, TRUNCATE ON auditoria` a `gestorpro_app` (y a PUBLIC):
    es el append-only.
  - `deploy.sh` — corre `migrate deploy`/seed como `gestorpro_migrador` (dueño) y
    **asevera** que un `UPDATE auditoria` como `gestorpro_app` sea rechazado por
    `permission denied`; si no, aborta el despliegue.
  - **Pendiente:** que esa verificación corra en el VPS real (es automática al
    ejecutar `deploy.sh`).
- **Responsable:** Técnico (implementado en scripts; se confirma al correr
  `deploy.sh` en el VPS).

## 3. L5 — quitar `modoExcepcion` del `GET /kioscos` público

- **Tipo:** 🔴 Bloqueante (SEGURIDAD — divulgación de información).
- **Por qué es bloqueante:** `GET /kioscos` es un endpoint **público** (sin JWT;
  lo consume el kiosco). Hoy devuelve el `modoExcepcion` de cada sede, es decir
  **revela el modo de fichaje de excepción de cada sede** (pin / supervisor /
  ambos) a cualquiera en internet. Eso le dice a un atacante qué credencial
  alternativa atacar por sede (fuerza bruta de PIN vs. credencial de supervisor).
  Es divulgación de información y reduce la superficie de defensa → **hay que
  quitarlo antes de exponer la app**.
- **Estado actual:** ✅ HECHO (commits f8de57b + 6e59405). El `GET /kioscos`
  público usa un `select` explícito que NUNCA expone `modoExcepcion` ni
  `tokenHash` (ver `backend/src/asistencia/fichaje/fichaje.routes.ts:88-90`); el
  tipo `Sede` del front se alineó para no esperar ese campo. El kiosco recibe el
  `modoExcepcion` solo en el flujo de excepción, vía el 409 del `POST /fichajes`
  (autorizado por token de dispositivo), no en el listado público.
- **Responsable:** Técnico (Claude Code) — cerrado.

## 4. Firestec — total de ventas diario

- **Tipo:** 🟡 Recomendado (no bloquea; afecta solo la comodidad de captura).
- **Estado actual:** ✅ CERRADO (decidido 2026-06-17): la captura del cierre
  diario es **100 % manual**; Firestec no tiene API y **no se integra**. Ya
  implementado en `FormularioVenta.tsx`. Sin acción pendiente. (Si en el futuro
  Firestec expusiera el total, podría hacerse semi-asistida sin cambios de
  modelo.)
- **Responsable:** Legal/Negocio (Jim) — decisión ya tomada.

## 5. Post-despliegue: backup cron + copia externa cifrada + monitoreo

- **Tipo:** 🔴 Bloqueante (operacional: sin copia FUERA del VPS, un fallo del
  host = pérdida de datos; el volumen Docker NO es un backup).
- **Estado actual:** ✅ Scripts listos y probados en local: `backup.sh`
  (`pg_dumpall --roles-only` + `pg_dump -Fc`, retención, permisos 600) y
  `restore.sh` (restaura en contenedor efímero y verifica roles + datos +
  append-only). **Falta la parte operativa en el VPS:**
  - [ ] Cron diario de `backup.sh` (ej. `15 3 * * *`).
  - [ ] Copia cifrada de los volcados a almacenamiento FUERA del VPS.
  - [ ] Monitoreo de `https://api.<dominio>/health` con alerta.
  - [ ] Tras el primer despliegue: una prueba de `restore.sh` real.
- **Responsable:** Técnico (Claude Code configura) — requiere el VPS de Jim.

---

## Otros recordatorios al desplegar (no son ítems del gate, pero no olvidar)

- Rellenar `deploy/.env` (copiar de `.env.example`): `DOMINIO`, `ACME_EMAIL`,
  las 3 contraseñas de Postgres URL-safe (`openssl rand -hex 32`),
  `JWT_ACCESS_SECRET`, `ADMIN_EMAIL` real/no adivinable, `ADMIN_PASSWORD`.
- `FICHAJE_REVISION_TOTAL=true` en prod (riesgo aceptado con el verificador
  facial simulado: todo fichaje a revisión).
- Validar el `Caddyfile` tras editarlo (p. ej. al activar la allowlist de IPs del
  kiosco). El comando depende de si caddy ya está corriendo:
  - Stack levantado (post-deploy) → `exec` (corre dentro del contenedor vivo):
    `docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile`.
  - Caddy aún NO levantado (validación previa) → `run` en contenedor efímero:
    `docker compose run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile`.
  - La imagen caddy no tiene ENTRYPOINT, por eso el comando lleva `caddy` (sin él:
    `exec: "validate": not found`). `deploy.sh` ya valida el Caddyfile antes de
    levantar caddy en cada despliegue.
- Servidor en zona horaria `America/Panama` (afecta la clasificación
  diurna/nocturna del motor de jornada).
- Tras cada `git pull` en el VPS: `prisma migrate deploy` (la BD persistente
  puede quedar atrás de las migraciones; verificar con `prisma migrate status`).
