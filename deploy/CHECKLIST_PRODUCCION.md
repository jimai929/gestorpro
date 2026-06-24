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

---

## Activación de la allowlist de IPs del kiosco (Caddy) — P2

Defensa en profundidad SOBRE el token de dispositivo (que ya es obligatorio).
La plantilla está **escrita pero COMENTADA** en `Caddyfile:37-49` (matcher
método-consciente: restringe solo `POST /fichajes` y `GET /kioscos` a las IPs de
sede, SIN bloquear los endpoints admin con JWT). **No se activa en local** porque
el bloque allowlist no se puede validar con `caddy validate` sin la imagen/red del
stack. Flujo de activación, EN EL VPS:

1. **Requisito:** cada sede debe tener **IP de salida FIJA**. Si alguna no la
   tiene, **dejar la allowlist comentada**: el token de dispositivo sigue
   protegiendo el fichaje (no degradar la disponibilidad por una sede sin IP fija).
2. Definir `SEDE_IPS` en `deploy/.env` (IPs separadas por espacio).
3. Descomentar los DOS bloques de `Caddyfile:37-49`.
4. Validar ANTES de recargar (stack ya levantado):
   ```bash
   docker compose exec caddy caddy validate --config /etc/caddy/Caddyfile
   ```
5. Recargar caddy: `docker compose up -d caddy` (o `caddy reload`).
6. Verificar: una petición `POST /fichajes` desde una IP de sede pasa; desde una
   IP externa responde `403`.

Reversible: volver a comentar los bloques + `caddy validate` + recargar. No toca
datos → **no es nivel-hierro**.

---

## Despliegue multitenant al VPS — checklist nivel-hierro (RLS / roles)

El VPS predata la Fase 5 (sigue en `20260613120000_kiosco_token`): al desplegar
multitenant se activan los dos roles + RLS. Como toca un entorno persistente,
**verificar el estado REAL del VPS por ssh ANTES de actuar** (regla nivel-hierro,
ver `docs/DECISIONES.md` · Integridad de datos). NO asumir nada.

**Trampa clave:** el `initdb` (`01-init-roles.sh`) **solo corre en el primer
arranque de un volumen NUEVO**. Si el VPS ya tiene volumen `pgdata`, un redeploy
NO recrea roles ni aplica `BYPASSRLS` — hay que hacerlo a mano.

1. **¿El migrador tiene BYPASSRLS?**
   ```sql
   SELECT rolname, rolbypassrls FROM pg_roles
   WHERE rolname IN ('gestorpro_migrador','gestorpro_app');
   ```
   - `gestorpro_migrador` debe ser `t` (si es `f` → falta el ALTER, paso 4).
   - `gestorpro_app` debe ser `f` (NUNCA `t`: sería saltarse el aislamiento).
2. **¿En qué migración está el VPS?** `prisma migrate status` (esperado hoy:
   `20260613120000_kiosco_token`; al desplegar, `migrate deploy` aplicará en orden
   ola1 → ola2 → … → Fase 3 de una vez).
3. **¿Existe ya el volumen `pgdata`?** `docker volume ls | grep pgdata`.
   - **Volumen NUEVO (no existe):** el `initdb` crea los roles con `BYPASSRLS`
     correctos → NO hace falta el paso 4.
   - **Volumen YA existente (predata Fase 5):** el `initdb` no se re-ejecuta →
     correr a mano, como superusuario (**nivel-hierro**):
     ```sql
     ALTER ROLE gestorpro_migrador BYPASSRLS;
     ```
     (el `GRANT` sobre `auditoria` lo aplica la migración `20260621223903` durante
     el `migrate deploy`; no hace falta a mano.)
4. **Pre-check de datos (relajación global→por-empresa) ANTES de migrar.** Estas
   queries son una debida diligencia: lo que cumple unicidad global cumple la
   per-empresa, así que en un VPS single-tenant (una sola Empresa Default) deben
   dar **0 filas**. (Detalle y contexto en `.scratch/fase3/plan.md` §0, nota de
   trabajo; se reproducen aquí por estar el plan fuera del control de versiones.)
   Correrlas en el punto correspondiente de la cadena de migración (cuando ya
   existe `empresa_id`):
   ```sql
   SELECT empresa_id, nombre, count(*) FROM categoria_gasto GROUP BY 1,2 HAVING count(*)>1;
   SELECT empresa_id, fecha,  count(*) FROM dia_festivo     GROUP BY 1,2 HAVING count(*)>1;
   SELECT s.empresa_id, e.numero,   count(*) FROM empleado e JOIN sede s ON s.id=e.sede_id GROUP BY 1,2 HAVING count(*)>1;
   SELECT s.empresa_id, e.qr_token, count(*) FROM empleado e JOIN sede s ON s.id=e.sede_id GROUP BY 1,2 HAVING count(*)>1;
   SELECT count(*) AS empleados_sin_empresa FROM empleado e JOIN sede s ON s.id=e.sede_id WHERE s.empresa_id IS NULL;
   SELECT empresa_id, count(*) FROM configuracion_cobro GROUP BY 1 HAVING count(*)>1;
   ```
   Si alguna da >0 filas: **parar** y resolver el duplicado antes de crear el
   unique compuesto (la migración fallaría).
5. **Tras `deploy.sh`:** el paso 4b (verificación RLS armada) y el paso 6
   (append-only como `gestorpro_app`) son gates automáticos; si algo no quedó
   aislado, el script aborta. No saltárselos.
