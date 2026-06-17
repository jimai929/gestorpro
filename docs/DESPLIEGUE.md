# GestorPro — Diseño de despliegue (PROPUESTA)

> **Estado: PROPUESTA pendiente de aprobación de Jim.** Materializa el
> "despliegue híbrido (local en sedes + nube)" del plan, que hasta hoy era una
> línea sin diseño. No reabre ninguna decisión cerrada; donde una decisión de
> integridad condiciona la topología, se cita.

---

## 1. Decisión central: UNA instancia en la nube; las sedes son clientes

Una sola instancia (backend + Postgres) en un VPS en la nube es la fuente de
verdad. Cada sede consume la app por navegador: el kiosco de fichaje es un
navegador en modo quiosco (tablet o PC barata) apuntando a `/kiosco`, y la
administración (finanzas, jornadas, cobros) se usa desde cualquier navegador
con sesión.

**Por qué NO hay servidores por sede** (la lectura "local" fuerte del híbrido):
las invariantes de integridad del sistema están diseñadas para UNA base de
datos y se rompen o degeneran con réplicas con escritura:

- `SaldoHorasExtra` se debita con `SELECT … FOR UPDATE` (sobregiro imposible
  solo si hay un único Postgres).
- `uq_venta_normal` (un cierre por sede/fecha/turno/cajera) y el guard
  anti-sobrepago de `registrarPago` son índices/locks de una sola base.
- `Auditoria` append-only y el servicio de corrección (reverso + corrección)
  presumen un orden total de escrituras.

Un esquema multi-master por sede exigiría rediseñar todo eso. **Descartado.**

**La pata "local" del híbrido queda como continuidad operativa de la sede**
(sección 3), no como infraestructura replicada.

## 2. Topología y stack del VPS

Un VPS pequeño basta (2 vCPU / 4 GB / 40 GB SSD; la carga es decenas de
usuarios, no miles). Docker Compose con tres servicios:

```
caddy     → TLS automático (Let's Encrypt), sirve el frontend estático y
            enruta por SUBDOMINIO (ver abajo)
backend   → node dist/server.js  (imagen propia; TZ=America/Panama)
postgres  → postgres:17 (volumen con backup; TZ=America/Panama)
```

**Dos subdominios, no path-routing:** las rutas del backend viven en la raíz
(`/empleados`, `/auth/login`…) y COLISIONAN con las rutas del SPA
(`/empleados` también es pantalla). Mismo origen es inviable sin renombrar
rutas (decisión de API ya hecha). Por tanto:

- `app.<dominio>` → SPA estático (build de Vite con `VITE_API_URL=https://api.<dominio>`).
- `api.<dominio>` → backend Fastify (`CORS_ORIGEN=https://app.<dominio>`).

El código ya está preparado: `CORS_ORIGEN` (lista por comas), `VITE_API_URL`
(build-time), `PORT`/`HOST`, `/health` para monitoreo. Dominio: pendiente de
la verificación de marca anotada en DECISIONES.md.

## 3. Continuidad de fichaje sin internet en la sede

Si una sede pierde internet, el kiosco no puede fichar. Dos etapas:

- **v1 (sale con el piloto):** procedimiento administrativo — el supervisor
  anota entrada/salida en papel y, al volver la conexión, se corrige la
  jornada con el mecanismo existente (`Correccion`, inmutable, vía
  `POST /jornadas/correccion`) para cortes PARCIALES (la entrada ya quedó
  registrada). Para un corte de DÍA COMPLETO (nadie pudo fichar, no hay
  jornada que corregir) el jefe la crea a mano con **`POST /jornadas/manual`**
  (commit `ad90e78`): deja la `Correccion` inmutable como rastro y acredita el
  saldo igual que la corrección. Las ausencias de entrada-sin-salida las marca
  el barrido de huérfanos.
- **v2 (opcional, post-piloto):** kiosco como PWA con cola offline — los
  fichajes hechos sin conexión se guardan localmente y se reenvían al volver,
  SIEMPRE marcados para revisión (el timestamp del dispositivo no es
  confiable; encaja con la cola `RevisionFichaje` existente). Solo se diseña
  si la frecuencia real de cortes lo justifica.

## 4. Endurecimientos comprometidos (DECISIONES.md → tareas concretas)

1. **Roles de Postgres separados** (hace efectivo el append-only de
   `Auditoria`): `gestorpro_migrador` (DUEÑO de las tablas y de
   `_prisma_migrations`; SOLO lo usa `prisma migrate deploy` en el paso de
   despliegue) y `gestorpro_app` (LOGIN de la aplicación: `SELECT/INSERT/
   UPDATE/DELETE` sobre las tablas de negocio, pero sobre `auditoria` SOLO
   `SELECT/INSERT` — sin `UPDATE/DELETE` y sin DDL). La app recibe el
   `DATABASE_URL` de `gestorpro_app`; el script de despliegue usa el del
   migrador. **Imprescindible** `ALTER DEFAULT PRIVILEGES FOR ROLE
   gestorpro_migrador … GRANT … TO gestorpro_app` (tablas y secuencias), o
   cada tabla creada por una migración futura nacería sin permisos y la app
   caería en runtime tras el despliegue; mantener la excepción de `auditoria`
   (solo SELECT/INSERT). El REVOKE histórico de append-only es sobre
   `current_user` = migrador (dueño): el control real sobre la app está en
   estos GRANT, por eso se verifica con un `UPDATE auditoria` que DEBE fallar
   tras CADA `migrate deploy`, no solo al montar.
2. **Autenticación y protección del kiosco** (hoy ausente — `POST /fichajes` y
   `GET /kioscos` son públicos sin auth, y el verificador facial en
   producción sería el SIMULADO, que acepta cualquier foto). Expuesto a
   internet abierta, cualquiera podría registrar fichajes válidos conociendo
   un `numero` de empleado y hacer fuerza bruta de PINs y de contraseñas de
   supervisor/admin (el body de `/fichajes` las recibe). Mínimos antes de
   exponer asistencia (gate de P2):
   - **Token de dispositivo del kiosco** — **HECHO** (migración
     `20260613120000_kiosco_token`): `POST /fichajes` exige el header
     `x-kiosco-token`. El token se genera al dar de alta el kiosco
     (`POST /kioscos`) o al rotarlo (`POST /kioscos/:id/token`, solo admin) y se
     guarda solo su hash (argon2); el dispositivo lo guarda en local. Un kiosco
     sin token no puede fichar. **Complementar en despliegue** con allowlist de
     IPs de sede en Caddy para `/fichajes` y `/kioscos` (§11) — defensa en
     profundidad (una sede comparte IP de salida).
   - **Rate limiting** — **HECHO** (commit `8836fc8`): `@fastify/rate-limit` en
     modo `global:false` sobre `/auth/*` (login 10/min, refresh·logout 30/min) y
     la superficie del kiosco (`/fichajes` 30/min, `/kioscos` 60/min). La clave
     es la IP — defensa en profundidad, NO sustituye la restricción de red/token
     (una sede comparte IP de salida).
   - **Verificador facial** — **DECIDIDO: riesgo aceptado** con el simulador. El
     verificador es enchufable por env (`VERIFICADOR_FACIAL`, hoy solo
     'simulado'; un valor no soportado aborta el arranque) y, con
     `FICHAJE_REVISION_TOTAL=true`, TODO fichaje —incluido el facial "exitoso"—
     queda marcado para revisión del jefe (cola de revisión). En producción con
     el simulador, `FICHAJE_REVISION_TOTAL` DEBE ir en true. Conectar un
     proveedor real es una mejora futura sin tocar el resto del código.
3. **Refresh-on-401 en el frontend** — **HECHO** (commit `2536b0c`):
   `cliente.ts` intercepta un 401, renueva el access token UNA vez (vía el
   manejador que inyecta `ContextoAuth`) y reintenta; si el refresh ya no
   vale, cierra sesión. Las rutas `/auth/*` usan `omitirAuth`, así que el 401
   del propio refresh no entra en bucle; refrescos concurrentes se deduplican.
4. **Zona horaria**: `TZ=America/Panama` en backend y Postgres. En Postgres el
   timezone del clúster se fija en el `initdb` del PRIMER arranque del volumen;
   cambiarlo después no surte efecto sobre datos ya escritos — fijarlo al crear
   el volumen (o `SET TIME ZONE` a nivel de base). El motor de jornada
   clasifica diurna/nocturna por la hora local del proceso Node.

## 5. Configuración por entorno

| Variable | Lado | Producción |
|---|---|---|
| `DATABASE_URL` | backend | URL del rol `gestorpro_app` (secreto) |
| `JWT_ACCESS_SECRET` | backend | secreto fuerte generado, NUNCA en el repo |
| `ACCESS_TOKEN_TTL` | backend | `15m` (default actual) |
| `REFRESH_TOKEN_TTL_DIAS` | backend | `30` (default actual) |
| `CORS_ORIGEN` | backend | `https://app.<dominio>` |
| `PORT` / `HOST` | backend | `3000` / `0.0.0.0` (tras Caddy) |
| `TZ` | backend + postgres | `America/Panama` |
| `SEED_DEMO` | backend (seed) | ausente en prod (ver §6); `true` en dev |
| `VERIFICADOR_FACIAL` | backend | `simulado` (único soportado hoy) |
| `FICHAJE_REVISION_TOTAL` | backend | `true` en prod mientras el verificador sea el simulado (§4.2) |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | backend (seed) | credencial inicial del admin (secreto; NO hardcodear ni imprimir) |
| `VITE_API_URL` | frontend (build) | `https://api.<dominio>` |

Los secretos viven en el `.env` del VPS (fuera del repo, permisos 600) o en el
secret store del proveedor. El `.env` jamás se commitea (regla existente).
`JWT_ACCESS_SECRET` es obligatorio: el backend aborta el arranque si falta (no
hay default inseguro) — generarlo fuerte.

**Almacenamiento de fotos:** las fotos de referencia de fichaje se guardan en
la BD (no en disco/objeto). El dimensionado de §2 (40 GB) y el `pg_dump` de §6
deben contemplar su crecimiento; si el volumen de fotos lo justifica, mover a
object storage es una mejora futura (no bloquea el piloto, que usa verificador
simulado).

## 6. Datos: migraciones, seed y backups

- **Migraciones:** cada despliegue ejecuta `prisma migrate deploy` (con el rol
  migrador) ANTES de levantar el backend nuevo. Política additive-only que ya
  rige: nunca editar migraciones aplicadas.
- **Seed base vs demo — HECHO** (commit `4b2cb18`): `prisma/seed.ts` siembra
  SIEMPRE lo base prod-safe (Sede inicial, admin, categorías de gasto **incluida
  'Pago a empleado' `esPagoEmpleado=true`** de la que depende `pagarCobro`, roles
  operativos, `ConfiguracionCobro`) y los datos demo solo si `demoHabilitado`
  (gate `SEED_DEMO`; si no está, dev sí / prod no por `NODE_ENV`). El admin sale
  de `ADMIN_EMAIL`/`ADMIN_PASSWORD` (en prod la contraseña es obligatoria, sin
  default débil; el seed ya no la imprime). **Pendientes que quedan:** (a)
  verificar que los defaults del schema de `ConfiguracionCobro` (porcentaje
  cobrable / umbral) son los deseados para prod, o sembrarla explícita; (b)
  provisión de kioscos — **hecho**: endpoint `POST /kioscos` solo admin (commit
  `74c2817`) y pantalla de gestión `/kioscos` (listar + alta, commit `7c37819`). `db:reset` queda PROHIBIDO en
  prod (advertencia ya en DECISIONES.md; Prisma 7 además lo bloquea para agentes).
- **Backups:** `pg_dump` diario (datos + esquema, incluye la vista
  `cuenta_por_pagar` y los índices parciales) por cron a un directorio
  versionado + copia fuera del VPS (objeto storage del proveedor), retención
  30 días. **Además `pg_dumpall --roles-only`**: `pg_dump` NO incluye los roles
  del clúster ni sus GRANT/REVOKE — sin esto, una restauración en un servidor
  nuevo perdería en silencio la separación de roles y el append-only de
  auditoría. Prueba de restauración (datos + roles) al montar el entorno y
  luego trimestral. El volumen Docker NO es un backup.

## 7. Operación

- **Despliegue:** por etiqueta de git (`git pull --tags && checkout <tag>` →
  `npm ci` → build backend y frontend → `migrate deploy` → reinicio de
  contenedores). Un script `deploy.sh` en el VPS; sin CI/CD hasta que duela.
- **Rollback:** checkout del tag anterior + rebuild. Sin down-migrations: si
  una migración rompió datos, se restaura el backup (por eso additive-only).
- **Barrido de jornadas huérfanas:** `barrerHuerfanos` NO es un job automático
  hoy — es `POST /jornadas/barrer-huerfanos` con rol admin, pensado para un
  cron en prod. Sin programarlo, las entradas sin salida nunca se marcan.
  Opción de menor riesgo (evita una credencial de servicio HTTP con access de
  15 min): un script Node en el VPS que importe `jornada.service` y llame
  `barrerHuerfanos()` directo contra la BD, lanzado por cron nocturno; o
  programarlo in-process al arrancar el backend.
- **Logs:** Fastify a stdout → `docker logs` con rotación (`max-size`).
- **Monitoreo:** ping externo a `https://api.<dominio>/health` (UptimeRobot o
  similar, gratis) + alerta al correo del dueño. Nota: `/health` hoy NO toca
  la base — un Postgres caído no lo tumba; si se quiere detectar eso, añadir un
  check que haga un `SELECT 1` (tarea menor, opcional).

## 8. Plan de implantación

| Fase | Contenido | Gate |
|---|---|---|
| P0 | VPS + dominio + Compose + TLS + roles de BD + backups + seed prod + refresh-on-401 | — |
| P1 | **Piloto de FINANZAS** en producción (cuentas por pagar, gastos, dashboard) con datos reales | ninguno externo; Firestec DECIDIDO: captura 100 % manual (sin API, no se integra) |
| P2 | **Asistencia** (kioscos, jornada, cobros) | **(a) validación legal de `jornada/legal.ts` — ✅ VALIDADO 2026-06-17 (11 parámetros confirmados sin cambios; ver docs/VALIDACION_LEGAL.md); (b) protección del kiosco §4.2 — token de dispositivo HECHO + rate-limit HECHO + verificador facial DECIDIDO (riesgo aceptado, `FICHAJE_REVISION_TOTAL`); falta solo la allowlist de IPs en Caddy (despliegue, §11); (c) alta de kioscos — hecha; (d) jornada manual §3 — hecha (`ad90e78`)** |

Esto respeta el principio del plan ("finanzas en producción y en uso real
antes de seguir") que el desarrollo ya dejó atrás pero el despliegue puede
recuperar.

**Matiz honesto:** la separación P1/P2 es PROCEDIMENTAL, no de despliegue —
el binario es uno solo, así que el código de asistencia queda desplegado y sus
endpoints vivos desde P1. Por eso la protección del kiosco (§4.2) no puede
esperar a P2 si `api.<dominio>` está en internet: o se aplica el rate-limit y
la restricción de red desde P0, o se bloquean las rutas `/fichajes`,`/kioscos`
en Caddy hasta P2.

## 9. Descartado (y por qué)

- **Servidor por sede con sincronización:** rompe las invariantes de una sola
  base (sección 1).
- **Servidor LAN único en la sede principal, sin nube:** deja a las demás
  sedes dependiendo del internet de la principal (peor que la nube), backups
  y acceso del dueño más frágiles, TLS/dominio igual de necesarios.
- **Kubernetes / contenedores gestionados / RDS:** sobredimensionado para
  decenas de usuarios; el Compose en un VPS es suficiente y entendible. Migrar
  después es posible (la app ya es 12-factor: config por entorno, stateless).

## 10. Checklist pre-producción (resumen ejecutable)

**P0 (antes de exponer nada):**
- [ ] Dominio verificado y DNS (`app.`, `api.`) → VPS.
- [ ] Compose con Caddy TLS + backend + Postgres (TZ fijada en el initdb de ambos).
- [ ] Roles `gestorpro_migrador` / `gestorpro_app` + `ALTER DEFAULT PRIVILEGES`
      + REVOKE de auditoría verificado tras `migrate deploy` (UPDATE como app debe fallar).
- [x] Seed de producción separado del demo (`SEED_DEMO`), admin desde
      `ADMIN_EMAIL`/`ADMIN_PASSWORD`, Sede inicial + 'Pago a empleado' incluidos
      — commit `4b2cb18`. (Pendiente: defaults de `ConfiguracionCobro` y alta de kioscos.)
- [x] Refresh-on-401 implementado (excluye `/auth/*`) y probado — commit `2536b0c`.
- [x] Rate limiting en `/auth/*` y superficie del kiosco — commit `8836fc8`.
      (Falta aún: restricción de red / bloqueo en Caddy de las rutas de kiosco hasta P2.)
- [ ] Backups diarios (`pg_dump` + `pg_dumpall --roles-only`) + restauración
      (datos + roles) probada.
- [ ] Monitoreo de `/health` con alerta.

**P1 — finanzas en uso real** (sin gate externo).

**P2 — asistencia, solo tras:**
- [x] Validación legal panameña de `jornada/legal.ts` — ✅ 2026-06-17, 11
      parámetros confirmados sin cambios (ver docs/VALIDACION_LEGAL.md).
- [x] Token de dispositivo del kiosco + rate-limit (§4.2).
- [x] Decisión sobre el verificador facial: riesgo aceptado con el simulador,
      `FICHAJE_REVISION_TOTAL=true` en prod (§4.2).
- [ ] Allowlist de IPs de sede en Caddy para `/fichajes` y `/kioscos` (§11).
- [x] Provisión de kioscos: API (`POST /kioscos`, commit `74c2817`) + pantalla de gestión (commit `7c37819`).
- [x] Alta manual de jornada para cortes de día completo (`POST /jornadas/manual`, commit `ad90e78`).

## 11. Apéndice: allowlist de IPs del kiosco en Caddy

El token de dispositivo (§4.2) autentica al kiosco; la allowlist de IPs lo
complementa restringiendo desde DÓNDE se aceptan `/fichajes` y `/kioscos`
(defensa en profundidad). Ejemplo para `api.<dominio>`, permitiendo solo las IPs
públicas de salida de las sedes:

```caddyfile
api.midominio.com {
	# IPs públicas de salida de cada sede (ajustar).
	@kiosco_publico {
		path /fichajes /kioscos
		not remote_ip 203.0.113.10 203.0.113.20
	}
	respond @kiosco_publico 403

	reverse_proxy backend:3000
}
```

Notas:
- Si una sede no tiene IP fija, usar solo el token de dispositivo (y, si hace
  falta, una VPN/tunnel por sede). La allowlist es un refuerzo, no un requisito
  para que el token funcione.
- `remote_ip` debe ver la IP real del cliente: detrás de otro proxy/CDN, activar
  `trusted_proxies` para que Caddy lea `X-Forwarded-For`.
- El resto de rutas (API autenticada) no se filtran por IP; las protege el JWT.
