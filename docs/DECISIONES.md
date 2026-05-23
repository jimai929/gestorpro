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
- **`VentaDiaria`:** un único cierre `normal` por (sede, fecha), con índice
  único parcial. Los asientos de corrección quedan exentos.

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

- **Firestec** (se resuelve en Fase 3): confirmar si imprime/muestra el
  total de ventas diario. Define si la captura de venta es semi-asistida o
  100% manual.
- **Validación legal** (antes de producción de Fase 5): un asesor laboral
  panameño debe validar divisor horario, recargos y reglas de festivos. Lo
  implementado es interpretación general, NO asesoría legal.
- **Dominio y marca:** verificar disponibilidad de `gestorpro.com` y
  evaluar registro de la marca en Panamá.
