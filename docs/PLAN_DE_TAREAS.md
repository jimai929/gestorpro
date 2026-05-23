# GestorPro — Plan de tareas para Claude Code

Las 7 fases divididas en tareas concretas. Cada tarea es un encargo del
tamaño de una sesión de Claude Code: acotada, con un resultado verificable,
y en orden de dependencia.

## Cómo usar este documento

- Ejecutar las tareas EN ORDEN. Ninguna tarea asume algo que una anterior
  no haya construido.
- A Claude Code se le pasa una tarea a la vez. Cuando termina, revisar el
  resultado contra el "Verificable" antes de pasar a la siguiente.
- Cada tarea remite a su brief de detalle en `docs/`. Claude Code debe leer
  el brief correspondiente y `docs/DECISIONES.md` antes de escribir código.
- El "Verificable" es la condición de hecho: si no se cumple, la tarea no
  está terminada.

---

# FASE 0 — Fundaciones

Detalle en `docs/BRIEF_FASE_0.md`.

## Tarea 0.1 — Scaffold del backend
Inicializar el proyecto backend: npm, TypeScript estricto, Fastify, Prisma,
Vitest + Testcontainers. Scripts en package.json (`dev`, `build`, `test`,
`prisma:migrate`, `prisma:seed`). Colocar `.gitignore` y `.env.example`.
**Verificable:** `npm run dev` levanta un servidor Fastify que responde en
un endpoint de salud (`GET /health`).

## Tarea 0.2 — Núcleo de datos
Crear el `schema.prisma` con las tres entidades transversales: `Sede`
(incluye el campo `modoExcepcion`), `Usuario`, `Auditoria`. Enum `Rol`.
Primera migración.
**Verificable:** `prisma migrate dev` corre sin error y las tres tablas
existen en la base.

## Tarea 0.3 — Autenticación JWT
Construir el módulo de auth en `src/core/auth/`: login, refresh, logout.
Contraseñas hasheadas (bcrypt o argon2). Middleware que verifica el access
token y puebla `request.user`. Guard de autorización por rol.
**Verificable:** un usuario sembrado puede hacer login y recibir tokens; el
middleware rechaza un token inválido y acepta uno válido.

## Tarea 0.4 — Scaffold del frontend
Inicializar el frontend con Vite (React + TypeScript). Cliente HTTP en
`src/core/api/`. Pantalla de login conectada al backend. Contexto de sesión
y guard de rutas.
**Verificable:** la pantalla de login autentica contra el backend y guarda
la sesión; una ruta protegida redirige si no hay sesión.

---

# FASE 1 — Cuentas por pagar

Detalle en `docs/BRIEF_BLOQUE_1.md`.

## Tarea 1.1 — Modelo de cuentas por pagar
Agregar al schema: `Proveedor`, `Compra`, `PagoProveedor`. Migración.
Integrar el SQL de `migracion_complementaria.sql` (vista
`cuenta_por_pagar`, índice único parcial, revoke) dentro de la migración.
**Verificable:** las tablas y la vista existen; la vista devuelve filas
correctas con datos de prueba manuales.

## Tarea 1.2 — Servicio de corrección y auditoría
Colocar en `src/shared/`: el servicio genérico de corrección y el
repositorio de auditoría append-only. Ajustar el servicio para que use
`auditoriaRepo.registrar(asiento, tx)` dentro de la transacción.
**Verificable:** los tests de `correccion.test.ts` pasan (requiere Docker
para Testcontainers).

## Tarea 1.3 — Rutas de cuentas por pagar
Colocar las rutas de proveedores, compras y pagos. El `usuarioId` sale de
`request.user`, no del body. Registrar el plugin con prefijo.
**Verificable:** se puede crear un proveedor, registrar una compra a
crédito y registrar un pago; un pago que excede el saldo es rechazado con
400; un duplicado de factura devuelve 409.

## Tarea 1.4 — Frontend de cuentas por pagar
Pantalla de cuentas por pagar: lista con estados (debido, vencida, parcial,
pagado), formulario de registro de factura, registro de abono.
**Verificable:** desde la UI se registra una factura y un abono, y la lista
refleja el saldo actualizado.

---

# FASE 2 — Gastos

Detalle en `docs/BRIEF_BLOQUE_1.md`.

## Tarea 2.1 — Modelo y rutas de gastos
Agregar al schema: `Gasto`, `CategoriaGasto`. Migración. Rutas: registrar
gasto, listar por período. Aplicar la regla de coherencia de empleado
(rechazar con 400 si categoría de empleado sin `empleadoId`, o categoría
normal con `empleadoId`).
**Verificable:** se registra un gasto normal y uno de pago a empleado; un
gasto incoherente es rechazado con 400.

## Tarea 2.2 — Frontend de gastos
Módulo de gastos: formulario con la categoría "pago a empleado" (muestra
los campos de empleado solo cuando aplica), lista de gastos por período.
**Verificable:** desde la UI se registra un gasto de cada tipo y la lista
los muestra.

---

# FASE 3 — Dashboard de ganancias

Detalle en `docs/BRIEF_BLOQUE_1.md`.

## Tarea 3.1 — Modelo y rutas de ventas diarias
Agregar al schema: `VentaDiaria` con su índice único parcial. Rutas:
registrar cierre diario, listar por período. Un cierre duplicado para la
misma fecha devuelve 409.
**Verificable:** se registra una venta diaria; un segundo cierre normal de
la misma fecha es rechazado con 409.

## Tarea 3.2 — Servicio y rutas del dashboard
Colocar el servicio de dashboard y sus rutas (`/dashboard/ganancia`,
`/dashboard/gastos-por-categoria`). Endpoint genérico de corrección
(`POST /correcciones`).
**Verificable:** el dashboard de un período devuelve ventas − compras −
gastos correctamente; una corrección por el endpoint genérico funciona para
las tres entidades.

## Tarea 3.3 — Frontend del dashboard y captura de ventas
Pantalla para teclear la venta diaria y el dashboard de ganancias con
período flexible.
**Verificable:** desde la UI se teclea una venta y el dashboard muestra la
ganancia del período.
**Pendiente a resolver aquí:** confirmar si Firestec imprime el total de
ventas diario — define si la captura es asistida o 100% manual.

> Al terminar la Fase 3, el área de finanzas se despliega y se pone en uso
> real ANTES de empezar la Fase 4.

---

# FASE 4 — Fichaje y kioscos

Detalle en `docs/BRIEF_BLOQUE_2.md`.

## Tarea 4.1 — Modelo de fichaje
Agregar al schema: `Empleado` (foto de referencia, número, `qrToken`,
`pinHash`), `Kiosco`. `Fichaje` con el campo `tipo` (cuatro valores).
Migración.
**Verificable:** las tablas existen; se puede crear un empleado con su PIN
hasheado y un kiosco.

## Tarea 4.2 — Identificación y verificación facial
Lógica de identificación por número o QR, y verificación facial 1:1 con
liveness activo contra la foto de referencia.
**Verificable:** un empleado se identifica por número y por QR; la
verificación facial acepta una coincidencia y rechaza una que no lo es.

## Tarea 4.3 — Fichaje de excepción
Implementar los dos mecanismos (PIN, supervisor) según `Sede.modoExcepcion`.
Todo fichaje de excepción queda marcado para revisión. Alerta a RRHH ante
fallos faciales repetidos.
**Verificable:** con el facial fallando, un empleado ficha con PIN; el
fichaje queda marcado para revisión; en una sede modo `supervisor` el
camino correcto se exige.

## Tarea 4.4 — Frontend del kiosco y cola de revisión
Pantalla del kiosco (identificación → facial → resultado) y cola de
revisión de fichajes de excepción para el jefe.
**Verificable:** desde el kiosco se completa un fichaje normal y uno de
excepción; el jefe ve el de excepción en su cola.

---

# FASE 5 — Motor de jornada

Detalle en `docs/BRIEF_BLOQUE_2.md`. Parte más delicada del proyecto.

## Tarea 5.1 — Modelo de jornada
Agregar al schema: `Turno` (con `pausaPorDefecto` y día de descanso),
`Jornada`, `Correccion`, `DiaFestivo`. Migración.
**Verificable:** las tablas existen; se puede crear un turno y un día
festivo.

## Tarea 5.2 — Cálculo de jornada simple
El motor empareja fichajes y calcula una jornada diurna simple: presencia,
pausa medida, horas trabajadas. Capa legal de clasificación
(diurna/nocturna/mixta).
**Verificable:** un test demuestra el cálculo correcto de una jornada
diurna con pausa de comida medida.

## Tarea 5.3 — Recargos, topes y casos especiales
Recargos (25/50/75/150%), topes (3h/día, 9h/semana), turnos que cruzan
medianoche, festivos con sus dos efectos. Casos rotos (fichajes de comida
incompletos, fichajes huérfanos) marcados como anomalía.
**Verificable:** tests cubren cada recargo, un turno que cruza medianoche,
un festivo trabajado y uno no trabajado, y un caso de fichaje incompleto.

## Tarea 5.4 — Cálculo automático y job de huérfanos
El cálculo se dispara al cerrar el fichaje de salida. Job nocturno que
barre fichajes huérfanos.
**Verificable:** al fichar salida, la jornada se calcula sola; el job marca
un fichaje de entrada sin salida pasada la ventana de 16h.

## Tarea 5.5 — Corrección de jornadas y frontend
Mecanismo de corrección vía `Correccion`. Frontend: consulta de horas del
empleado, y pantalla del jefe para corregir jornadas y resolver anomalías.
**Verificable:** el jefe corrige una jornada; queda registrada la
`Correccion` y la jornada se recalcula.
**Antes de producción:** validación de las reglas legales por un asesor
laboral panameño.

---

# FASE 6 — Cobro anticipado de horas extra

Detalle en `docs/BRIEF_BLOQUE_2.md`. Cierra la app.

## Tarea 6.1 — Modelo del cobro
Agregar al schema: `SaldoHorasExtra` (persistido, en dinero),
`SolicitudCobro`, `ConfiguracionCobro` (umbral y % cobrable único).
Migración.
**Verificable:** las tablas existen; se puede definir la configuración de
cobro.

## Tarea 6.2 — Servicio de saldo
Servicio transaccional único que escribe el saldo: acredita al cerrar una
jornada, debita al pagar un cobro. Nunca negativo (lectura bajo bloqueo).
**Verificable:** un test demuestra que el saldo se acredita y debita
correctamente, y que un cobro que dejaría el saldo negativo es rechazado.

## Tarea 6.3 — Solicitud y aprobación de cobro
Flujo de `SolicitudCobro`: Modelo B (bajo el umbral directo, sobre el
umbral requiere aprobación del jefe). El % cobrable se aplica sobre el
monto en dinero.
**Verificable:** un cobro bajo el umbral pasa directo; uno sobre el umbral
queda pendiente de aprobación; el % cobrable limita el monto adelantable.

## Tarea 6.4 — Conexión con gastos y frontend
Al marcar un cobro como "pagado", se crea automáticamente un `Gasto` con
`referenciaOrigen`. Frontend: solicitud de cobro del empleado, saldo
visible, aprobación del jefe.
**Verificable:** marcar un cobro como pagado genera el gasto
correspondiente en finanzas; desde la UI el empleado solicita y el jefe
aprueba.

> Al terminar la Fase 6, la app está completa: las dos áreas funcionando e
> integradas.

---

## Resumen — 24 tareas

| Fase | Tareas | Entrega |
|------|--------|---------|
| 0 | 0.1 – 0.4 | Fundaciones: scaffold, núcleo, auth, login |
| 1 | 1.1 – 1.4 | Cuentas por pagar |
| 2 | 2.1 – 2.2 | Gastos |
| 3 | 3.1 – 3.3 | Dashboard de ganancias |
| 4 | 4.1 – 4.4 | Fichaje y kioscos |
| 5 | 5.1 – 5.5 | Motor de jornada |
| 6 | 6.1 – 6.4 | Cobro anticipado de horas extra |

Regla general: una tarea a la vez, en orden, verificando cada una antes de
seguir. Claude Code lee el brief correspondiente y `DECISIONES.md` antes de
cada tarea.
