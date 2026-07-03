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
- **Dependencia `qrcode` (frontend, `^1.5.4`) — añadida 2026-05-30:** renderiza
  el `qrToken` de cada empleado como imagen QR escaneable/imprimible en la
  pantalla de empleados (con su carné). Única dependencia añadida fuera del
  scaffolding inicial.
- **Administración desde la app — añadido 2026-05-29:** las entidades de
  configuración se gestionan desde una sección **"Administración"** de la app.
  - **Sedes gestionables** (crear/editar). La baja es **lógica** (`activo`),
    nunca física, porque compras, gastos, empleados, cajas, etc. la referencian;
    los selectores muestran solo activas. `GET /sedes` sigue devolviendo solo
    activas por defecto (`?incluirInactivas=true` para la pantalla de gestión).
  - **`Empleado` es una entidad transversal** (lo usan cobro, asistencia y el
    cierre de caja), así que su gestión vive en `core/empleado` (backend) y
    `administracion/empleado` (frontend), NO bajo `asistencia/` — igual que las
    sedes (`core/sede` + `administracion/sedes`). Ahí se **consolida** el
    `GET /empleados` que antes vivía en cobro. PIN de 4 dígitos hasheado
    (argon2) con validación anti-trivial; `qrToken` único y rotable; la foto de
    referencia queda como campo preparado para el reconocimiento facial futuro
    (sin engine ahora). Rotación de secretos por `POST` (`/empleados/:id/qr`,
    `/empleados/:id/pin`).
  - **Roles operativos — añadido 2026-06-01:** lo que un empleado *hace* en la
    operación (cajera, verificador y, a futuro, vendedor, técnico…) son **roles
    operativos**, NO una entidad aparte y NO lo mismo que `Usuario.rol` (que es
    la autorización del sistema). Un empleado puede tener **varios a la vez**
    (N:M: `RolOperativo` + join `EmpleadoRolOperativo`). El catálogo es
    **extensible por seed** (`cajera`, `verificador` de base); baja lógica
    (`activo`). `GET /empleados?rol=cajera` filtra por la **clave** del rol; la
    asignación va por los endpoints de Empleado (solo admin).
  - **Catálogo de cajas físicas — ELIMINADO 2026-06-01.** Se llegó a construir un
    catálogo `Caja` por sede (parte (c)), pero el dominio se reencuadró: el cierre
    se identifica por la **cajera** (empleado con rol operativo), no por un
    registro físico. El modelo `Caja`, su módulo, rutas, pantalla y enlaces se
    eliminaron con una **migración de DROP nueva** (sin editar el histórico ya
    aplicado).

> Las convenciones de **código y de proceso** (formularios, verificación por UI,
> revisión adversarial) viven en `docs/CONVENCIONES.md`.

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
- **Excepción acotada al append-only de `Auditoria` (multi-tenant, 2026-06-21):**
  completar la columna estructural `empresa_id` en las filas históricas de
  `auditoria` durante la conversión a multi-tenant **NO viola el append-only**. Es
  un UPDATE **una sola vez**, ejecutado por el rol **migrador (owner)** —imposible
  desde `gestorpro_app`, que conserva el REVOKE—, que **solo añade el tenant al que
  la fila siempre perteneció** (la única empresa que existía) y **NO toca el hecho
  auditado** (`entidad`/`entidad_id`/`accion`/`usuario_id`/`detalle`/`creado_en`).
  Es el mismo principio "metadata estructural ≠ alteración del hecho" de la
  normalización de identidad del cierre de caja (ver más abajo, "Datos y arranque"),
  aplicado a la bitácora. Fuera de esta conversión, `auditoria` sigue siendo
  estrictamente append-only. Detalle: `docs/ARQUITECTURA_MULTITENANT.md` §7.3.
- **Identidad de `Empleado` es única POR EMPRESA (multi-tenant, 2026-06-21):**
  `numero` y `qrToken` son únicos **dentro de su empresa**, no globales (como en
  single-tenant) ni por sede. Dos empresas pueden tener cada una un "E001"; una
  empresa NO puede repetir "E001" entre sus sedes. Se implementa a nivel BD
  (fail-closed) añadiendo `empresa_id` a `empleado` + `@@unique([empresaId, numero])`
  y `([empresaId, qrToken])`. Desnormalizar `empresa_id` en `empleado` NO
  contradice la regla "no desnormalizar tablas de dinero inmutables": `empleado` no
  es tabla de dinero. Detalle: `docs/ARQUITECTURA_MULTITENANT.md` (Ola 3c).
- **`CategoriaGasto` es una tabla gestionable** por el admin, no un enum.
- **Endpoint de corrección único y genérico** (`POST /correcciones`), no
  uno por entidad.
- Gastos **rechaza** datos incoherentes de empleado (categoría de empleado
  sin empleadoId, o categoría normal con empleadoId).
- Dashboard: ganancia = ventas − compras − gastos. Compras por criterio
  **devengado** (fecha de emisión de la factura), no de caja.
- **`VentaDiaria` (cierre de caja) — revisado 2026-05-29; cajera 2026-06-01:** la
  operación es de 24 h con tres turnos. La unicidad es **(sede, fecha, turno,
  cajera)**: una **cajera** cierra una vez por turno (campo `cajera`, antes
  `caja`). Sigue siendo un único cierre `normal` por esa llave, con índice único
  parcial `uq_venta_normal`; los asientos de corrección quedan exentos. Cada
  cierre registra un **arqueo de caja** con desglose por tipo (efectivo, tarjeta,
  Yappy, lotería) en `DetalleCierre`. El **total del cierre = suma de los tipos**
  y **debe cuadrar con el total que reporta Firestec**. La **lotería son premios
  pagados que están en el cajón, NO un ingreso**; el arqueo existe para **cuadrar
  la caja contra Firestec y detectar descuadres**, no para calcular ganancia por
  tipo. La **ganancia del dashboard usa el total del cierre**, sin desglosar por
  tipo; el dashboard filtra cierres por **cajera y turno** para auditar
  descuadres (filtro **case-insensitive**, tolera valores legacy de texto libre).
  `cajera` (quién operó la caja, rol operativo Cajera) y `cerradoPor` (quién
  verificó/cerró, rol operativo Verificador) son **snapshot string**
  `"E001 - Nombre"`, **NO FK** a `Empleado`: el cierre es auditoría inmutable y
  debe quedar legible aunque el empleado cambie. Si la cajera y el verificador
  son la **misma persona**, se **permite con advertencia** (no se bloquea: en
  negocios pequeños a veces coinciden). `horaApertura`/`horaCierre` son
  descriptivas, fuera de la llave. **No es un POS:** nunca se guardan ventas
  individuales ni productos, solo el cierre.

## Datos y arranque

- **GestorPro arranca desde cero — decisión 2026-06-02.** El sistema parte sin
  datos del cliente: la base se llena operando, no importando un histórico.
- **No habrá migración ni importación de datos históricos** del cliente, ni
  ahora ni más adelante. No se construye ningún pipeline de importación.
- **Los datos sucios que hubo en el dev DB eran basura de prueba** (cierres con
  `cajera`/`cerradoPor` de texto libre: `yoany`, `9 yon`, `1`, `2`, `Principal`,
  `migración`, …) acumulada en verificaciones por UI. Se **eliminaron con un
  `prisma migrate reset`** del dev DB (autorizado), no se preservó nada.
- **No se construye script de normalización de datos legacy.** Se descartó el
  plan de `normalizar-cajeras-legacy.ts` / `mapeo-cajeras.ts`: no hay datos
  reales que preservar, así que mapear texto libre a empleados no aporta valor.
- **La normalización de identidad de `cajera`/`cerradoPor`**, si alguna vez
  hiciera falta (p. ej. un typo en un snapshot real), sería **mantenimiento de
  calidad de dato** (corregir una etiqueta de identidad), **no** una corrección
  de dinero. Tocaría solo el snapshot string, nunca `monto`/`detalles`/`tipo`.
- **La regla de inmutabilidad sigue intacta** para los movimientos y montos
  financieros reales (Gasto, PagoProveedor, VentaDiaria): se corrigen con
  reverso + corrección, nunca se editan ni se borran. El punto anterior es una
  excepción acotada a la *etiqueta de identidad*, no al dinero.
- **Sembrado del dev DB en Prisma ORM v7 — nota 2026-06-02.** En Prisma v7
  `prisma migrate reset` **YA NO ejecuta el seed automáticamente** (lo hacía en
  v6 y anteriores; se eliminó en v7). El flujo correcto para preparar el dev DB
  es un único comando: **`npm run db:reset`**, que ejecuta
  `prisma migrate reset --force && prisma db seed`. (También existe
  `npm run db:seed` = `prisma db seed` para sembrar sin resetear.) **No se toca
  `prisma.config.ts`**: el hook `migrations.seed` está correcto y lo dispara
  `prisma db seed`. El **seed debe seguir siendo idempotente** (correrlo dos
  veces no duplica ni falla), porque `db:seed` puede ejecutarse sobre una base
  ya sembrada. **⚠️ `db:reset` es SOLO para entornos de desarrollo. NUNCA
  ejecutarlo contra producción** — `prisma migrate reset --force` borra todos
  los datos sin confirmación.

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

### Cambiar-empresa (Fase 4c) ✅ DECIDIDO (2026-07-01)

Huecos que `ARQUITECTURA_MULTITENANT.md` §3.5 dejaba abiertos, cerrados así
(implementado en `POST /auth/cambiar-empresa`):

- **Respuesta:** `{ accessToken, usuario }` (UsuarioPublico con la empresa nueva);
  el refresh token NO se rota (la sesión se conserva, solo cambia su empresa).
- **Sesiones:** se actualiza `empresaIdActiva` de TODAS las sesiones del usuario
  (`updateMany` por `usuarioId`): la empresa activa es preferencia de USUARIO, no
  de dispositivo — el access token no lleva claim de sesión, no puede identificar
  una fila concreta.
- **Denegación:** 403 con mensaje ÚNICO para inexistente / inactiva / sin
  membresía (anti-enumeración: no confirma la existencia de otros tenants). El
  formato del uuid se corta en el schema (400) antes de llegar a Prisma.
- **Super-admin:** entra a cualquier empresa ACTIVA sin membresía con rol
  `empleado` (mínimo privilegio); su poder DENTRO del tenant viene de que
  `autorizar` deja pasar `esSuperAdmin` **solo si `empresaId != null`** (en la
  vista plataforma, con `empresaId=null`, NO pasa guards de rol: fail-closed).
  `resolverContextoActivo` honra la empresa preferida de la sesión para el
  super-admin aunque no tenga membresía (si la empresa sigue activa): la sesión
  de soporte sobrevive al refresh; la baja del tenant lo expulsa al siguiente
  refresh. `empresaId: null` en el body = "volver a plataforma" (solo
  super-admin; a un usuario normal se le niega).
- **Auditoría:** asiento `cambiar_empresa` (entidad `empresa`) bajo la empresa
  DESTINO al entrar, o bajo la que se DEJA al volver a plataforma, con el
  `usuarioId` real del token y `detalle {desde, hacia}` — rastro del §4.4 modo 1.
- **`Membresia.predeterminada` NO se toca:** solo elige la empresa del login;
  la activa de la sesión vive en `SesionRefresco.empresaIdActiva`.
- La ruta NO está exenta del cambio forzado de contraseña: con contraseña
  temporal responde 403 `DEBE_CAMBIAR_CONTRASENA` (default-block).

### Restablecer contraseña (dos niveles) ✅ DECIDIDO (2026-07-02)

`POST /usuarios/:usuarioId/restablecer-contrasena` (guard
`[autenticar, autorizar('administrador')]`):

- **Dos niveles SIN endpoint de plataforma:** un admin del tenant restablece
  SOLO usuarios con membresía en SU empresa (`empresaId` del token, comparado
  con `membresia @@unique([usuarioId, empresaId])`); el super-admin obtiene el
  mismo poder ENTRANDO a la empresa vía cambiar-empresa (en plataforma,
  `empresaId=null`, `autorizar` lo rechaza — probado).
- **Mecanismo = el born-true del alta:** contraseña TEMPORAL del body
  (minLength 8) + `debeCambiarContrasena=true` + `deleteMany` de TODAS las
  sesiones del objetivo + asiento `restablecer_contrasena` (usuarioId = el
  operador real del token; empresa por GUC del override), en una transacción;
  argon2 fuera de la tx; `detalle` OMITIDO (jamás contraseñas). El primer
  login con la temporal cae en el cambio forzado (default-block existente).
- **Denegación 404 ÚNICA e indistinguible:** objetivo inexistente = de otro
  tenant = cuenta de plataforma (`esSuperAdmin`) → mismo cuerpo exacto
  (anti-enumeración). Las cuentas de plataforma NO se restablecen por aquí
  (rotación por mantenimiento, mismo criterio que el guard B1).
- **Auto-restablecimiento prohibido (400):** la propia cuenta va por
  `/auth/cambiar-contrasena` (exige la contraseña actual); permitirlo dejaría
  que una sesión robada de admin tome la cuenta sin conocer la clave.
- Sin rate limit propio (como su hermana `POST /usuarios`, que también hashea);
  `usuario.activo` NO se toca (restablecer no revive cuentas dadas de baja).

### Baja / reactivación de usuarios del tenant ✅ DECIDIDO (2026-07-02)

`PATCH /usuarios/:usuarioId` con body `{ activo: boolean }` (guard
`[autenticar, autorizar('administrador')]`, dos niveles como restablecer):

- **Baja LÓGICA vía `Usuario.activo`**, nunca borrado (fichajes, auditoría y
  snapshots referencian la cuenta). `activo` es el ÚNICO campo mutable por esta
  ruta: rol, email y contraseña tienen sus propios endpoints con sus guards.
- **`Usuario.activo` es GLOBAL → cuenta multi-empresa se RECHAZA con 409** en
  ambas direcciones: desactivarla desde un tenant la dejaría fuera de TODAS las
  empresas (mutación cross-tenant). Su estado se gestiona desde la plataforma.
  Hoy ningún endpoint crea segundas membresías (email UNIQUE global; las altas
  siempre crean usuario nuevo), así que el 409 solo aparece ante estado sembrado
  a mano. **Precondición para el futuro selector multi-empresa (backlog 4c):**
  al añadir cualquier endpoint que cree membresías sobre usuarios existentes,
  mover este conteo DENTRO de la transacción (hoy corre fuera: TOCTOU inexplotable
  que pasaría a ser real; hay comentario centinela en el código).
- **Auto-baja prohibida (400)**: evita el lock-out PROPIO; en el camino secuencial
  normal el tenant nunca queda sin admins (el actor es un admin activo). Alcance
  HONESTO: NO cubre dos admins desactivándose mutuamente en concurrencia, un token
  residual I5 (≤15 min) ni un super-admin desactivando al último admin — casos de
  disponibilidad recuperables por el super-admin (cambiar-empresa → reactivar o
  crear admin); cerrarlos exigiría SERIALIZABLE (desproporcionado). El uuid del
  path se normaliza a minúsculas antes de comparar (mismo caso que restablecer).
- **Desactivar EXPULSA todas las sesiones** (`deleteMany` de `SesionRefresco`):
  el refresh muere al instante; el access token vivo expira en ≤15 min (tradeoff
  I5 aceptado). Reactivar NO toca sesiones ni contraseña.
- **Denegación 404 ÚNICA** (inexistente = otro tenant = plataforma) e
  **idempotencia sin ruido**: pedir el estado que ya tiene → 200 con la fila
  actual, sin asiento duplicado (updateMany condicional DENTRO de la tx: dos
  PATCH concurrentes al mismo estado producen UN solo asiento). Asientos:
  `desactivar_usuario` / `reactivar_usuario` con `detalle {activo}`.
- **Derivada sobre restablecer**: una cuenta desactivada ya NO se puede
  restablecer (409, "reactívala antes") — el 204 sobre una cuenta que el login
  rechaza era un éxito engañoso. Refuerza el "no revive cuentas dadas de baja".

### Baja / reactivación de empresas (plataforma) ✅ DECIDIDO (2026-07-02)

`PATCH /empresas/:empresaId` con body `{ activo: boolean }` (guard
`[autenticar, soloPlataforma]`, solo super-admin, 404 anti-enumeración al resto):

- **Baja LÓGICA vía `Empresa.activo`**, nunca borrado (retención legal; todos
  los datos del tenant la referencian). Reactivar restaura el acceso sin tocar
  nada más.
- **I5 acotado a empresas**: la frontera fail-closed YA existía
  (`resolverContextoActivo` rechaza empresas inactivas en login/refresh/
  cambiar-empresa). La baja ADEMÁS **expulsa las sesiones de refresco de los
  usuarios con membresía en el tenant** (misma tx): el refresh muere al
  instante; solo queda el access token residual ≤15 min (tradeoff I5 aceptado).
  Las sesiones de soporte del super-admin NO se tocan: su refresh cae solo a
  plataforma (la preferida inactiva deja de honrarse). Colateral ACEPTADO
  (fail-closed): en un hipotético usuario multi-membresía (hoy solo por seed/SQL)
  la expulsión por MEMBRESÍA borra también sus sesiones activas en OTRAS
  empresas — sobre-expulsar en una purga de seguridad es el lado conservador;
  el peor efecto es un re-login. Relacionado: lockout de login si su
  PREDETERMINADA es la empresa dada de baja (preexistente, documentado en
  `BUGS_PREEXISTENTES.md`; se resuelve con el selector multi-membresía).
- **Idempotencia ATÓMICA** (mismo patrón que la baja de usuarios): updateMany
  condicional dentro de la tx; sin asiento duplicado. Asientos
  `desactivar_empresa` / `reactivar_empresa` con `usuarioId` = super-admin real
  del token y `empresa_id` EXPLÍCITO (bajo bypass el GUC no está fijado —
  mismo criterio que `crearEmpresa`).
- El super-admin puede darla de baja incluso DESDE DENTRO (sesión de soporte):
  su siguiente refresh lo devuelve a plataforma, sin 401 (probado).

### I5 — revocación inmediata del access token vivo ✅ DECIDIDO (2026-07-03)

Cierra la decisión abierta #5 de `ARQUITECTURA_MULTITENANT.md`. `autenticar`
verifica en CADA request autenticada, además del JWT:

- **Empresa del token inactiva o inexistente → 401** (consulta por PK, fuera de
  RLS). El token residual de un tenant dado de baja muere en la request
  siguiente, sin esperar su TTL.
- **Claim `esSuperAdmin` ya no cierto en BD** (flag revocado o cuenta
  desactivada) **→ 401**: el poder de plataforma no sobrevive ni un request a
  su revocación. Solo se consulta si el token RECLAMA super-admin.
- **Alcance HONESTO**: el `activo` de un usuario NORMAL no se chequea por
  request — su baja ya expulsa todas las sesiones y el residuo ≤15 min sigue
  siendo el tradeoff aceptado (pineado por test para que "chequear a todos"
  no se cuele sin decidirse: costaría una consulta extra por request de toda
  la app).
- Coste: 1 consulta PK por request de tenant; 1 por request de PLATAFORMA
  (lookup del usuario super-admin); 2 solo cuando un super-admin opera DENTRO
  de un tenant. El 401 dispara el refresh-on-401 del cliente: usuario normal
  cae al login; super-admin de soporte vuelve solo a plataforma. Un fallo de
  BD en estos lookups responde 500 genérico ('Error interno.', detalle al
  log): sin él, el error handler por defecto filtraría el mensaje crudo de
  Prisma en toda ruta autenticada.
- **El canal del KIOSCO también queda cubierto** (era el único acceso que no
  pasa por `autenticar` y su device token NO tiene TTL): `resolverContextoKiosco`
  verifica `empresa.activo` en el MISMO select del bootstrap (cero consultas
  extra) — un tenant dado de baja deja de aceptar fichajes de inmediato, y al
  reactivarlo el mismo token de dispositivo vuelve a operar sin reconfigurar.

### Selector multi-membresía (cierre de Fase 4c) ✅ DECIDIDO (2026-07-03)

Cierra el último sub-item de la Fase 4c. Alcance deliberado: NO se crea ningún
endpoint que añada membresías a usuarios existentes (eso es una feature futura
de plataforma con su precondición TOCTOU ya registrada arriba); este slice hace
usable el estado multi-membresía que el modelo ya soporta.

- **Fallback sobre empresas ACTIVAS SOLO en LOGIN** (`resolverContextoActivo`):
  si la predeterminada cayó, el login entra a la SIGUIENTE activa — cierra el
  lockout de `BUGS_PREEXISTENTES.md`. El REFRESH deliberadamente NO hace
  fallback (hallazgo del revisor): si conmutara de empresa en silencio, el
  retry-on-401 del cliente re-ejecutaría la mutación EN VUELO contra la otra
  empresa (dinero al tenant equivocado, invisible) — el refresh falla (401),
  el usuario re-loguea y el login (acto explícito y visible) hace el fallback.
  Un usuario cuya ÚNICA empresa cayó sigue en 401 (nada inventa acceso). De
  paso se eliminó la segunda consulta (estado/nombre de la empresa viajan en
  el include de las membresías).
- **`UsuarioPublico.membresias`** (login, /me y cambiar-empresa): SOLO empresas
  activas, orden predeterminada-primero, forma `{empresaId, empresaNombre, rol}`.
  Super-admin: `[]` (invariante §4.2; su "selector" es la plataforma). SOLO para
  UI: el cambio real lo valida `POST /auth/cambiar-empresa` contra la BD.
- **Selector en la barra** (LayoutPrincipal): la etiqueta de empresa se vuelve
  un `<select>` solo con >1 membresía; al elegir, `cambiarEmpresa` + navegar a
  `/` (la pantalla actual puede no existir bajo el rol de la otra empresa).
  Error visible en la barra; en fallo el selector conserva la empresa real.
- **Carreras del cliente en `cambiarEmpresa` — cobertura HONESTA**: (1) espera
  al refresco EN CURSO antes del POST (sin disparar uno nuevo); (2) tras el
  POST espera de nuevo y RE-IMPONE el token del cambio (cubre un refresh que
  arrancó durante el POST); un refresh posterior ya lee la sesión con la
  empresa nueva persistida → token equivalente, inofensivo. (3) GUARD de
  versión de sesión en `ContextoAuth`: login/logout/cambio la incrementan; el
  /me best-effort del refresh y un cambio en vuelo solo aplican su resultado
  si la versión no cambió — un /me tardío no pisa al usuario recién cambiado
  y un logout durante el cambio no resucita la sesión. Todo con tests.

## Pendientes abiertos

> El código de las 7 fases (24 tareas) está construido y probado. Los puntos de
> abajo NO bloquean el desarrollo pero **deben resolverse ANTES de poner la app
> en producción**. Son validaciones externas, no código pendiente.

### Pre-producción — VALIDACIÓN LEGAL PANAMEÑA ✅ VALIDADO (2026-06-14)

**Resuelto:** el asesor laboral panameño **Jose Moise Jaramillo** firmó la
validación el 2026-06-14 y confirmó los 11 parámetros SIN cambios (veredicto
detallado en `docs/VALIDACION_LEGAL.md`). El
gate bloqueante de la asistencia en producción queda **levantado**. Lo de abajo
queda como referencia de qué se validó (todo vive en
`backend/src/asistencia/jornada/legal.ts`, FIJO/no configurable):

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

### Pre-producción — Firestec (captura de ventas, Fase 3) ✅ DECIDIDO (2026-06-17)

**Resuelto: la captura del cierre diario es 100 % MANUAL** y así se queda.
Firestec no tiene API y no se integra; el operador teclea el arqueo de caja
(efectivo, tarjeta, Yappy, lotería) según lo que reporta Firestec, y el total
debe cuadrar con él. Ya implementado en `FormularioVenta.tsx` — sin cambios de
código ni de modelo pendientes.

### Endurecimiento de despliegue

- **Auditoría append-only / rol de app NO dueño — IMPLEMENTADO y VERIFICADO en
  DEV; PENDIENTE de activar en el VPS.** Existen dos roles Postgres:
  `gestorpro_migrador` (dueño de las tablas, BYPASSRLS, solo migrate/seed) y
  `gestorpro_app` (NO dueño, NOBYPASSRLS), y la app SIEMPRE conecta con
  `gestorpro_app` (`backend/src/core/prisma.ts` ← `DATABASE_URL`; en prod lo fija
  `deploy/docker-compose.yml`). El `REVOKE UPDATE/DELETE/TRUNCATE ON auditoria`
  (`deploy/postgres/post-migrate.sql`) ES EFECTIVO porque la app no es dueña.
  **Verificado en DEV (2026-06-23), conectado como `gestorpro_app`:** dueño de
  `auditoria` = `gestorpro_migrador`, `gestorpro_app` con `rolbypassrls = f`, y un
  `UPDATE auditoria` devuelve `permission denied`. Cubierto por
  `backend/test/finanzas/auditoria-append-only.test.ts` y por el gate de
  `deploy/deploy.sh` (paso 6). El texto anterior ("hoy conecta como dueño") quedó
  **OBSOLETO** con la Fase 5. **NO está activo en el VPS:** el VPS sigue en
  `20260613120000_kiosco_token` (predata la Fase 5) y aún corre con su rol previo;
  se activará al desplegar multitenant (el `initdb` crea los roles en un volumen
  NUEVO, o `ALTER ROLE gestorpro_migrador BYPASSRLS` a mano en un volumen YA
  existente — operación nivel-hierro, verificar el VPS antes). **Estado real del
  VPS: pendiente de confirmar por ssh** (ver `deploy/CHECKLIST_PRODUCCION.md`).
- **Refresh-on-401 — IMPLEMENTADO (código + test).** El cliente HTTP renueva el
  access token una vez ante un 401 y reintenta, con deduplicación de refrescos
  concurrentes (`frontend/src/core/api/cliente.ts`, `cliente.test.ts`). No depende
  del rol de BD; **surtirá efecto en cuanto el frontend se despliegue** (no se
  afirma "ya activo en producción" porque el frontend aún no está desplegado en el
  VPS). El texto anterior ("sin reintento automático") quedó **OBSOLETO**.

### Marca

- **Dominio y marca:** verificar disponibilidad de `gestorpro.com` y evaluar
  el registro de la marca en Panamá.
