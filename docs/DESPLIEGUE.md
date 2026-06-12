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

- **v1 (sale con el piloto, cero código):** procedimiento administrativo — el
  supervisor anota entrada/salida en papel y, al volver la conexión, se
  corrige la jornada con el mecanismo existente (`Correccion`, inmutable, vía
  `/asistencia/jornadas`). Las ausencias de fichaje ya las recoge el job
  `barrerHuerfanos`.
- **v2 (opcional, post-piloto):** kiosco como PWA con cola offline — los
  fichajes hechos sin conexión se guardan localmente y se reenvían al volver,
  SIEMPRE marcados para revisión (el timestamp del dispositivo no es
  confiable; encaja con la cola `RevisionFichaje` existente). Solo se diseña
  si la frecuencia real de cortes lo justifica.

## 4. Endurecimientos comprometidos (DECISIONES.md → tareas concretas)

1. **Roles de Postgres separados** (hace efectivo el append-only de
   `Auditoria`): `gestorpro_migrador` (dueño de las tablas; SOLO lo usa
   `prisma migrate deploy` en el paso de despliegue) y `gestorpro_app` (LOGIN
   de la aplicación: `SELECT/INSERT/UPDATE/DELETE` sobre las tablas de
   negocio, pero sobre `auditoria` SOLO `SELECT/INSERT` — sin `UPDATE/DELETE`
   y sin DDL). La app recibe el `DATABASE_URL` de `gestorpro_app`; el script
   de despliegue usa el del migrador. Tarea: SQL de roles + ajuste del paso de
   despliegue.
2. **Refresh-on-401 en el frontend**: `cliente.ts` intercepta un 401, llama a
   `POST /auth/refresh` (ya existe) con el refresh token, reintenta UNA vez y,
   si vuelve a fallar, cierra sesión. Hoy el access token (15 min) expira sin
   reintento. Tarea de código pequeña, previa al piloto.
3. **Zona horaria**: `TZ=America/Panama` en los contenedores de backend y
   Postgres (el motor de jornada clasifica por hora local del servidor).

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
| `VITE_API_URL` | frontend (build) | `https://api.<dominio>` |

Los secretos viven en el `.env` del VPS (fuera del repo, permisos 600) o en el
secret store del proveedor. El `.env` jamás se commitea (regla existente).

## 6. Datos: migraciones, seed y backups

- **Migraciones:** cada despliegue ejecuta `prisma migrate deploy` (con el rol
  migrador) ANTES de levantar el backend nuevo. Política additive-only que ya
  rige: nunca editar migraciones aplicadas.
- **Seed de producción — TAREA PREVIA:** hoy `prisma/seed.ts` siembra SIEMPRE
  datos demo (`sembrarDemoAsistencia`/`sembrarDemoFinanzas`, sin gate). Para
  prod hay que separar: seed base (admin inicial + categorías de gasto +
  roles operativos) vs demo (solo dev), p. ej. con `SEED_DEMO=true` por
  defecto en dev y ausente en prod. `db:reset` queda PROHIBIDO en prod
  (advertencia ya en DECISIONES.md; Prisma 7 además lo bloquea para agentes).
- **Backups:** `pg_dump` diario por cron a un directorio versionado + copia
  fuera del VPS (objeto storage del proveedor), retención 30 días; prueba de
  restauración al montar el entorno y luego trimestral. El volumen Docker NO
  es un backup.

## 7. Operación

- **Despliegue:** por etiqueta de git (`git pull --tags && checkout <tag>` →
  `npm ci` → build backend y frontend → `migrate deploy` → reinicio de
  contenedores). Un script `deploy.sh` en el VPS; sin CI/CD hasta que duela.
- **Rollback:** checkout del tag anterior + rebuild. Sin down-migrations: si
  una migración rompió datos, se restaura el backup (por eso additive-only).
- **Logs:** Fastify a stdout → `docker logs` con rotación (`max-size`).
- **Monitoreo:** ping externo a `https://api.<dominio>/health` (UptimeRobot o
  similar, gratis) + alerta al correo del dueño.

## 8. Plan de implantación

| Fase | Contenido | Gate |
|---|---|---|
| P0 | VPS + dominio + Compose + TLS + roles de BD + backups + seed prod + refresh-on-401 | — |
| P1 | **Piloto de FINANZAS** en producción (cuentas por pagar, gastos, dashboard) con datos reales | ninguno externo; Firestec solo afecta la comodidad de captura |
| P2 | **Asistencia** (kioscos, jornada, cobros) | **validación legal panameña de `jornada/legal.ts` — bloqueante** |

Esto respeta el principio del plan ("finanzas en producción y en uso real
antes de seguir") que el desarrollo ya dejó atrás pero el despliegue puede
recuperar.

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

- [ ] Dominio verificado y DNS (`app.`, `api.`) → VPS.
- [ ] Compose con Caddy TLS + backend + Postgres (TZ fijada en ambos).
- [ ] Roles `gestorpro_migrador` / `gestorpro_app` + REVOKE de auditoría verificado
      (intentar UPDATE como app debe fallar).
- [ ] Seed de producción separado del demo (gate `SEED_DEMO`).
- [ ] Refresh-on-401 implementado y probado.
- [ ] Backups diarios + restauración probada.
- [ ] Monitoreo de `/health` con alerta.
- [ ] P1 finanzas en uso real. P2 solo tras la validación legal.
