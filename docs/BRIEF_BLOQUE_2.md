# GestorPro — Brief del área de asistencia

Control de asistencia para la plataforma de administración retail en Panamá.
20–100 empleados, varias sedes, diseño escalable. Se construye DESPUÉS del
Bloque 1 (finanzas), que ya está cerrado.

Cubre: fichaje en kiosco, motor de jornada laboral, y cobro anticipado de
horas extra.

---

## Stack

Mismo que el Bloque 1: Node.js + TypeScript + Fastify, Prisma + PostgreSQL,
Vitest + Testcontainers. Las entidades nuevas se agregan al mismo
`schema.prisma`. `Sede` y `Usuario` ya existen del Bloque 1.

---

## AVISO LEGAL — leer antes de implementar

Las reglas del Código de Trabajo de Panamá (recargos, jornadas, festivos)
están implementadas según interpretación general, NO como asesoría legal.
Antes de producción, un asesor laboral panameño debe validar: divisor
horario, recargos, manejo de festivos y días compensatorios.

Regla firme de diseño: **los recargos legales (25/50/75/150%) NO son
configurables.** El motor los aplica fijos. No se debe agregar ninguna
opción que permita pagar por debajo del mínimo legal, aunque el empleado
"esté de acuerdo" — un acuerdo bajo el mínimo es nulo y expone al negocio.
Lo configurable es la modalidad de compensación (dinero vs. día
compensatorio) y el % cobrable por adelantado (ver más abajo).

---

## Entidades nuevas del Bloque 2

Agregar al schema.prisma. Las que manejan hechos crudos o dinero siguen
el patrón de inmutabilidad del Bloque 1.

- `Empleado` — datos del empleado, foto de referencia facial, número de
  empleado, `qrToken` (firmado y revocable), `pinHash` (PIN personal
  hasheado, NUNCA texto plano), referencia a `Sede`. Salario fijo.
- `Kiosco` — tablet/PC de fichaje, pertenece a una `Sede`.
- `Turno` — capa configurable. Horario, tolerancia de tardanza,
  `pausaPorDefecto` (red de seguridad, ver motor de jornada), día de
  descanso semanal como campo del turno.
- `Fichaje` — hecho crudo INMUTABLE. Campo `tipo`:
  `entrada | salida_comida | entrada_comida | salida`. Captura foto.
- `Jornada` — interpretación CALCULADA y corregible. Se recalcula y
  sobreescribe (NO append-only). Horas normales, extra, clasificación
  diurna/nocturna/mixta, recargos, monto.
- `Correccion` — registro INMUTABLE y auditado de cada ajuste humano a
  una jornada.
- `Auditoria` — ya existe del Bloque 1, append-only. Reutilizar.
- `SaldoHorasExtra` — saldo por empleado, PERSISTIDO, en DINERO.
- `SolicitudCobro` — solicitud de cobro anticipado contra el saldo.
- `ConfiguracionCobro` — parámetros configurables del cobro (umbral del
  Modelo B, % cobrable único).
- `DiaFestivo` — gestionable por el admin (CRUD simple). Los festivos
  cambian cada año.

`Sede` (del Bloque 1) gana un campo nuevo: `modoExcepcion`
(`pin | supervisor | ambos`).

---

## 1. Fichaje en kiosco

El empleado ficha por dos vías a elección: teclear su número de empleado,
o mostrar su QR (imagen en el celular). Luego verificación facial 1:1
contra la foto de referencia, con liveness activo (el kiosco pide un
gesto en cada fichaje).

### Fichaje de excepción

Cuando el empleado se identificó bien (número o QR válido) pero el facial
1:1 falla, el fichaje se PERMITE por uno de dos mecanismos, según el
`modoExcepcion` de la sede:

- `pin` — el empleado teclea su PIN personal. Funciona siempre, haya o no
  supervisor.
- `supervisor` — un supervisor presente autoriza desde el kiosco con su
  propia identificación.
- `ambos` — el kiosco ofrece las dos opciones.

Reglas firmes:
- TODO fichaje de excepción queda marcado para revisión del jefe. El PIN
  o el supervisor solo PERMITEN el fichaje en el momento; no lo aprueban.
  La validez la decide el jefe después, revisando la cola.
- El PIN se guarda hasheado, como una contraseña. Nunca en texto plano.
- Si un empleado falla el facial repetidamente, el sistema alerta a RRHH
  de que la foto de referencia debe reemplazarse.
- No hay escenario donde alguien quede sin poder fichar: si no hay
  supervisor, el PIN siempre funciona.

---

## 2. Motor de jornada

Dos capas.

### Capa legal fija (Código de Trabajo de Panamá, NO configurable)

- Jornadas: diurna 8h/48sem, nocturna 7h/42sem, mixta 7.5h/45sem.
- La jornada se clasifica según cuántas horas caen en franja nocturna.
- Recargos de hora extra: 25% diurna, 50% nocturna, 75% mixta nocturna,
  150% festivo.
- Topes: 3h extra/día, 9h extra/semana.

### Capa configurable (admin)

Turnos, horarios, tolerancia de tardanza, pausas.

### Cuándo se calcula la Jornada

Se calcula al cerrar el fichaje de `salida` (último del día, cuando ya
están los cuatro fichajes). Un job nocturno de respaldo barre los casos
rotos: fichaje de entrada huérfano (sin salida pasada la ventana de ~16h),
fichajes de comida incompletos. Los marca como anomalía para el jefe.

### Turnos que cruzan medianoche

La jornada se ata a la fecha de INICIO del turno, no a la de calendario.
El emparejado de fichajes busca la salida en una ventana de ~16h.

### Cálculo de la pausa de comida

El empleado ficha cuatro veces: entrada, salida_comida, entrada_comida,
salida. La pausa es MEDIDA, no configurada:

```
presencia        = salida − entrada
pausa real       = entrada_comida − salida_comida
horas trabajadas = presencia − pausa real
```

Casos rotos:
- Falta `entrada_comida` (salió a comer, no fichó la vuelta) → jornada
  marcada como ANOMALÍA para revisión del jefe. No se inventa la pausa.
- Faltan AMBOS fichajes de comida → política de respaldo: se descuenta
  `Turno.pausaPorDefecto`. (La pausa medida manda; la del turno solo entra
  si no hay nada que medir.)
- Fichajes de comida en desorden o duplicados → ANOMALÍA para el jefe.

### Festivos

`DiaFestivo` tiene DOS efectos, no solo uno:
1. Empleado trabaja el festivo → el motor aplica el 150%.
2. Empleado NO trabaja el festivo → NO se descuenta nada; el día cuenta
   como pagado (ya está dentro del salario fijo). Un día marcado como
   festivo NO genera ausencia ni descuento aunque no haya ningún fichaje.

Festivo que cruza medianoche: el recargo de 150% aplica SOLO a las horas
que efectivamente caen dentro del día festivo, no a toda la jornada.

Casos especiales (festivo en día de descanso, salario variable) → NO se
modelan en el motor; se tratan como corrección manual del jefe. El motor
asume empleados de salario fijo.

### Corrección de jornadas

La `Jornada` se recalcula y sobreescribe. Cada ajuste humano se registra
como una `Correccion` inmutable y auditada. El `Fichaje` y la `Correccion`
son la verdad intocable; la `Jornada` es el resultado recalculable de
combinarlos.

---

## 3. Cobro anticipado de horas extra

### Saldo

`SaldoHorasExtra` es PERSISTIDO (no derivado) y se lleva en DINERO (no en
horas). Razón de persistirlo: la regla "nunca negativo" exige leer y
comparar el saldo bajo bloqueo al registrar un cobro; eso es limpio con un
saldo persistido (`SELECT ... FOR UPDATE`) y frágil con un agregado
recalculado.

- Toda escritura del saldo pasa por un ÚNICO servicio transaccional.
  Nunca UPDATEs sueltos.
- Las jornadas cerradas ACREDITAN; los cobros DEBITAN; nunca negativo.
- El motor de jornada acredita el MONTO ya con recargo aplicado. El saldo
  no guarda horas crudas, guarda dólares.

### % cobrable

Cuando el empleado quiere cobrar por adelantado, NO puede adelantar el
100% de su saldo. Un `% cobrable` ÚNICO (configurable por el admin en
`ConfiguracionCobro`) define qué fracción del saldo es adelantable; el
resto va a la quincena.

PUNTO CRÍTICO de implementación: el % cobrable se aplica SOBRE EL MONTO EN
DINERO que el motor ya calculó, NUNCA sobre el número del recargo legal.
El recargo legal (25/50/75/150) ya hizo su trabajo al convertir horas en
dinero; después de eso es solo un monto. Un % cobrable de, p.ej., 80%
significa lo mismo para una hora festiva que para una extra diurna: 80%
del dinero generado es adelantable, 20% va a la quincena. El % cobrable y
su complemento SIEMPRE suman 100% — son una partición del dinero ya ganado.

El empleado SIEMPRE recibe el 100% de lo que generó. El % solo decide
CUÁNDO (adelanto vs. quincena), nunca CUÁNTO.

### Modelo B — aprobación

- Bajo un umbral configurable (`ConfiguracionCobro`), el cobro es directo.
- Sobre el umbral, requiere aprobación del jefe.

### Sin movimiento de dinero real

La app solo registra y controla el saldo. El admin entrega el efectivo por
fuera y marca la `SolicitudCobro` como "pagado". Lo no cobrado pasa a la
quincena. Cero doble pago.

### Conexión con el Bloque 1

Al marcar una `SolicitudCobro` como "pagado", el servicio de cobro crea
automáticamente un `Gasto` en el Bloque 1: categoría tipo "pago a
empleado", `tipoPago` = cobro de horas extra, y `referenciaOrigen`
apuntando a la `SolicitudCobro`.

- Dirección de dependencia: Bloque 2 → Bloque 1. El Bloque 1 NO conoce al
  Bloque 2; el módulo de cobro usa el servicio de gastos ya existente.
- El `referenciaOrigen` evita el doble pago: un gasto con ese campo lleno
  ya está contabilizado y no debe teclearse de nuevo.

---

## Roles

- Empleado — ficha, ve sus horas y su saldo.
- Jefe/Supervisor — ve a su equipo, aprueba cobros sobre el umbral,
  revisa la cola de fichajes de excepción y las anomalías de jornada,
  corrige jornadas.
- Administrador — gestiona todo, incluida `ConfiguracionCobro`,
  `DiaFestivo`, turnos y kioscos.

Auth JWT: misma dependencia de Fase 0 que el Bloque 1. El `usuarioId` /
`empleadoId` sale del token, nunca del body.

---

## Principios de diseño que NO se deben romper

- El `Fichaje` es el hecho crudo INMUTABLE. La `Jornada` es interpretación
  calculada y recalculable. La `Correccion` es registro inmutable.
- Los recargos legales son FIJOS. Ninguna opción debe permitir pagar bajo
  el mínimo legal.
- El `SaldoHorasExtra` se lleva en dinero, persistido, escrito solo por su
  servicio transaccional, nunca negativo.
- El % cobrable se aplica sobre el dinero calculado, nunca sobre el número
  del recargo. El empleado siempre recibe el 100%.
- PIN de empleado SIEMPRE hasheado.
- Todo fichaje de excepción y toda corrección de jornada quedan en
  auditoría.
- Consentimiento biométrico: anexo firmado al contrato, gestionado por
  RRHH FUERA de la app.
