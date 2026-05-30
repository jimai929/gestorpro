# GestorPro — Registro de decisiones

Decisiones de diseño ya cerradas. Sirve para no rediscutir lo resuelto y
para que cualquiera que retome el proyecto entienda el porqué de cada cosa.

---

## Producto

- **Nombre comercial:** GestorPro. **Nombre técnico:** `gestorpro`.
- Es **una sola app**, no dos proyectos. Dos áreas funcionales (finanzas y
  asistencia) que comparten núcleo y están conectadas.
- Producto pensado para venderse a varias empresas, no para un solo cliente.
- NO es un POS y NO maneja inventario — eso lo cubre Firestec (sistema
  externo, sin API).

## Arquitectura general

- Stack: Node.js + TypeScript + Fastify, Prisma + PostgreSQL, React + Vite,
  JWT con refresh. Despliegue híbrido (local en sedes + nube).
- Backend organizado en `core/` (transversal), `shared/` (lógica de negocio
  compartida) y las áreas `finanzas/` y `asistencia/`.
- Un solo `schema.prisma` para toda la app.

## Finanzas

- **Inmutabilidad:** los movimientos de dinero (Gasto, PagoProveedor,
  VentaDiaria) nunca se editan ni se borran. Se corrigen con asientos
  nuevos: reverso + corrección, encadenados por `corrigeId`.
- El **servicio de corrección es genérico** — uno solo para las tres
  entidades, con un adaptador por entidad. Vive en `shared/`.
- **`CuentaPorPagar` NO se persiste** — es una vista derivada de Compra +
  PagoProveedor. El saldo se calcula, no se guarda.
- **`Compra.tipo` (contado/crédito) — añadido 2026-05-29:** una compra de
  `credito` es una deuda (con vencimiento y saldo) y aparece en cuentas por
  pagar; una de `contado` se paga en el acto, no tiene vencimiento y la vista
  `cuenta_por_pagar` la **excluye** (no hay saldo que seguir). Ambas cuentan
  igual como **costo** en el dashboard (compras por devengado, fecha de emisión,
  sin importar el tipo). El default es `credito`.
- **Proveedor con contacto — añadido 2026-05-29:** `Proveedor` gana `telefono` y
  `personaContacto` (opcionales). La baja de un proveedor es **lógica** (`activo`),
  nunca física, porque las facturas lo referencian; los inactivos no aparecen en
  los selectores.
- **`Auditoria` es append-only** — solo inserción, nunca update ni delete.
  Garantía en tres capas: superficie cerrada del repositorio, REVOKE en
  Postgres, y ausencia de campos mutables.
- **`CategoriaGasto` es una tabla gestionable** por el admin, no un enum.
- **Endpoint de corrección único y genérico** (`POST /correcciones`), no
  uno por entidad.
- Gastos **rechaza** datos incoherentes de empleado (categoría de empleado
  sin empleadoId, o categoría normal con empleadoId).
- Dashboard: ganancia = ventas − compras − gastos. Compras por criterio
  **devengado** (fecha de emisión de la factura), no de caja.
- **`VentaDiaria` (cierre de caja) — decisión revisada 2026-05-29:** la
  operación es de 24 h con varias cajas y tres turnos, así que la unicidad pasa
  de (sede, fecha) a **(sede, fecha, turno, caja)**: una caja cierra una vez por
  turno. Sigue siendo un único cierre `normal` por esa llave, con índice único
  parcial; los asientos de corrección quedan exentos. Cada cierre registra un
  **arqueo de caja** con desglose por tipo (efectivo, tarjeta, Yappy, lotería)
  en `DetalleCierre`. El **total del cierre = suma de los tipos** y **debe
  cuadrar con el total que reporta Firestec**. La **lotería son premios pagados
  que están en el cajón, NO un ingreso**; el arqueo existe para **cuadrar la
  caja contra Firestec y detectar descuadres**, no para calcular ganancia por
  tipo. La **ganancia del dashboard usa el total del cierre**, sin desglosar por
  tipo; el dashboard filtra cierres por **caja y turno** para auditar
  descuadres. `cerradoPor` es solo la **identificación** de quién hizo el cierre
  (no es FK a `Empleado`: las horas trabajadas son de asistencia).
  `horaApertura`/`horaCierre` son descriptivas, fuera de la llave. **No es un
  POS:** nunca se guardan ventas individuales ni productos, solo el cierre.

## Asistencia

- El **`Fichaje` es el hecho crudo inmutable**; la **`Jornada` es
  interpretación calculada y recalculable**; la **`Correccion` es registro
  inmutable** de cada ajuste humano.
- **Fichaje de excepción** (cuando el facial falla con empleado legítimo):
  dos mecanismos — PIN personal hasheado y autorización de supervisor —
  configurables por sede vía `Sede.modoExcepcion` (`pin | supervisor |
  ambos`). Todo fichaje de excepción queda marcado para revisión del jefe.
- El caso "sin supervisor en turnos tempranos" se resuelve solo: el PIN
  siempre funciona.
- **`Fichaje.tipo`** con cuatro valores: `entrada`, `salida_comida`,
  `entrada_comida`, `salida`.
- **Pausa de comida medida** (diferencia entre los fichajes de comida), no
  configurada. `Turno.pausaPorDefecto` es solo red de seguridad para cuando
  faltan los fichajes de comida.
- Fichajes de comida incompletos o en desorden → jornada marcada como
  anomalía para el jefe.
- La **Jornada se calcula** al cerrar el fichaje de salida; un job nocturno
  caza fichajes huérfanos.
- **Recargos legales FIJOS**, no configurables: 25% extra diurna, 50%
  nocturna, 75% mixta nocturna, 150% festivo. No existe ninguna opción para
  pagar bajo el mínimo legal.
- **`DiaFestivo`** tiene dos efectos: dispara el 150% si se trabaja, y
  protege el día contra descuento si no se trabaja (salario fijo).
- **`SaldoHorasExtra`:** persistido (no derivado), en **dinero** (no en
  horas), escrito solo por su servicio transaccional, nunca negativo.
- **% cobrable:** un número único, configurable por el admin en
  `ConfiguracionCobro`, aplicado sobre el monto en dinero ya calculado (no
  sobre el número del recargo). El empleado siempre recibe el 100%; el %
  solo decide cuánto se adelanta y cuánto va a la quincena.
- **Modelo B:** bajo un umbral configurable el cobro es directo; sobre el
  umbral requiere aprobación del jefe.
- La app no mueve dinero real — el admin entrega el efectivo por fuera y
  marca "pagado".
- **Conexión entre áreas:** al marcar un cobro como "pagado" se crea
  automáticamente un `Gasto` en finanzas, con `referenciaOrigen` apuntando
  a la `SolicitudCobro`. Dirección: asistencia → finanzas. Finanzas no
  conoce a asistencia.

## Seguridad

- Contraseñas y PINs SIEMPRE hasheados. Nunca texto plano, nunca en logs.
- El `usuarioId` de cualquier operación sale del token JWT, nunca del body.
- Los usuarios los crea un administrador; no hay registro abierto.
- Consentimiento biométrico: anexo firmado al contrato, gestionado por RRHH
  fuera de la app.

## Pendientes abiertos

> El código de las 7 fases (24 tareas) está construido y probado. Los puntos de
> abajo NO bloquean el desarrollo pero **deben resolverse ANTES de poner la app
> en producción**. Son validaciones externas, no código pendiente.

### Pre-producción — VALIDACIÓN LEGAL PANAMEÑA (bloquea la asistencia en prod)

Las reglas laborales están implementadas como **interpretación general, NO
asesoría legal**. Un asesor laboral panameño debe validar lo siguiente (todo
vive en `backend/src/asistencia/jornada/legal.ts`, FIJO/no configurable):

- **Divisor horario del valor‑hora:** hoy `valorHora = salario mensual / 240`
  (240 = 30 días × 8 h). Es el supuesto que más necesita validación; cambiarlo
  es un solo lugar (`DIVISOR_HORAS_MES`).
- **Recargos de hora extra (fijos):** 25 % diurna, 50 % nocturna, 75 % mixta,
  **150 % festivo**. No existe opción para pagar bajo el mínimo legal.
- **Franja nocturna:** 18:00–06:00. **Jornadas:** diurna 8 h, nocturna 7 h,
  mixta 7.5 h. **Topes de extra:** 3 h/día y 9 h/semana.
- **Festivos:** dos efectos (150 % si se trabaja; sin descuento si no se
  trabaja, salario fijo).

Además: el motor clasifica diurna/nocturna por la hora **local del servidor** —
fijar zona horaria **America/Panamá** en el despliegue.

### Pre-producción — Firestec (captura de ventas, Fase 3)

Confirmar si Firestec imprime/muestra el total de ventas diario. Hoy la captura
del cierre diario es **100 % manual** (pantalla de dashboard). Si Firestec lo
imprime, se puede hacer semi‑asistida; no requiere cambios de modelo.

### Endurecimiento de despliegue (no bloqueante, recomendado)

- **Auditoría append‑only:** el `REVOKE` solo es efectivo si la app conecta con
  un **rol de Postgres NO dueño** de las tablas. Hoy conecta como dueño; en prod,
  crear un rol de aplicación con privilegios limitados.
- **Refresh‑on‑401** en el cliente HTTP del frontend (hoy el access token en
  memoria expira a los 15 min sin reintento automático).

### Marca

- **Dominio y marca:** verificar disponibilidad de `gestorpro.com` y evaluar
  el registro de la marca en Panamá.
