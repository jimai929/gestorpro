# Runbook — Despliegue multitenant al VPS (ejecución manual de Jim)

Guion paso a paso para ACTIVAR el multitenant (RLS + roles + Fase 3/4c) en el VPS,
que hoy predata la Fase 5 (`20260613120000_kiosco_token`). **Ningún paso lo ejecuta
Claude Code**: la frontera real es persistente (nivel-hierro). Claude Code solo dejó
los scripts/migraciones listos y verificados en LOCAL (Testcontainers 219/219).

Leyenda: 🖐️ **Jim en el VPS (ssh)** · 🤖 **Claude Code, ya listo/verificado en local**
· 🔴 **nivel-hierro (irreversible / toca entorno persistente)**.

Fuentes: `deploy/deploy.sh`, `deploy/postgres/initdb/01-init-roles.sh`,
`deploy/postgres/post-migrate.sql`, `deploy/docker-compose.yml`, `deploy/Caddyfile`,
`deploy/backup.sh`, `deploy/restore.sh`, `backend/.env.example`, `deploy/.env.example`,
`docs/ARQUITECTURA_MULTITENANT.md`.

---

## 0. Cadena de dependencias (entender antes de tocar)

`deploy.sh` corre: build → postgres → **3)** `migrate deploy` (migrador) → **4)**
`post-migrate.sql` (crea RLS/REVOKE/policies) → **4b)** gate RLS armada → **5)** seed
(migrador) → **6)** gate append-only → backend → valida Caddyfile → caddy.

**Dependencia crítica:** el paso 4 crea `FORCE ROW LEVEL SECURITY`; el paso 5 (seed)
corre como `gestorpro_migrador`. Si el migrador NO tiene `BYPASSRLS`, el FORCE lo
sujeta y el seed falla con `WITH CHECK`. ⇒ **`gestorpro_migrador` DEBE tener BYPASSRLS
ANTES del paso 5.** En volumen nuevo lo hace el `initdb`; en volumen ya existente hay
que hacerlo a mano (§3-B).

---

## 1. Pre-check (🖐️ Jim, solo lectura)

Desde `gestorpro/deploy`, con `set -a; source .env; set +a`:

**1.1 git / migraciones**
```bash
git -C ~/ruta/gestorpro log -1 --oneline
DATABASE_URL="postgresql://gestorpro_migrador:$GESTORPRO_MIGRADOR_PASSWORD@postgres:5432/gestorpro?schema=public" \
  docker compose run --rm -e DATABASE_URL backend npx prisma migrate status
```
- Esperado: última aplicada = `20260613120000_kiosco_token`; el resto multitenant PENDIENTE.
- Anómalo: si ya hay migraciones multitenant aplicadas → PARAR y revisar antes de seguir.

**1.2 ¿Existe el volumen pgdata?** (decide §3-A vs §3-B)
```bash
docker volume ls | grep -i pgdata
```
- Sin salida → volumen NUEVO (§3-A). · Con salida → volumen EXISTENTE (§3-B, 🔴).

**1.3 Rol de la app (no-owner)**
```bash
grep -E '^\s*DATABASE_URL' docker-compose.yml          # debe ser gestorpro_app:...
docker compose exec -T postgres psql -U postgres -d gestorpro -tAX \
  -c "SELECT tableowner FROM pg_tables WHERE tablename='auditoria';"
```
- Esperado: compose usa `gestorpro_app`; owner de auditoria = `gestorpro_migrador`.
- Anómalo: owner = `gestorpro_app` → el REVOKE append-only no aplica → PARAR.

**1.4 BYPASSRLS del migrador (lo más crítico)**
```bash
docker compose exec -T postgres psql -U postgres -d gestorpro -tAX \
  -c "SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname IN ('gestorpro_migrador','gestorpro_app');"
```
- Esperado: `gestorpro_migrador|t`, `gestorpro_app|f`.
- `gestorpro_migrador|f` → hay que hacer §3-B antes del deploy. · `gestorpro_app|t` → PARAR (fatal).

---

## 2. Verificación de unicidad por-empresa (POST-migración, NO antes)

> Antes esto figuraba como "§0 pre-check, correr ANTES de migrar". Era
> contradictorio: las queries usan `empresa_id` / `sede.empresa_id`, columnas que
> **recién crea la migración (ola1)**. En el VPS actual (kiosco_token) esas columnas
> NO EXISTEN, así que estas SQL **no se pueden correr antes de migrar**; y como
> `migrate deploy` aplica ola1→Fase 3 de forma ATÓMICA, tampoco hay un punto
> intermedio donde insertarlas. Queda corregido aquí.

**Quién protege de verdad (fail-closed) = la propia migración.** Cada paso
`@unique → @@unique([empresa_id, …])` ejecuta un `CREATE UNIQUE INDEX`; si hubiera un
duplicado, ese índice FALLA y `migrate deploy` ABORTA la transacción entera (no deja
la BD a medias). No hay que "confirmar 0 filas antes": el motor lo garantiza al crear
el índice. Y como el VPS es single-tenant (una Empresa Default), el global-unique ⊆
per-empresa-unique → 0 duplicados por construcción.

**Uso real de estas SQL = confirmación POST-migración / diagnóstico.** Correrlas
DESPUÉS de un `migrate deploy` exitoso, como constancia de que la unicidad compuesta
quedó intacta y no hay huérfanos:

```sql
SELECT empresa_id, nombre, count(*) FROM categoria_gasto GROUP BY 1,2 HAVING count(*)>1;
SELECT empresa_id, fecha,  count(*) FROM dia_festivo     GROUP BY 1,2 HAVING count(*)>1;
SELECT s.empresa_id, e.numero,   count(*) FROM empleado e JOIN sede s ON s.id=e.sede_id GROUP BY 1,2 HAVING count(*)>1;
SELECT s.empresa_id, e.qr_token, count(*) FROM empleado e JOIN sede s ON s.id=e.sede_id GROUP BY 1,2 HAVING count(*)>1;
SELECT count(*) AS empleados_sin_empresa FROM empleado e JOIN sede s ON s.id=e.sede_id WHERE s.empresa_id IS NULL;
SELECT empresa_id, count(*) FROM configuracion_cobro GROUP BY 1 HAVING count(*)>1;
```
- Todas: esperado **0 filas** (confirma la post-condición).
- Si en cambio el `migrate deploy` ABORTÓ por conflicto de unique: leer el índice del
  error → restaurar el backup (§4.3) → limpiar el duplicado en la fuente → reintentar.
  (En single-tenant no debería ocurrir.)

---

## 3. Decisión nivel-hierro (una de las dos rutas, según §1.2)

### 3-A. Volumen NUEVO — NO nivel-hierro
- `initdb` (`01-init-roles.sh`) crea en el primer arranque `gestorpro_migrador LOGIN
  BYPASSRLS` + `gestorpro_app LOGIN NOBYPASSRLS` + base owner=migrador.
- Sin ALTER ROLE manual. Ir a §4.

### 3-B. Volumen EXISTENTE (VPS pre-Fase 5) — 🔴 nivel-hierro
- `initdb` NO se re-ejecuta → atributos de rol no se actualizan.
- Si §1.4 muestra `migrador|f`, 🖐️ ejecutar como superusuario (**tras §6 backup**):
  ```sql
  ALTER ROLE gestorpro_migrador BYPASSRLS;
  ```
- Antes de ejecutar, Jim confirma: ① backup §6 hecho y no vacío; ② §1.4 realmente es `f`.
- El GRANT sobre auditoria lo aplica la migración `20260621223903` durante el deploy
  (no manual).

---

## 4. Orden de despliegue (🖐️ Jim)

**4.1 Variables de entorno** (`deploy/.env`; plantilla 🤖 lista en `.env.example`)
- Obligatorias (deploy.sh aborta con `:?` si faltan): `DOMINIO`, `ACME_EMAIL`, las 3
  contraseñas Postgres URL-safe (`openssl rand -hex 32`), `JWT_ACCESS_SECRET`,
  `ADMIN_PASSWORD`.
- Opcionales: `SUPER_ADMIN_EMAIL`/`SUPER_ADMIN_PASSWORD` (si defines EMAIL, en prod la
  PASSWORD es obligatoria; **correo DEDICADO** o el seed aborta por la guarda anti-promoción),
  `SEDE_IPS` (allowlist), `FICHAJE_REVISION_TOTAL=true`.

**4.2 🔴 Backup ANTES de migrar** (deploy.sh paso 2c ahora lo EXIGE si hay pendientes)
```bash
./backup.sh && ./restore.sh        # restore.sh verifica en contenedor efímero, no toca prod
```

**4.3 Deploy**
```bash
chmod +x deploy.sh && ./deploy.sh
```
| Paso | Acción | Éxito | Fallo |
|---|---|---|---|
| 3 | migrate deploy 🔴 | "All migrations applied" | conflicto unique → restaurar backup |
| 4 | post-migrate.sql | sin error | abort → revisar permisos migrador |
| **4b** | gate RLS armada | "RLS armada…app NOBYPASSRLS" | tabla tenant sin FORCE / vista sin security_invoker / app BYPASSRLS → **abort** |
| 5 | seed (migrador) | "Semilla aplicada" | si falla con §1.4=`f` → faltó §3-B |
| **6** | gate append-only | "app…NO puede modificar auditoria" | UPDATE no rechazado → **abort** |
| — | Caddyfile + caddy | "Despliegue completo" | error sintaxis → abort (backend ya healthy) |

**Rollback:** `migrate deploy` es irreversible; el rollback es restaurar el backup §6
(roles.sql → createdb -O migrador → pg_restore → verificar append-only).

---

## 5. Verificación post-deploy (🖐️ Jim)

**5.1 append-only sobre app** (deploy.sh paso 6 ya lo verifica)
```bash
docker compose exec -T postgres psql -U gestorpro_app -d gestorpro \
  -c "UPDATE auditoria SET accion=accion;"          # esperado: ERROR permission denied
```
**5.2 RLS fail-closed**
```bash
docker compose exec -T postgres psql -U gestorpro_app -d gestorpro -tAX \
  -c "SELECT count(*) FROM gasto;"                   # esperado: 0 (sin contexto de tenant)
```
**5.3 super-admin (si SUPER_ADMIN_EMAIL definido)**
```bash
curl -fsS -X POST https://api.<dominio>/auth/login -H 'content-type: application/json' \
  -d '{"email":"<super-admin>","password":"<...>"}'  # 200; payload esSuperAdmin=true, empresaId=null
```
**5.4 salud + admin**
```bash
curl -fsS https://api.<dominio>/health              # {"estado":"ok"}
```
> 🤖 Estos contratos están cubiertos por la suite local (rls-frontera-db,
> runtime-credenciales, auditoria-append-only, auth/empresa/me): aquí se recomprueban
> en el entorno real.

---

## 6. Riesgos + huecos (hallazgos de la inspección)

1. **🔴 deploy.sh NO hace backup antes de migrar.** `backup.sh` es independiente y no se
   invoca. La primera migración multitenant es estructural (columnas/FK/RLS/backfill de
   auditoria). **Hacer §4.2 a mano**: es la única vía de rollback.
2. **§0 pre-check, momento contradictorio (§2).** El doc decía "antes de migrar" pero las
   SQL dependen de columnas que crea la migración. Para single-tenant es 0 duplicados por
   construcción; el gate real es el `CREATE UNIQUE INDEX` + post-deploy.
3. **Volumen existente + migrador sin BYPASSRLS = trampa silenciosa en el paso 5.**
   deploy.sh no lo detecta ni hace el ALTER (el initdb solo cubre volumen nuevo). Si Jim
   omite §1.4/§3-B, falla recién en seed. (Mejora 🤖 posible: aserción de solo lectura en
   deploy.sh antes del paso 3 que falle-LOUD si `migrador.rolbypassrls=f`.)
4. **deploy.sh asume base creada por initdb**: el paso 2 verifica que exista la base, no
   los atributos de rol (mismo origen que #3).
5. **SUPER_ADMIN_EMAIL mal puesto** (cuenta de uso diario) → el seed aborta por la guarda
   §4.2 (correcto, pero el deploy falla en seed: usar correo dedicado).
6. **allowlist (P2)** desacoplada: requiere IP fija por sede; si no, dejar comentada (token
   de dispositivo protege). No es requisito de salida. Ver `CHECKLIST_PRODUCCION.md` §P2.

---

## Reparto

| Tarea | Quién |
|---|---|
| §1 pre-check, §3-B ALTER ROLE, §4 deploy, §5 verificación, §6.1 backup | 🖐️ **Jim en el VPS** |
| Scripts/migraciones/gates, plantillas `.env.example`, contratos en Testcontainers | 🤖 **Claude Code (listo/verificado)** |
| Mejoras de doc/script #2 y #3 (pendientes de aprobación) | 🤖 **local, bajo aprobación** |
