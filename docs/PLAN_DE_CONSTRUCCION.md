# GestorPro — Plan de construcción

## Qué es

Una sola aplicación de administración para una empresa de retail en Panamá
(varias sedes). NO es un POS y NO maneja inventario — eso lo cubre Firestec,
un sistema externo. La app cubre dos áreas funcionales de un mismo producto:

- **Finanzas** — cuentas por pagar a proveedores, gastos, dashboard de
  ganancias. Es el dolor inmediato del cliente.
- **Asistencia** — fichaje en kiosco, motor de jornada laboral, cobro
  anticipado de horas extra.

Un backend, una base de datos, una autenticación, un despliegue. Las dos
áreas comparten el núcleo (`Sede`, `Usuario`, `Auditoria`, auth) y están
conectadas: un cobro de horas extra pagado genera un gasto.

## Stack

Node.js + TypeScript + Fastify · Prisma ORM + PostgreSQL · Frontend React +
Vite · Auth JWT con refresh · Vitest + Testcontainers · Despliegue híbrido
(local en sedes + nube).

## Documentos de apoyo

- `BRIEF_BLOQUE_1.md` — detalle técnico del área de finanzas.
- `BRIEF_BLOQUE_2.md` — detalle técnico del área de asistencia.
- Archivos de código ya entregados del área de finanzas (schema, servicios,
  repositorios, rutas, tests, seed, SQL).

Este plan ordena el trabajo; los briefs tienen el detalle de cada pieza.

---

## Principio de secuencia

1. **Primero lo que duele hoy.** Finanzas antes que asistencia: el cliente
   hoy no sabe qué facturas debe. La asistencia no sangra igual de rápido.
2. **En serie hasta producción.** El área de finanzas se construye, se
   despliega y se pone en uso real ANTES de empezar la de asistencia. No se
   divide la atención.
3. **Por módulo vertical.** Cada módulo se entrega de punta a punta (backend
   + frontend) antes de pasar al siguiente. El cliente toca algo funcional
   pronto y da feedback temprano.
4. **El proyecto nace en su máquina final.** El entorno definitivo (Mac) se
   monta antes de escribir la primera línea, para no reconfigurar a medio
   camino.

---

## FASE 0 — Fundaciones

Infraestructura compartida por toda la app. Nada funcional para el usuario
todavía; es la base sobre la que se apoya todo.

1. **Entorno definitivo en Mac.** Instalar Homebrew, Node, Git, Claude Code,
   Docker y los MCPs. Configurar Remote SSH + Tailscale para el laptop
   Windows como cliente remoto. El proyecto se crea aquí, no en Windows.
2. **Credenciales portables** (hacer desde Windows esta semana, son
   independientes de la máquina): generar GitHub PAT y Brave Search API key.
3. **Scaffold del proyecto.** Estructura de carpetas, TypeScript, Fastify,
   Prisma, configuración de Vitest + Testcontainers, repositorio Git.
4. **Núcleo de datos.** Entidades compartidas: `Sede`, `Usuario`,
   `Auditoria`. El `schema.prisma` arranca aquí.
5. **Autenticación.** JWT con refresh, roles (Empleado, Jefe/Supervisor,
   Administrador), middleware. Todas las rutas posteriores leen el usuario
   del token, nunca del body.

Salida de fase: proyecto que arranca, base de datos migrable, login
funcionando. Sin funcionalidad de negocio aún.

---

## FASE 1 — Cuentas por pagar  (área de finanzas)

El módulo más doloroso. Se entrega completo, backend + frontend.

- Modelo: `Proveedor`, `Compra`, `PagoProveedor`, vista `cuenta_por_pagar`.
- Servicio genérico de corrección + repositorio de auditoría (sirven también
  a los módulos siguientes — se construyen aquí porque aquí se necesitan
  primero).
- Rutas: alta de proveedor, registro de compras, registro de pagos
  parciales, listado de cuentas por pagar.
- Frontend: pantalla de cuentas por pagar (lista, estados, registro de
  factura, abono).
- Migración manual: índice único parcial, vista, revoke de auditoría.

Salida de fase: el cliente puede dejar el cuaderno de proveedores. Módulo
desplegable y usable por sí solo.

---

## FASE 2 — Gastos  (área de finanzas)

- Modelo: `Gasto`, `CategoriaGasto`.
- Rutas: registrar gasto (con la regla de coherencia de empleado), listar
  por período.
- Frontend: módulo de gastos con la categoría "pago a empleado".
- El gancho `referenciaOrigen` queda preparado para la conexión futura con
  el cobro de horas extra.

Salida de fase: control de gastos no-mercancía operativo.

---

## FASE 3 — Dashboard de ganancias  (área de finanzas)

- Modelo: `VentaDiaria` (con su unicidad parcial y mecanismo de corrección).
- Servicio de dashboard: ventas − compras − gastos, período flexible.
- Pantalla para teclear la venta diaria (dato de Firestec) y el dashboard.
- **Pendiente que se resuelve aquí:** verificar si Firestec imprime/muestra
  el total de ventas diario. Si sí, la captura es semi-asistida; si no, es
  100% manual. No bloquea la fase, pero define el diseño de la pantalla.

Salida de fase: **área de finanzas COMPLETA.** Se despliega, se pone en uso
real, se recoge feedback. Solo después arranca la Fase 4.

---

## FASE 4 — Fichaje y kioscos  (área de asistencia)

- Modelo: `Empleado` (foto facial, número, qrToken, pinHash), `Kiosco`;
  `Sede` gana `modoExcepcion`.
- Identificación por número o QR + verificación facial 1:1 con liveness.
- Fichaje de excepción: PIN o supervisor según `modoExcepcion` de la sede;
  todo fichaje de excepción marcado para revisión.
- Frontend del kiosco + cola de revisión para el jefe.

Salida de fase: los empleados fichan; los fichajes crudos se registran.

---

## FASE 5 — Motor de jornada  (área de asistencia)

El corazón técnico de la asistencia. La parte más delicada del proyecto.

- Modelo: `Turno`, `Jornada`, `Correccion`, `DiaFestivo`.
- Capa legal fija (jornadas, recargos, topes) + capa configurable (turnos,
  horarios, tolerancia, pausas).
- Cálculo al cerrar el fichaje de salida + job nocturno para casos rotos.
- Pausa de comida medida (cuatro fichajes), con `pausaPorDefecto` de
  respaldo. Turnos que cruzan medianoche. Festivos con sus dos efectos.
- Corrección de jornadas vía `Correccion`.
- **Antes de producción:** validación de las reglas laborales (divisor
  horario, recargos, festivos) por un asesor laboral panameño.

Salida de fase: las horas trabajadas y las extras se calculan correctamente.

---

## FASE 6 — Cobro anticipado de horas extra  (área de asistencia)

Cierra la app y conecta las dos áreas.

- Modelo: `SaldoHorasExtra`, `SolicitudCobro`, `ConfiguracionCobro`.
- Saldo persistido, en dinero, escrito solo por su servicio transaccional.
- Modelo B: umbral configurable para cobro directo vs. con aprobación.
- % cobrable único sobre el dinero, configurable por el admin.
- **Conexión entre las dos áreas:** al marcar un cobro como "pagado", se
  crea automáticamente un `Gasto` con `referenciaOrigen`. Dirección
  asistencia → finanzas.

Salida de fase: **app COMPLETA.** Las dos áreas funcionando e integradas.

---

## Resumen del orden

| Fase | Entrega | Área |
|------|---------|------|
| 0 | Entorno, scaffold, núcleo, auth | Compartido |
| 1 | Cuentas por pagar | Finanzas |
| 2 | Gastos | Finanzas |
| 3 | Dashboard de ganancias | Finanzas |
| — | *Finanzas en producción y en uso* | — |
| 4 | Fichaje y kioscos | Asistencia |
| 5 | Motor de jornada | Asistencia |
| 6 | Cobro anticipado de horas extra | Asistencia |

## Pendientes abiertos a resolver en su fase

- **Firestec** (Fase 3): ✅ RESUELTO (2026-06-17) — captura de ventas **100 %
  manual**; Firestec no tiene API y no se integra. Ver `DECISIONES.md`.
- **Validación legal** (antes de producción de Fase 5): ✅ VALIDADO (2026-06-17)
  — asesor laboral panameño confirmó los 11 parámetros sin cambios. Ver
  `docs/VALIDACION_LEGAL.md`.
