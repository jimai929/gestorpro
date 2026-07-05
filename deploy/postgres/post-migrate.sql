-- Se ejecuta como gestorpro_migrador (dueño de las tablas) tras CADA
-- `prisma migrate deploy`. Reasegura los grants de datos al app sobre los
-- objetos existentes (idempotente) y reimpone el append-only de `auditoria`.
--
-- El append-only se verifica además en deploy.sh: un UPDATE de auditoria como
-- gestorpro_app DEBE fallar tras este paso.

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO gestorpro_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO gestorpro_app;

-- Auditoría: el app puede LEER e INSERTAR, nunca modificar ni borrar.
-- MANTENIMIENTO: el GRANT de arriba concede UPDATE/DELETE sobre TODAS las tablas;
-- el append-only se logra REVOCÁNDOLO explícitamente sobre cada tabla inmutable.
-- Si en el futuro se añade OTRA tabla append-only (otra bitácora inmutable) o se
-- renombra 'auditoria', hay que (1) añadirla a estos REVOKE y (2) añadir su
-- verificación al paso de append-only de deploy.sh.
REVOKE UPDATE, DELETE, TRUNCATE ON auditoria FROM gestorpro_app;
REVOKE UPDATE, DELETE, TRUNCATE ON auditoria FROM PUBLIC;

-- Auditoría de PLATAFORMA (super-admin): misma inmutabilidad append-only que
-- `auditoria`. Es una tabla a nivel plataforma (sin empresa_id de partición), por lo
-- que NO lleva RLS (está en la allowlist de abajo). PENDIENTE de proceso: añadir su
-- verificación al paso de append-only de deploy.sh (un UPDATE como gestorpro_app DEBE
-- fallar), igual que ya se hace con `auditoria`.
REVOKE UPDATE, DELETE, TRUNCATE ON auditoria_plataforma FROM gestorpro_app;
REVOKE UPDATE, DELETE, TRUNCATE ON auditoria_plataforma FROM PUBLIC;

-- ════════════════════════════════════════════════════════════════════════════
-- Aislamiento multi-tenant (RLS) — Fase 5 (ver docs/PLAN_FASE5_RLS.md, docs/
-- ARQUITECTURA_MULTITENANT.md §2). FRONTERA DURA fail-closed.
--
-- Contrato: la app (gestorpro_app, NOBYPASSRLS, no-owner) queda sujeta a estas
-- policies; el migrador (owner, BYPASSRLS) las ignora (migra/seed/backfill). El
-- GUC de tenant es `app.empresa_id`; lo fija `txEmpresa` con set_config(...,true)
-- LOCAL por transacción (Segmento 2). Las policies usan
--   NULLIF(current_setting('app.empresa_id', true), '')::uuid
-- y NO el cast directo: un GUC de placeholder (parámetro con punto) que ya se
-- fijó alguna vez en la sesión (aunque fuera LOCAL + ROLLBACK) revierte a CADENA
-- VACÍA '', no a NULL; `''::uuid` LANZARÍA error en vez de dar 0 filas. NULLIF
-- normaliza '' y "sin fijar" a NULL → `= NULL` nunca es TRUE (lógica de 3 valores)
-- → 0 filas / WITH CHECK rechaza: FAIL-CLOSED y SIN excepción en una conexión del
-- pool reutilizada. Para "sin tenant" se deja el GUC sin fijar (o '').
--
-- IDEMPOTENTE: ENABLE/FORCE no fallan si ya están; las policies se recrean con
-- DROP POLICY IF EXISTS + CREATE (PG no tiene CREATE POLICY IF NOT EXISTS).
--
-- EXCLUIDAS de RLS (allowlist): usuario, sesion_refresco, empresa, membresia. El
-- login (auth.service.resolverContextoActivo) las consulta SIN contexto de tenant
-- (aún no hay sesión); con RLS darían 0 filas y romperían el login. Su aislamiento
-- es por otra vía (email @unique global, refresh token opaco, filtro por usuarioId).
-- TAMBIÉN excluida: auditoria_plataforma — bitácora a nivel PLATAFORMA (super-admin),
-- sin empresa_id de partición; su aislamiento es el guard soloPlataforma de la ruta,
-- no la RLS. NO tiene ENABLE/FORCE abajo (a diferencia de `auditoria`, que sí es de
-- tenant). Su allowlist está pineada en test/multitenant/rls-cobertura.test.ts.
--
-- MANTENIMIENTO (igual que el REVOKE de auditoria): al añadir una tabla
-- tenant-scoped nueva, AÑADIR aquí su ENABLE/FORCE + policy, y el test de
-- cobertura (test/multitenant/rls-cobertura.test.ts) y el check de deploy.sh la
-- exigirán. Olvidarla = tabla fail-OPEN.
--
-- `bypass_plataforma`: 2ª policy permisiva (OR), INERTE hasta Fase 4c. Solo abre
-- si un endpoint soloPlataforma fija app.bypass_tenant='on' (super-admin auditado).
-- Sin ella, el super-admin con empresaId=null ve 0 filas (fail-closed), que es lo
-- que exige el test super-admin-null.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tablas DIRECTAS (columna empresa_id propia) ─────────────────────────────
-- Patrón idéntico: igualdad de empresa_id al GUC.
ALTER TABLE sede                ENABLE ROW LEVEL SECURITY;  ALTER TABLE sede                FORCE ROW LEVEL SECURITY;
ALTER TABLE proveedor           ENABLE ROW LEVEL SECURITY;  ALTER TABLE proveedor           FORCE ROW LEVEL SECURITY;
ALTER TABLE categoria_gasto     ENABLE ROW LEVEL SECURITY;  ALTER TABLE categoria_gasto     FORCE ROW LEVEL SECURITY;
ALTER TABLE rol_operativo       ENABLE ROW LEVEL SECURITY;  ALTER TABLE rol_operativo       FORCE ROW LEVEL SECURITY;
ALTER TABLE turno               ENABLE ROW LEVEL SECURITY;  ALTER TABLE turno               FORCE ROW LEVEL SECURITY;
ALTER TABLE dia_festivo         ENABLE ROW LEVEL SECURITY;  ALTER TABLE dia_festivo         FORCE ROW LEVEL SECURITY;
ALTER TABLE configuracion_cobro ENABLE ROW LEVEL SECURITY;  ALTER TABLE configuracion_cobro FORCE ROW LEVEL SECURITY;
ALTER TABLE auditoria           ENABLE ROW LEVEL SECURITY;  ALTER TABLE auditoria           FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_empresa ON sede;
CREATE POLICY aislamiento_empresa ON sede
  USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
DROP POLICY IF EXISTS aislamiento_empresa ON proveedor;
CREATE POLICY aislamiento_empresa ON proveedor
  USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
DROP POLICY IF EXISTS aislamiento_empresa ON categoria_gasto;
CREATE POLICY aislamiento_empresa ON categoria_gasto
  USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
DROP POLICY IF EXISTS aislamiento_empresa ON rol_operativo;
CREATE POLICY aislamiento_empresa ON rol_operativo
  USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
DROP POLICY IF EXISTS aislamiento_empresa ON turno;
CREATE POLICY aislamiento_empresa ON turno
  USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
DROP POLICY IF EXISTS aislamiento_empresa ON dia_festivo;
CREATE POLICY aislamiento_empresa ON dia_festivo
  USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
DROP POLICY IF EXISTS aislamiento_empresa ON configuracion_cobro;
CREATE POLICY aislamiento_empresa ON configuracion_cobro
  USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
DROP POLICY IF EXISTS aislamiento_empresa ON auditoria;
CREATE POLICY aislamiento_empresa ON auditoria
  USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);

-- ── Tablas HEREDA (sin empresa_id propio): subquery por la cadena de FK ──────
ALTER TABLE compra                 ENABLE ROW LEVEL SECURITY;  ALTER TABLE compra                 FORCE ROW LEVEL SECURITY;
ALTER TABLE pago_proveedor         ENABLE ROW LEVEL SECURITY;  ALTER TABLE pago_proveedor         FORCE ROW LEVEL SECURITY;
ALTER TABLE gasto                  ENABLE ROW LEVEL SECURITY;  ALTER TABLE gasto                  FORCE ROW LEVEL SECURITY;
ALTER TABLE venta_diaria           ENABLE ROW LEVEL SECURITY;  ALTER TABLE venta_diaria           FORCE ROW LEVEL SECURITY;
ALTER TABLE detalle_cierre         ENABLE ROW LEVEL SECURITY;  ALTER TABLE detalle_cierre         FORCE ROW LEVEL SECURITY;
ALTER TABLE empleado               ENABLE ROW LEVEL SECURITY;  ALTER TABLE empleado               FORCE ROW LEVEL SECURITY;
ALTER TABLE empleado_rol_operativo ENABLE ROW LEVEL SECURITY;  ALTER TABLE empleado_rol_operativo FORCE ROW LEVEL SECURITY;
ALTER TABLE kiosco                 ENABLE ROW LEVEL SECURITY;  ALTER TABLE kiosco                 FORCE ROW LEVEL SECURITY;
ALTER TABLE fichaje                ENABLE ROW LEVEL SECURITY;  ALTER TABLE fichaje                FORCE ROW LEVEL SECURITY;
ALTER TABLE revision_fichaje       ENABLE ROW LEVEL SECURITY;  ALTER TABLE revision_fichaje       FORCE ROW LEVEL SECURITY;
ALTER TABLE jornada                ENABLE ROW LEVEL SECURITY;  ALTER TABLE jornada                FORCE ROW LEVEL SECURITY;
ALTER TABLE correccion             ENABLE ROW LEVEL SECURITY;  ALTER TABLE correccion             FORCE ROW LEVEL SECURITY;
ALTER TABLE saldo_horas_extra      ENABLE ROW LEVEL SECURITY;  ALTER TABLE saldo_horas_extra      FORCE ROW LEVEL SECURITY;
ALTER TABLE solicitud_cobro        ENABLE ROW LEVEL SECURITY;  ALTER TABLE solicitud_cobro        FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS aislamiento_empresa ON compra;
CREATE POLICY aislamiento_empresa ON compra
  USING      (EXISTS (SELECT 1 FROM sede s WHERE s.id = compra.sede_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM sede s WHERE s.id = compra.sede_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid));
DROP POLICY IF EXISTS aislamiento_empresa ON pago_proveedor;
CREATE POLICY aislamiento_empresa ON pago_proveedor
  USING      (EXISTS (SELECT 1 FROM compra c JOIN sede s ON s.id = c.sede_id WHERE c.id = pago_proveedor.compra_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM compra c JOIN sede s ON s.id = c.sede_id WHERE c.id = pago_proveedor.compra_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid));
DROP POLICY IF EXISTS aislamiento_empresa ON gasto;
CREATE POLICY aislamiento_empresa ON gasto
  USING      (EXISTS (SELECT 1 FROM sede s WHERE s.id = gasto.sede_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM sede s WHERE s.id = gasto.sede_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid));
DROP POLICY IF EXISTS aislamiento_empresa ON venta_diaria;
CREATE POLICY aislamiento_empresa ON venta_diaria
  USING      (EXISTS (SELECT 1 FROM sede s WHERE s.id = venta_diaria.sede_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM sede s WHERE s.id = venta_diaria.sede_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid));
DROP POLICY IF EXISTS aislamiento_empresa ON detalle_cierre;
CREATE POLICY aislamiento_empresa ON detalle_cierre
  USING      (EXISTS (SELECT 1 FROM venta_diaria v JOIN sede s ON s.id = v.sede_id WHERE v.id = detalle_cierre.venta_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM venta_diaria v JOIN sede s ON s.id = v.sede_id WHERE v.id = detalle_cierre.venta_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid));
-- empleado: tabla DIRECTA desde Fase 3 Ola 3c (tiene empresa_id propio + FK compuesta
-- (sede_id, empresa_id) que garantiza empresa_id = sede.empresa_id). Politica DIRECTA
-- (antes era subquery EXISTS via sede). Las tablas que derivan de empleado por sede
-- (fichaje/jornada/saldo/solicitud/empleado_rol_operativo/...) NO cambian: siguen
-- usando empleado.sede_id, que se conserva.
DROP POLICY IF EXISTS aislamiento_empresa ON empleado;
CREATE POLICY aislamiento_empresa ON empleado
  USING      (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid)
  WITH CHECK (empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid);
DROP POLICY IF EXISTS aislamiento_empresa ON empleado_rol_operativo;
CREATE POLICY aislamiento_empresa ON empleado_rol_operativo
  USING      (EXISTS (SELECT 1 FROM empleado e JOIN sede s ON s.id = e.sede_id WHERE e.id = empleado_rol_operativo.empleado_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM empleado e JOIN sede s ON s.id = e.sede_id WHERE e.id = empleado_rol_operativo.empleado_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid));
DROP POLICY IF EXISTS aislamiento_empresa ON kiosco;
CREATE POLICY aislamiento_empresa ON kiosco
  USING      (EXISTS (SELECT 1 FROM sede s WHERE s.id = kiosco.sede_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM sede s WHERE s.id = kiosco.sede_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid));
DROP POLICY IF EXISTS aislamiento_empresa ON fichaje;
CREATE POLICY aislamiento_empresa ON fichaje
  USING      (EXISTS (SELECT 1 FROM empleado e JOIN sede s ON s.id = e.sede_id WHERE e.id = fichaje.empleado_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM empleado e JOIN sede s ON s.id = e.sede_id WHERE e.id = fichaje.empleado_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid));
DROP POLICY IF EXISTS aislamiento_empresa ON revision_fichaje;
CREATE POLICY aislamiento_empresa ON revision_fichaje
  USING      (EXISTS (SELECT 1 FROM fichaje f JOIN empleado e ON e.id = f.empleado_id JOIN sede s ON s.id = e.sede_id WHERE f.id = revision_fichaje.fichaje_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM fichaje f JOIN empleado e ON e.id = f.empleado_id JOIN sede s ON s.id = e.sede_id WHERE f.id = revision_fichaje.fichaje_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid));
DROP POLICY IF EXISTS aislamiento_empresa ON jornada;
CREATE POLICY aislamiento_empresa ON jornada
  USING      (EXISTS (SELECT 1 FROM empleado e JOIN sede s ON s.id = e.sede_id WHERE e.id = jornada.empleado_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM empleado e JOIN sede s ON s.id = e.sede_id WHERE e.id = jornada.empleado_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid));
DROP POLICY IF EXISTS aislamiento_empresa ON correccion;
CREATE POLICY aislamiento_empresa ON correccion
  USING      (EXISTS (SELECT 1 FROM jornada j JOIN empleado e ON e.id = j.empleado_id JOIN sede s ON s.id = e.sede_id WHERE j.id = correccion.jornada_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM jornada j JOIN empleado e ON e.id = j.empleado_id JOIN sede s ON s.id = e.sede_id WHERE j.id = correccion.jornada_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid));
DROP POLICY IF EXISTS aislamiento_empresa ON saldo_horas_extra;
CREATE POLICY aislamiento_empresa ON saldo_horas_extra
  USING      (EXISTS (SELECT 1 FROM empleado e JOIN sede s ON s.id = e.sede_id WHERE e.id = saldo_horas_extra.empleado_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM empleado e JOIN sede s ON s.id = e.sede_id WHERE e.id = saldo_horas_extra.empleado_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid));
DROP POLICY IF EXISTS aislamiento_empresa ON solicitud_cobro;
CREATE POLICY aislamiento_empresa ON solicitud_cobro
  USING      (EXISTS (SELECT 1 FROM empleado e JOIN sede s ON s.id = e.sede_id WHERE e.id = solicitud_cobro.empleado_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid))
  WITH CHECK (EXISTS (SELECT 1 FROM empleado e JOIN sede s ON s.id = e.sede_id WHERE e.id = solicitud_cobro.empleado_id AND s.empresa_id = NULLIF(current_setting('app.empresa_id', true), '')::uuid));

-- ── Bypass de plataforma (INERTE hasta Fase 4c) ─────────────────────────────
-- 2ª policy permisiva (se combina con OR). Solo abre si app.bypass_tenant='on'.
DROP POLICY IF EXISTS bypass_plataforma ON sede;
CREATE POLICY bypass_plataforma ON sede USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON proveedor;
CREATE POLICY bypass_plataforma ON proveedor USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON categoria_gasto;
CREATE POLICY bypass_plataforma ON categoria_gasto USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON rol_operativo;
CREATE POLICY bypass_plataforma ON rol_operativo USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON turno;
CREATE POLICY bypass_plataforma ON turno USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON dia_festivo;
CREATE POLICY bypass_plataforma ON dia_festivo USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON configuracion_cobro;
CREATE POLICY bypass_plataforma ON configuracion_cobro USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON auditoria;
CREATE POLICY bypass_plataforma ON auditoria USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON compra;
CREATE POLICY bypass_plataforma ON compra USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON pago_proveedor;
CREATE POLICY bypass_plataforma ON pago_proveedor USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON gasto;
CREATE POLICY bypass_plataforma ON gasto USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON venta_diaria;
CREATE POLICY bypass_plataforma ON venta_diaria USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON detalle_cierre;
CREATE POLICY bypass_plataforma ON detalle_cierre USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON empleado;
CREATE POLICY bypass_plataforma ON empleado USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON empleado_rol_operativo;
CREATE POLICY bypass_plataforma ON empleado_rol_operativo USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON kiosco;
CREATE POLICY bypass_plataforma ON kiosco USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON fichaje;
CREATE POLICY bypass_plataforma ON fichaje USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON revision_fichaje;
CREATE POLICY bypass_plataforma ON revision_fichaje USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON jornada;
CREATE POLICY bypass_plataforma ON jornada USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON correccion;
CREATE POLICY bypass_plataforma ON correccion USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON saldo_horas_extra;
CREATE POLICY bypass_plataforma ON saldo_horas_extra USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');
DROP POLICY IF EXISTS bypass_plataforma ON solicitud_cobro;
CREATE POLICY bypass_plataforma ON solicitud_cobro USING (current_setting('app.bypass_tenant', true) = 'on') WITH CHECK (current_setting('app.bypass_tenant', true) = 'on');

-- ── Vista cuenta_por_pagar: ejecutar con permisos del INVOCADOR ─────────────
-- Sin esto la vista corre como su owner (migrador, BYPASSRLS) y FUGARÍA datos
-- cross-tenant a gestorpro_app. security_invoker (PG15+) hace que las RLS de las
-- tablas base (compra, pago_proveedor) apliquen al consultar la vista.
ALTER VIEW cuenta_por_pagar SET (security_invoker = true);
