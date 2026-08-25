# Manual de usuario de GestorPro

Este manual describe GestorPro tal como funciona hoy en producción (`https://app.gestorpro.us`). Está escrito para el dueño, los supervisores y el personal del negocio; no hace falta conocimiento técnico.

**Cómo leer este manual**

- Los textos que aparecen **en negrita** son exactamente los que verá en pantalla (nombres de botones, campos, mensajes).
- En pantalla, los campos obligatorios llevan un asterisco (*) junto al nombre; en este manual se indican como **Nombre** (obligatorio).
- **B/.** significa balboas, la moneda de Panamá; equivale 1 a 1 al dólar estadounidense.
- Cada tarea indica al inicio qué **roles** pueden hacerla (**Administrador**, **Supervisor**, **Empleado**).
- En el celular las tablas se desplazan de lado: los botones de acción (**Corregir**, **Abonar**, **Editar**…) están al **final de la fila**; deslice a la derecha para verlos.

---

## 0. Índice de tareas frecuentes

| Quiero… | Vaya a |
|---|---|
| Entrar por primera vez y cambiar la contraseña temporal | 2.1 |
| Configurar el negocio desde cero (checklist) | 2 |
| Que los empleados fichen en la tablet | 3.1 |
| Registrar la venta del día (cierre de caja) | 3.2 |
| Anotar un gasto (luz, alquiler, quincena) | 3.3 |
| Registrar una factura de un proveedor | 3.4 |
| Pagar (abonar) a un proveedor | 3.5 |
| Ver cuánto debo y a quién | 4.1 |
| Decidir qué facturas pagar con el dinero que tengo | 4.5 |
| Imprimir un estado de cuenta para un proveedor | 4.6 |
| Ver las horas trabajadas y las horas extra | 4.8 |
| Saber cuánto debo de horas extra esta quincena | 4.11 |
| Adelantar horas extra a un empleado | 4.12 |
| Saber si el negocio está ganando | 5.1 |
| Corregir un gasto, un pago o un cierre mal tecleado | 6.1 |
| Registré una factura con monto equivocado | 6.2 |
| Un empleado fichó mal u olvidó marcar la salida | 6.3 |
| La tablet dice **Dispositivo no configurado** o no hay Internet | 6.4 |
| Olvidé mi contraseña / un usuario olvidó la suya | 6.5 |
| Crear una cuenta para un supervisor | 2.7 |
| Usar GestorPro en el celular | 7 |
| Ver qué puede hacer cada rol | Anexo A |

---

## 1. Bienvenida

### 1.1 Qué es GestorPro

GestorPro es la aplicación de administración de su negocio. Con ella usted lleva:

- **Finanzas**: gastos, proveedores, facturas de compra, pagos a proveedores, cuentas por pagar, el cierre de caja de cada turno, el dashboard de ganancias y el flujo de caja.
- **Asistencia**: la ficha de cada empleado, el fichaje de entrada y salida en un kiosco (tablet), las jornadas trabajadas, las horas extra y el adelanto de horas extra.
- **Auditoría**: un registro permanente de cada vez que alguien corrige o anula un movimiento de dinero.

Cada empresa tiene su propio espacio: sus datos nunca se mezclan con los de otra empresa.

### 1.2 Qué NO es GestorPro

- **No es un punto de venta.** No registra ventas producto por producto ni imprime tickets. Eso lo hace Firestec (su sistema de caja). En GestorPro solo se anota el **cierre de caja** de cada turno, con el total que reporta Firestec.
- **No maneja inventario.** No hay artículos, existencias ni precios.
- **No es una planilla.** No calcula ni paga salarios. Solo lleva un saldo de horas extra y permite adelantar parte de ese saldo.
- **No es su banco.** El flujo de caja muestra los movimientos que usted registró, no el saldo real de su cuenta bancaria.

### 1.3 Cómo entrar y requisitos

1. Abra el navegador y escriba **https://app.gestorpro.us**.
2. Escriba su correo y contraseña y pulse **Iniciar sesión**.

Si escribe `gestorpro.us` sin el `app.` delante, la página no responderá. Es normal: use siempre la dirección completa.

Requisitos:

- Un navegador moderno (Chrome, Edge, Safari o Firefox) en computadora, tablet o celular.
- Conexión a Internet. **Sin Internet la aplicación no funciona**; no hay modo sin conexión.
- Para el fichaje de empleados se recomienda una tablet dedicada en cada local (ver 2.6).
- Está en preparación una aplicación para Android (un envoltorio de la misma web). Todavía no se distribuye a clientes; use el navegador (ver capítulo 7).

### 1.4 Idiomas

La interfaz está disponible en **Español**, **English** y **中文**. Puede cambiar el idioma en la pantalla de inicio de sesión (desplegable sobre el formulario) o desde el menú lateral (solo en pantallas anchas; en el celular no se ve). El desplegable no tiene rótulo: muestra directamente **Español** / **English** / **中文**. El cambio es inmediato y se recuerda en ese navegador.

Se traduce solo la interfaz: los nombres que usted escribe (categorías, proveedores, empleados) y los mensajes de error del servidor siempre aparecen en español.

### 1.5 Roles

Cada cuenta tiene uno de tres roles: **Administrador** (todo), **Supervisor** (opera y corrige dinero, gestiona empleados y proveedores, revisa fichajes y aprueba adelantos; no gestiona usuarios, sedes ni kioscos, ni ve QR y PIN) y **Empleado** (solo consulta, más solicitar adelantos de horas extra). La matriz completa está en el Anexo A.

Recuerde: ver un botón o un enlace no garantiza que pueda usarlo; el servidor comprueba el permiso en cada acción. Si intenta algo fuera de su rol verá **No tiene permiso para esta operación.**

> **Aviso importante sobre el rol Empleado.** Una cuenta con rol **Empleado** "solo consulta", pero consulta **todas las finanzas**: Dashboard, gastos, pagos, proveedores, deudas y jornadas de todo el mundo. No es un rol inofensivo para una cajera. Las cajeras normalmente **no necesitan cuenta**: fichan en el kiosco con su número de empleado. Cree cuentas de rol Empleado solo para personas que deban ver esa información.

### 1.6 Reglas que se repiten en todo el sistema

> **En GestorPro nada se borra.** Categorías, proveedores, empleados, sedes, kioscos y cuentas de usuario se **desactivan**, nunca se borran; sus datos históricos se conservan. Los movimientos de dinero (gastos, pagos, facturas, cierres de caja) y los fichajes son **inmutables**: no se editan ni se borran. Un gasto, pago o cierre equivocado se **corrige una sola vez** con un *reverso* (una anotación automática que anula el original) y, si corresponde, una *corrección* con el monto correcto. Todo queda en la **Auditoría financiera**. Detalle en 6.1.

> **Contado vs. crédito.** Una factura de **contado** ya está pagada y no genera deuda: no aparece en Cuentas por pagar, Antigüedad, Planificador ni Estado de cuenta; se ve en **Todas las facturas**. Una factura a **crédito** genera deuda y aparece en todas las pantallas de deuda. Detalle en 3.4.

### 1.7 Orientarse: menú y mapa de pantallas

**En computadora** hay una barra oscura fija a la izquierda. Arriba, el logo **GP GestorPro** (pulsarlo lleva al inicio). Luego dos grupos de enlaces (**Principal** y **Gestión**) y, abajo, el área de cuenta: nombre de la empresa, su nombre, su rol (**Empleado** / **Supervisor** / **Administrador**), un desplegable de idioma sin rótulo, **Cambiar contraseña** y **Cerrar sesión**. Si su cuenta pertenece a más de una empresa, en lugar del nombre fijo verá un desplegable (sin rótulo) con el nombre de la empresa activa; al elegir otra, la aplicación lo lleva al inicio bajo esa empresa (su rol puede ser distinto en cada una) y el cambio afecta a todas sus pestañas y dispositivos. Si ve **No tienes acceso a esa empresa.**, esa empresa fue suspendida o le retiraron el acceso.

**En el celular** (pantalla estrecha) la barra se reduce a una columna de iconos. Mantenga pulsado un icono para ver su nombre. No se muestran el nombre de la empresa, su nombre ni el rol, y no se puede cambiar de idioma ni de empresa desde ahí (cambie el idioma desde la pantalla de inicio de sesión).

**Mapa de pantallas**

| Grupo | Pantalla (menú) | Icono | Para qué sirve | Sección |
|---|---|---|---|---|
| Principal | **Dashboard** | barras | Ganancia, cierres de caja | 3.2, 5.1 |
| Principal | **Flujo de caja** | tendencia | Entradas y salidas registradas | 5.2 |
| Principal | **Cuentas por pagar** | recibo | Facturas a crédito y abonos | 3.4, 3.5, 4.1 |
| Principal | **Historial de pagos** | reloj | Pagos hechos y sus correcciones | 4.3 |
| Principal | **Antigüedad de cuentas** | gráfico circular | Edad de la deuda por proveedor | 4.4 |
| Principal | **Planificador de pagos** | billetera | Propuesta de pagos con presupuesto | 4.5 |
| Principal | **Estado de cuenta de proveedor** | documento | Conciliación con un proveedor | 4.6 |
| Principal | **Todas las facturas** | pila de documentos | Facturas de contado y crédito | 4.2 |
| Principal | **Gastos** | tarjeta | Registrar y consultar gastos | 3.3 |
| Principal | **Empleados** | personas | Fichas, roles operativos, QR, PIN | 2.5 |
| Principal | **Cola de revisión** | portapapeles | Validar fichajes de excepción | 3.6 |
| Principal | **Jornadas** | calendario | Horas trabajadas y extra | 4.8 |
| Principal | **Cobros** | billete | Adelanto de horas extra | 4.12 |
| Principal | **Kiosco** | monitor | Pantalla de fichaje (tablet) | 3.1 |
| Gestión | **Proveedores** | camión | Catálogo de proveedores | 2.4 |
| Gestión | **Categorías de gasto** | etiquetas | Catálogo de categorías | 2.3 |
| Gestión | **Auditoría financiera** | pergamino | Correcciones y anulaciones | 5.3 |
| Gestión | **Sedes** | pin | Locales o sucursales | 2.2 |
| Gestión | **Kioscos** | monitor | Tablets de fichaje y su token | 2.6 |
| Gestión | **Usuarios** | persona con engranaje | Cuentas de acceso | 2.7 |

**Qué ve cada rol al entrar.** Todos aterrizan en la página de inicio, con **Bienvenido, {su nombre}**, **Sesión activa como Administrador / Supervisor / Empleado** y, debajo, su correo electrónico. Hay tres tarjetas de atajos:

- **Finanzas** — "Cuentas por pagar, gastos y dashboard de ganancias." Enlaces **Cuentas por pagar →**, **Gastos →**, **Dashboard →**.
- **Administración** — "Sedes, empleados (con sus roles operativos) y kioscos." Enlaces **Sedes →**, **Empleados →** (solo Administrador y Supervisor), **Kioscos →**, **Usuarios →** (solo Administrador).
- **Asistencia** — "Fichaje, jornadas y cobro anticipado de horas extra." Enlaces **Cola de revisión →** (solo Administrador y Supervisor), **Jornadas →**, **Cobros →**, **Kiosco →**.

| Rol | En el menú NO ve |
|---|---|
| Empleado | Flujo de caja, Planificador de pagos, Empleados, Cola de revisión, Categorías de gasto, Auditoría financiera, Usuarios. |
| Supervisor | Usuarios. |
| Administrador | Ve todo. |

Si escribe a mano la dirección de una pantalla que no le corresponde, la aplicación lo devolverá al inicio o mostrará un mensaje como **No tienes acceso al flujo de caja.**, **No tienes acceso al planificador de pagos.** o **No tiene permiso para esta operación.** Si escribe una dirección que no existe, verá una página de error en inglés sin menú: use el botón "Atrás" del navegador o escriba **https://app.gestorpro.us**.

---

## 2. Puesta en marcha (configuración inicial)

Si su empresa es nueva, siga este orden. Cada paso remite a su sección.

| Paso | Qué hacer | Quién | Sección |
|---|---|---|---|
| 1 | Entrar con la contraseña temporal y cambiarla | Administrador | 2.1 |
| 2 | Crear las **sedes** (locales) | Administrador | 2.2 |
| 3 | Revisar las **categorías de gasto** (vienen cuatro por defecto) | Administrador / Supervisor | 2.3 |
| 4 | Registrar los **proveedores** habituales | Administrador / Supervisor | 2.4 |
| 5 | Dar de alta a los **empleados** con sus roles operativos (**Cajera**, **Verificador**) y su PIN | Administrador / Supervisor | 2.5 |
| 6 | Registrar un **kiosco** por local y configurar la tablet con el token | Administrador | 2.6 |
| 7 | Crear las **cuentas de usuario** de supervisores y, muy recomendable, un **segundo administrador** | Administrador | 2.7 |

> **Recomendación:** tenga siempre **dos administradores activos**. Si el único administrador olvida su contraseña o se desactiva, recuperar el acceso requiere al soporte del proveedor (6.6).

### 2.1 Su primer ingreso: cambio obligatorio de contraseña

Roles: todos.

La contraseña que le entregó el administrador es **temporal**. La primera vez que entre, la aplicación no le dejará ver ninguna pantalla hasta que la reemplace por una suya.

1. Abra **https://app.gestorpro.us**. Verá la tarjeta con el logo **GP**, el título **GestorPro** y el subtítulo **Administración empresarial**. Si lo desea, elija el idioma en el desplegable que está sobre el formulario.
2. Escriba su **Correo electrónico** y su **Contraseña** y pulse **Iniciar sesión** (o la tecla Enter). Mientras entra, el botón muestra **Entrando…**.
3. Aparece el diálogo **Cambiar contraseña** a pantalla completa con el aviso **Tu contraseña es temporal. Debes cambiarla para continuar.**
4. Escriba en **Contraseña actual** la contraseña temporal que le dieron.
5. Escriba su **Nueva contraseña** (**Mínimo 8 caracteres.**) y repítala en **Confirmar nueva contraseña**.
6. Pulse **Cambiar contraseña**.
7. Verá **Contraseña actualizada** y el texto **Por seguridad cerramos todas tus sesiones. Vuelve a iniciar sesión con tu nueva contraseña.** Pulse **Ir a iniciar sesión** y entre con la contraseña nueva.

**Qué verá al terminar:** la página de inicio (ver 1.7). Si había abierto un enlace concreto antes de entrar, la aplicación lo lleva directamente a ese enlace.

**Errores frecuentes al iniciar sesión:**

| Mensaje | Qué significa y qué hacer |
|---|---|
| **El correo electrónico es obligatorio.** / **La contraseña es obligatoria.** | Dejó un campo vacío. |
| **Credenciales inválidas.** | El correo o la contraseña están mal, **o** su cuenta fue desactivada, **o** su empresa fue suspendida. El mensaje es el mismo a propósito. Si está seguro de su contraseña, contacte al administrador. |
| **Rate limit exceeded, retry in 1 minute** (en inglés) | Hubo más de 10 intentos de inicio de sesión (correctos o fallidos) en un minuto desde su conexión. Espere un minuto y vuelva a intentar. |
| **Error al iniciar sesión. Intenta de nuevo.** | Falló la conexión. Revise su Internet. |

**Errores frecuentes al cambiar la contraseña:**

- **Ingresa tu contraseña actual.** — dejó vacío el primer campo.
- **La nueva contraseña debe tener al menos 8 caracteres.**
- **La nueva contraseña debe ser distinta de la actual.**
- **Las contraseñas no coinciden.** — la confirmación no es igual.
- **Credenciales inválidas.** — la contraseña temporal que escribió no es la correcta. Pídala de nuevo al administrador.
- **Demasiados intentos. Espera un momento e inténtalo de nuevo.**

**Tenga en cuenta:**

- Este diálogo no tiene botón de cancelar ni de cerrar. Si cierra el navegador sin completar el cambio, la contraseña temporal sigue vigente y el diálogo volverá a aparecer.
- No existe "olvidé mi contraseña" ni registro por cuenta propia. Por eso el pie del formulario dice: **Solo personal autorizado. Contacta al administrador para obtener acceso.** El flujo completo está en 6.5.
- Si el correo tiene espacios al inicio o al final, se ignoran. La contraseña se toma tal cual.

### 2.2 Sedes

Roles: solo Administrador (Supervisor y Empleado ven la lista y los botones, pero al pulsar recibirán **No tiene permiso para esta operación.**).

Una sede es cada local o sucursal. Empleados, kioscos, gastos y facturas pertenecen a una sede.

1. Menú **Gestión → Sedes**.
2. Pulse **+ Registrar sede**. Se abre **Nueva sede**.
3. Escriba el **Nombre** (obligatorio).
4. Elija el **Modo de excepción**: **PIN** (por defecto), **Supervisor** o **PIN o supervisor**. Define qué le pedirá el kiosco a un empleado cuando falle la verificación normal: su PIN, la autorización de un supervisor con su correo y contraseña, o cualquiera de los dos.
5. Pulse **Crear sede**.

**Editar** (**Guardar cambios**) y **Desactivar** / **Activar** funcionan como en Empleados (2.5). Una sede inactiva desaparece de los desplegables, pero sus datos se conservan.

**Tenga en cuenta:** si elige **Supervisor**, el PIN no sirve en esa sede (**Esta sede no permite excepción por PIN.**); si elige **PIN**, un supervisor no podrá autorizar (**Esta sede no permite excepción por supervisor.**). Para un local sin supervisor presente, use **PIN** o **PIN o supervisor**.

### 2.3 Categorías de gasto

Roles: Administrador, Supervisor.

Las categorías son la lista con la que se clasifican los gastos. Cada empresa tiene su propio catálogo; al crear la empresa vienen cuatro: **Servicios públicos**, **Alquiler**, **Mantenimiento** y **Pago a empleado** (esta última marcada como categoría de pago a empleado).

**Crear una categoría:**

1. Menú **Gestión → Categorías de gasto**.
2. Pulse **Nueva categoría**.
3. Escriba el **Nombre** (ejemplo del campo: "Ej. Publicidad, Combustible…").
4. Marque **Es categoría de pago a empleado** si los gastos de esta categoría deben indicar a qué empleado se le pagó (quincenas, adelantos, liquidaciones).
5. Pulse **Crear categoría**.

**Editar:** pulse **Editar** en la fila, cambie el nombre y/o la casilla de pago a empleado, y pulse **Guardar cambios**. (La ayuda en pantalla junto a la casilla dice **No se puede cambiar después.**, pero el sistema sí acepta el cambio al editar; ese texto está desactualizado.)

**Dar de baja:** pulse **Desactivar**. La categoría deja de aparecer al registrar gastos, pero los gastos antiguos la siguen mostrando. Para recuperarla, marque **Mostrar inactivas** y pulse **Reactivar**.

**Errores frecuentes:**

- **Ya existe una categoría activa con ese nombre en esta empresa.** — use otro nombre o reactive la existente. Si el nombre coincidía con una categoría inactiva, el sistema la reactiva y avisa **Categoría reactivada.**
- **Ya existe una categoría con ese nombre en esta empresa.** — al editar o reactivar, el nombre choca con otra categoría.
- **Debe quedar al menos una categoría de "pago a empleado" activa: la necesita el cobro de horas extra. Crea o activa otra antes de desactivar esta.** — los adelantos de horas extra crean gastos en esa categoría (4.12).
- **No hay cambios que aplicar.** — guardó sin cambiar nada.

### 2.4 Proveedores

Roles: Administrador, Supervisor. (Los empleados ven la lista y los botones, pero al pulsar recibirán **No tiene permiso para esta operación.**)

**Registrar:**

1. Menú **Gestión → Proveedores**.
2. Pulse **+ Registrar proveedor**.
3. Escriba el **Nombre** (obligatorio). Opcionalmente **Identificación fiscal** (el RUC o NIT: número de registro fiscal del proveedor), **Teléfono** y **Persona de contacto**.
4. Pulse **Crear proveedor**.

**Qué verá al terminar:** el proveedor en la tabla con **Nombre**, **RUC / Identificación**, **Teléfono**, **Persona de contacto**, **Deuda total** y **Estado** (**Activo** / **Inactivo**). **Deuda total** es lo que falta por pagar de sus facturas a crédito; si es mayor que cero se resalta.

**Editar / dar de baja:** **Editar** → cambie los datos → **Guardar cambios** (si vacía un campo opcional, se borra). **Desactivar**: el proveedor deja de aparecer al registrar facturas nuevas, pero sus facturas, pagos y estado de cuenta se conservan; **Activar** lo recupera.

**Tenga en cuenta:**

- El sistema no impide registrar dos proveedores con el mismo nombre: revise la lista antes de crear uno nuevo.
- También puede crear un proveedor directamente desde el formulario de factura con el botón **+ Nuevo** (3.4).

### 2.5 Empleados (ficha, roles operativos, PIN y QR)

**Usuario vs. empleado.** Son dos cosas distintas:

- Un **usuario** es una cuenta con correo y contraseña que **entra a GestorPro** (se gestiona en **Usuarios**, 2.7).
- Un **empleado** es la ficha de un trabajador que **ficha en el kiosco** con su número o PIN (se gestiona en **Empleados**). Un empleado **no necesita cuenta** para fichar.

Los **roles operativos** de la ficha (**Cajera**, **Verificador**; vienen creados con la empresa) describen funciones en la tienda y no dan permisos en el sistema. Son los que hacen que el empleado aparezca en los desplegables al registrar un cierre de caja (3.2).

**Dar de alta a un empleado.** Roles: Administrador, Supervisor.

1. Menú **Principal → Empleados**.
2. Pulse **+ Registrar empleado**. Se abre **Nuevo empleado**.
3. Escriba el **Número** (obligatorio; ejemplo del campo: "Ej. E001"; único en la empresa). Es el número con el que fichará.
4. Escriba el **Nombre** (obligatorio).
5. Elija la **Sede** (obligatorio).
6. Escriba el **Salario fijo (B/.)** (obligatorio): es el salario **mensual**; se usa para valorar la hora extra (4.9).
7. Escriba el **PIN (4 dígitos)** (obligatorio). Ayuda: **Evita secuencias (1234) y repeticiones (0000).**
8. El campo **Foto de referencia** aparece deshabilitado con el texto **Reconocimiento facial — pendiente**: hoy no se sube foto.
9. Marque los **Roles operativos** que apliquen (**Cajera**, **Verificador**).
10. Pulse **Crear empleado**.

**Qué verá al terminar:** el empleado en la tabla (**Número**, **Nombre**, **Sede**, **Roles**, **Salario**, **Estado**). Si usted es Administrador y la lista se recargó correctamente, se abre automáticamente el QR del empleado para imprimirlo; si la recarga falló, verá **El empleado se creó correctamente. Su fila aparecerá al recargar la lista; el QR está en su botón "QR".**

**Errores frecuentes:**

- **Ya existe un empleado con ese número.**
- **Número, nombre y sede son obligatorios.**
- **El salario debe ser un número igual o mayor a cero.**
- **El PIN debe ser de 4 dígitos.**
- **El PIN es demasiado predecible: evita repeticiones (0000) y secuencias (1234, 4321).**

**Editar, desactivar o reactivar.** Roles: Administrador, Supervisor. **Editar**: mismos campos, sin el PIN (sirve, por ejemplo, para cambiar el nombre o la sede); pulse **Guardar cambios**. **Desactivar**: un clic, sin confirmación. El empleado inactivo **no puede fichar** (**Empleado no encontrado o inactivo.**) y desaparece de los desplegables de cierre de caja y cobros; su historial se conserva. **Activar** lo recupera.

**Ver, imprimir o regenerar el QR.** Roles: solo Administrador.

1. Pulse **QR** al final de la fila. Se abre **QR de {nombre}** con la imagen y el texto del código debajo.
2. **Imprimir** abre una ventana nueva con nombre, QR y código y lanza la impresión (permita ventanas emergentes).
3. **Regenerar QR** crea un código nuevo. Aviso: **Regenerar invalida el QR anterior al instante.**

**Importante:** hoy el kiosco identifica al empleado **solo por su número** (por ejemplo `E001`). El QR impreso sirve como tarjeta de identificación del empleado, pero pasarlo por un lector en el kiosco **no funciona todavía** (el kiosco lo interpreta como número y responde **Empleado no encontrado o inactivo.**). La lectura del QR quedará para una versión futura.

**Restablecer el PIN.** Roles: solo Administrador.

1. Pulse **Reset PIN** al final de la fila. Se abre **Resetear PIN — {nombre}**.
2. Escriba el **Nuevo PIN (4 dígitos)** y pulse **Guardar PIN**. El diálogo se cierra sin mensaje: el PIN ya cambió.

El PIN actual nunca se puede ver; solo se reemplaza.

### 2.6 Kioscos y configuración de la tablet

Roles: solo Administrador.

Un kiosco es la tablet o computadora compartida donde los empleados fichan. Cada kiosco pertenece a una sede y tiene un **token** (una clave secreta larga) que autoriza a ese aparato a enviar fichajes.

**Paso A — Registrar el kiosco:**

1. Menú **Gestión → Kioscos**.
2. Pulse **+ Registrar kiosco**, escriba el **Nombre** (obligatorio), elija la **Sede** (obligatorio) y pulse **Crear kiosco**.
3. Aparece la tarjeta **Token del kiosco «{nombre}»** con el texto **Cópielo y configúrelo en el dispositivo (pantalla del kiosco). Por seguridad, solo se muestra una vez.** Copie el token ahora y luego pulse **Cerrar**.

**Paso B — Configurar la tablet:**

1. En la tablet, abra **https://app.gestorpro.us/kiosco**. No hace falta iniciar sesión.
2. En el panel rojo **Dispositivo no configurado** pegue el token y pulse **Guardar**.
3. El panel pasa a verde **Dispositivo autorizado**. La tablet queda lista.

**Tenga en cuenta:**

- El token se guarda en el navegador de la tablet. Si se borran los datos del navegador (o se cambia de navegador o de tablet), el token se pierde y hay que volver a configurar.
- Si el token se pierde, pulse **Regenerar token** en la lista de kioscos (el botón se bloquea mientras otra regeneración está en curso) y vuelva a configurar la tablet; el token anterior deja de funcionar al instante. En el kiosco, el botón **Reconfigurar** abre la pantalla **Reconfigurar token del dispositivo** con **Guardar** y **Cancelar**.
- Desde la aplicación no se puede editar, desactivar ni borrar un kiosco.
- Sin token válido, cualquier fichaje devuelve **Kiosco no autorizado.**

### 2.7 Usuarios (cuentas de acceso)

Roles: solo Administrador.

**Crear una cuenta:**

1. Menú **Gestión → Usuarios**. Subtítulo: **Cuentas de acceso: alta y restablecimiento de contraseña**.
2. Pulse **+ Crear usuario**. Se abre **Nuevo usuario**.
3. Escriba **Nombre**, **Correo electrónico** y **Contraseña temporal** (los tres obligatorios; **Mínimo 8 caracteres. El usuario deberá cambiarla en su primer ingreso.**).
4. Elija el **Rol** (obligatorio): **Administrador**, **Supervisor** o **Empleado** (por defecto Empleado). Lea el aviso de 1.5 antes de crear cuentas de rol Empleado.
5. Pulse **Crear usuario**.

**Qué verá al terminar:** la tarjeta **Usuario creado** con **Comunica la contraseña temporal al usuario: deberá cambiarla en su primer ingreso.** y el botón **Crear otro usuario**. En la tabla (columnas **Nombre**, **Correo**, **Rol**, **Estado**, **Contraseña**, **Creado**, **Acciones**), la columna **Contraseña** mostrará **Temporal pendiente** hasta que la persona la cambie.

**Errores frecuentes:**

- **Nombre, correo y contraseña son obligatorios.** / **El correo electrónico no es válido.** / **La contraseña temporal debe tener al menos 8 caracteres.**
- **El email ya está en uso.** — ese correo ya tiene cuenta en GestorPro (en cualquier empresa). Use otro correo o pida al soporte del proveedor que dé acceso a esa cuenta a su empresa.

**Tenga en cuenta:** anote la contraseña temporal antes de pulsar **Crear usuario**: no se vuelve a mostrar. Entréguela en persona, nunca la deje escrita en un lugar visible.

**Cambiar el rol:** en la columna **Rol** de la fila, elija el nuevo rol en el desplegable. Se guarda al instante, sin confirmación. Su propia fila no se puede cambiar (**No puedes cambiar tu propio rol.**): pídalo a otro administrador.

**Restablecer la contraseña de alguien:** ver 6.5.

**Desactivar o reactivar:** pulse **Desactivar** (rojo) o **Reactivar**. Es inmediato. Desactivar cierra todas sus sesiones y el sistema rechaza su ingreso (la persona verá **Credenciales inválidas.**). Reactivar no cambia la contraseña. No puede desactivar su propia cuenta.

Las cuentas no se borran ni se les cambia el nombre o el correo: si alguien deja la empresa, desactívela. No deje la empresa sin ningún administrador activo. Si un usuario pertenece a más de una empresa, verá **La cuenta pertenece a más de una empresa: su contraseña se gestiona desde la plataforma.** o **…su estado se gestiona desde la plataforma.**: esas operaciones las hace el soporte del proveedor.

---

## 3. Cada día

**Rutina diaria (para imprimir):**

- **Al abrir:** encender la tablet, comprobar que muestra **Dispositivo autorizado** y que el **Kiosco** está seleccionado; cada empleado marca **Entrada**.
- **Durante el día:** registrar cada gasto en el momento (3.3); registrar las facturas que lleguen (3.4); **abonar a un proveedor el mismo día que se le paga** (3.5), porque el abono siempre queda con la fecha de hoy.
- **Al cerrar cada turno:** la cajera cuenta la caja; el verificador registra el cierre en el Dashboard (3.2) y lo compara con Firestec.
- **Al final del día:** el supervisor revisa la **Cola de revisión** (3.6) y las solicitudes **Pendientes** de Cobros (4.12).

### 3.1 Fichaje del empleado (paso a paso en la tablet)

Roles: cualquier empleado activo; no requiere cuenta. Este apartado está pensado para pegarlo junto a la tablet.

La pantalla se titula **GestorPro — Kiosco de fichaje** y tiene su propio selector de idioma. (Si en esa tablet hay una sesión abierta, el logo **GP** vuelve a la aplicación.)

**Cómo marcar entrada, comida o salida:**

1. En la pantalla **Bienvenido** ("Seleccione el kiosco y el tipo de fichaje para comenzar."), elija el **Kiosco** de esta tablet la primera vez tras abrir la página (el selector empieza en **— Seleccione un kiosco —** y queda seleccionado para los siguientes empleados hasta que se recargue la página). Toque el **Tipo de fichaje**: **Entrada**, **Salida comida**, **Vuelta de comida** o **Salida**. Toque **Continuar**.
2. En **Identificación** ("Teclee su número de empleado o pase su tarjeta QR."), escriba su **número de empleado** (por ejemplo `E001`) y toque **Continuar** o Enter. Hoy solo funciona el número; la tarjeta QR aún no se lee (ver 2.5).
3. En **Verificación facial** verá **Modo simulación — sin cámara real** y **Resultado de la verificación:** con tres opciones: **Coincide — facial aprobado** (marcada por defecto), **No coincide — facial rechazado** y **Sin vida — falla liveness**. Por ahora la tablet no tiene cámara activa: **deje marcada la opción por defecto** y toque **Registrar fichaje**. Las otras dos opciones simulan un fallo y solo sirven para pruebas o para forzar el fichaje de excepción.
4. Si el resultado fue de fallo, aparece **Verificación fallida** con el aviso **Este fichaje quedará marcado para revisión del jefe.** Lo que se pide depende del modo de excepción de la sede (2.2):
   - Modo **PIN**: escriba su **PIN personal del empleado:**.
   - Modo **Supervisor**: un supervisor escribe su **Correo del supervisor:** y **Contraseña del supervisor:**.
   - Modo **PIN o supervisor**: aparecen las pestañas **PIN personal** (campo **Su PIN personal:**) y **Supervisor**.
   Toque **Confirmar fichaje**. **Cancelar** vuelve a la pantalla de verificación.
5. En la pantalla final verá **Fichaje registrado** y **Fichaje de {tipo} registrado correctamente.** Tras 5 segundos (**Próximo empleado en {n}s…**) vuelve al inicio, o toque **Siguiente empleado**.

Puede aparecer la marca **Fichaje de excepción — pendiente de revisión** (el jefe lo validará) o **Alerta a RRHH: verificar foto de referencia** (tres o más excepciones en siete días).

**Orden correcto de un día:** **Entrada** → **Salida comida** → **Vuelta de comida** → **Salida**. La jornada se calcula en el momento de marcar **Salida**.

**Errores frecuentes en el kiosco:**

| Mensaje | Qué hacer |
|---|---|
| **Empleado no encontrado o inactivo.** | El número está mal o el empleado fue desactivado. Escriba el número (no el código del QR). |
| **PIN incorrecto.** | Reintente. Si lo olvidó, el administrador lo restablece en **Empleados → Reset PIN**. |
| **Esta sede no permite excepción por PIN.** / **Esta sede no permite excepción por supervisor.** | La sede tiene otro modo de excepción configurado (2.2). |
| **Autorización de supervisor inválida.** | El correo/contraseña no es de un supervisor o administrador activo de esta empresa (o tiene contraseña temporal pendiente). |
| **Credencial inválida. Intente nuevamente.** | Mensaje genérico de PIN o autorización rechazados. Reintente. |
| **Kiosco no autorizado.** | La tablet no tiene token válido, o se eligió en el selector un kiosco que no corresponde al token de esta tablet (el selector muestra kioscos de otras empresas también). Elija el kiosco correcto o avise al administrador. |
| **Kiosco no encontrado o inactivo.** | El kiosco elegido ya no existe o está inactivo. |
| **Error de red. Intente nuevamente.** | Revise la conexión de la tablet (ver 6.4). |

**Para el jefe — tenga en cuenta:** mientras la verificación facial sea simulada, nada impide que un empleado marque por otro si conoce su número; solo el PIN de excepción lo frena cuando la verificación falla. Si le preocupa, pida al proveedor activar la **revisión total** (todos los fichajes entran en la Cola de revisión, 3.6).

Si un empleado se equivoca al fichar, ver 6.3.

### 3.2 Registrar el cierre de caja de un turno (ventas diarias)

Roles: Administrador, Supervisor.

GestorPro no registra ventas una por una. Al final de cada turno se anota **un cierre de caja** por cajera: cuánto había en efectivo, tarjeta, Yappy y lotería según el arqueo (el conteo del dinero de la caja), y el total debe cuadrar con lo que reporta Firestec. Ese cierre es la "venta diaria" que alimenta el Dashboard.

Regla: **una cajera cierra una sola vez por turno, día y sede**. Si se equivocó, el cierre se corrige (una única vez, 6.1); no se registra otro.

**Términos del arqueo:**

- **Yappy**: pagos recibidos por transferencia móvil (Banco General).
- **Lotería**: premios de lotería pagados a clientes con dinero del cajón. Los billetes premiados quedan en el cajón en lugar del efectivo y **suman al total del cierre** (por eso la pantalla recuerda **La lotería son premios pagados que están en el cajón.**); así el arqueo cuadra con lo que Firestec reporta como vendido.

**Antes de empezar:** los empleados que cierran caja deben tener el rol operativo **Cajera**, y quien verifica el rol **Verificador**, asignados en **Empleados** (2.5). Si no, no aparecerán en los desplegables.

**Sobre Turno y Cerrado por (práctica recomendada):** si un local tiene una sola cajera todo el día, use el turno **Mañana** de forma consistente (el turno es solo una etiqueta para separar cierres del mismo día). **Cerrado por** es quien cuenta y verifica la caja; conviene que sea una persona distinta de la cajera (control interno), aunque el sistema permite que sea la misma.

1. Menú **Principal → Dashboard**.
2. Pulse **+ Registrar cierre del día**. Se abre **Registrar cierre de caja** con la nota **Ingrese el arqueo de la caja al cerrar según Firestec. El total debe cuadrar con el total que reporta Firestec.**
3. Elija la **Sede** (obligatorio).
4. Elija el **Turno** (obligatorio): **Mañana**, **Tarde** o **Noche**.
5. Elija la **Cajera** (obligatorio; formato `E001 - Nombre`; primero las de esa sede, luego las de otras con el sufijo " (otra sede)").
6. Revise la **Fecha del cierre** (obligatorio).
7. Elija **Cerrado por** (obligatorio; el verificador). Si su empresa no tiene ningún empleado con rol Verificador, aparece **Usuario actual: {su nombre}** preseleccionado.
8. Opcional: **Hora de apertura** y **Hora de cierre**.
9. En **Arqueo de la caja** escriba **Efectivo (B/.)**, **Tarjeta (B/.)**, **Yappy (B/.)** y **Lotería (B/.)**. Debajo se calcula en vivo **Total del cierre**.
10. Compare el **Total del cierre** con el total de Firestec y pulse **Registrar cierre** (Enter no envía; hay que pulsar el botón).

**Qué verá al terminar:** el aviso **Cierre del {fecha} registrado por B/. {total}.** (con una marca ✓; se oculta solo a los 6 segundos o con ✕), la fila nueva resaltada en **Cierres de ventas del período** y las tarjetas del Dashboard recalculadas.

**Ejemplo:** turno Mañana, cajera E003 - Ana. Efectivo 320.00, Tarjeta 150.50, Yappy 80.00, Lotería 12.00 → **Total del cierre** B/. 562.50. Si Firestec reporta B/. 562.50, registre.

**Si el arqueo no cuadra con Firestec:**

1. Vuelva a contar el efectivo y revise los comprobantes de tarjeta y Yappy y los billetes de lotería.
2. Registre el arqueo **real** (lo que hay en la caja), no el número de Firestec: el cierre debe reflejar el dinero que existe.
3. El formulario **no tiene campo de observaciones**. Documente la diferencia fuera de GestorPro (cuaderno de caja, mensaje al dueño). Si el faltante se asume como pérdida, puede registrarlo como gasto en una categoría creada para ello (por ejemplo "Faltante de caja") con la diferencia en la **Descripción**.

**Errores frecuentes:**

- **Seleccione el turno del cierre.**
- **Ingrese al menos un monto del arqueo de la caja.**
- **El monto de Efectivo debe ser un número igual o mayor a cero.** (y lo mismo para Tarjeta, Yappy, Lotería).
- **Ya existe el cierre de esa cajera y turno para la fecha; use una corrección para ajustarlo.** — ese cierre ya está registrado. Corríjalo desde la lista (6.1); no intente registrarlo de nuevo.
- **No hay empleados con rol Cajera. Asígnalo en Empleados.** — asigne el rol operativo en la ficha del empleado.
- Advertencia (no bloquea): **La cajera y quien verifica son la misma persona ({nombre}). Está permitido, pero revisa el control interno.**

**Tenga en cuenta:** la cajera y el verificador se guardan como texto fijo ("E001 - Nombre"); si más adelante cambia el nombre del empleado, el cierre antiguo no cambia.

**Ver los cierres del período.** Roles: todos. En el Dashboard, bajo las tarjetas, está la lista **Cierres de ventas del período**, con **Fecha**, **Sede**, **Turno**, **Cajera**, **Cerrado por**, **Total / arqueo** (con el desglose por método) y **Estado** (**Vigente** / **Corregido** / **Anulado**). Use los filtros de arriba (**Desde**, **Hasta**, **Sede**, **Turno**, **Cajera**).

### 3.3 Gastos

Un gasto es cualquier salida de dinero que **no** es el pago de una factura de proveedor: luz, agua, alquiler, combustible, publicidad, un pago a un empleado (quincena, adelanto de salario, liquidación), etc. Los pagos a proveedores se registran en **Cuentas por pagar** (3.5), no aquí. Un gasto registrado no se edita ni se borra; se corrige (6.1).

**Registrar un gasto.** Roles: Administrador, Supervisor.

1. Menú **Principal → Gastos**.
2. Pulse **+ Registrar gasto**. Se abre la tarjeta **Registrar gasto**.
3. Elija la **Categoría** (obligatorio; solo aparecen las categorías activas). Si no existe la que necesita, use el enlace **+ Nueva categoría** bajo el desplegable: escriba el nombre en la casilla (ejemplo: "Ej. Publicidad, Combustible…"), marque **Pago a empleado** si aplica y pulse **Crear categoría**. La nueva categoría queda seleccionada.
4. Elija la **Sede** (obligatorio).
5. Escriba el **Monto (B/.)** (obligatorio; por ejemplo `45.50`).
6. Revise la **Fecha de operación** (obligatorio; viene con la fecha de hoy y puede cambiarla: sí se pueden registrar gastos de días anteriores).
7. Opcional: **Descripción (opcional)**, por ejemplo "Recibo de luz de julio".
8. Si la categoría es de **pago a empleado**, aparece el bloque **Datos del empleado**: escriba el **ID del empleado** (obligatorio; ejemplo del campo: "UUID o identificador del empleado") y elija el **Tipo de pago** (**Sin especificar**, **Quincenal**, **Mensual**, **Semanal**, **Adelanto**, **Liquidación**, **Otro**).
9. Pulse **Registrar gasto**.

**Qué verá al terminar:** el mensaje **Gasto registrado correctamente.**, el formulario se cierra y el gasto aparece en la lista. El pie de la lista muestra **Total del período (N gastos):** con la suma.

**Sobre el campo ID del empleado (léalo antes de usar categorías de pago a empleado):**

- El campo pide el identificador técnico del empleado (una cadena larga de letras y números), **no** su número corto tipo "E001", y no es un desplegable.
- Ese identificador **no se muestra en ninguna pantalla** de GestorPro. Pídalo al equipo técnico de su proveedor y guárdelo en una lista junto a cada empleado.
- El sistema **no verifica** que el identificador corresponda a un empleado real: un error de tecleo se guarda tal cual, y en la lista de gastos la columna **Empleado** mostrará el texto crudo en lugar de "E001 - Nombre".
- Alternativa práctica mientras no tenga los identificadores: para adelantos de horas extra use **Cobros** (4.12), que crea el gasto solo; para quincenas o liquidaciones use una categoría **sin** la marca de pago a empleado (por ejemplo "Planilla") y anote el nombre del empleado en la **Descripción**.

**Errores frecuentes:**

- **El monto debe ser un número positivo.** / **El monto del gasto debe ser mayor que cero.**
- **La categoría de gasto indicada está inactiva.** — reactive la categoría en **Categorías de gasto** o elija otra.
- **La categoría es de pago a empleado: el empleadoId es obligatorio.** — falta el identificador del empleado.
- **No se pudieron cargar los datos. Recarga la página.** — falló la carga de sedes o categorías; recargue.

**Tenga en cuenta:** los adelantos de horas extra que se marcan como pagados en **Cobros** crean su gasto automáticamente (4.12); no los registre otra vez a mano.

**Consultar los gastos de un período.** Roles: todos.

1. Menú **Principal → Gastos**.
2. Ajuste **Desde** y **Hasta** (por defecto, desde el día 1 del mes hasta hoy). La lista se recarga sola; el botón **Filtrar** vuelve a consultar.

La lista muestra **Categoría**, **Descripción**, **Monto**, **Fecha**, **Empleado** (número y nombre, o el identificador si no se pudo resolver), **Tipo de pago** y **Estado** (**Vigente**, **Corregido** o **Anulado**). Si un gasto fue corregido, el monto original aparece tachado junto al monto vigente. Un gasto anulado suma cero en el total. Si "no aparece" un gasto, revise primero las fechas del filtro; si la lista queda vacía verá **No hay gastos registrados en el período seleccionado.**

**Corregir un gasto:** pulse **Corregir** al final de la fila y siga 6.1.

### 3.4 Registrar una factura de compra (contado o crédito)

Roles: Administrador, Supervisor.

**Contado vs. crédito: la diferencia que más confunde.** Al registrar una factura debe indicar el **Tipo de compra**:

| | **Crédito (cuenta por pagar)** | **Contado (pagada en el acto)** |
|---|---|---|
| ¿Genera deuda? | Sí. Queda un saldo pendiente. | No. Se pagó al recibirla. |
| ¿Pide fecha de vencimiento? | Sí, obligatoria. | No. |
| ¿Aparece en Cuentas por pagar, Antigüedad, Planificador y Estado de cuenta? | Sí. | **No.** Esas pantallas solo muestran deudas. |
| ¿Se le registran abonos? | Sí, hasta saldarla. | No. Si lo intenta: **Una compra de contado se paga en el acto y no admite abonos.** |
| ¿Dónde se ve después? | En todas las pantallas de deuda y en **Todas las facturas**. | **Solo en Todas las facturas** (con estado **Pagado**) y como monto en el Dashboard. |
| ¿Cuenta en el Dashboard? | En **Compras registradas** (fecha de factura); en **Pagos a proveedor** solo cuando se paga. | En **Compras registradas** y en **Pagos a proveedor** el día de la factura. |
| ¿Aparece en el Flujo de caja? | Cada abono, como salida. | No (no hay un pago registrado). |

**Ejemplo:** compra repuestos por B/. 500 y los paga en el momento. Regístrela como **Contado**. No la verá en **Cuentas por pagar** (no debe nada), pero sí en **Todas las facturas** con estado **Pagado**, y sí restará en la **Ganancia** del Dashboard. Si en cambio el proveedor le da 30 días, regístrela como **Crédito** con la fecha de vencimiento: aparecerá en **Cuentas por pagar** con saldo B/. 500 hasta que la abone.

**Pasos:**

1. Menú **Principal → Cuentas por pagar**.
2. Pulse **+ Registrar factura**. Se abre la tarjeta **Registrar factura**.
3. Elija el **Proveedor** (obligatorio; se muestra "Nombre — RUC"; solo proveedores activos). Si no existe, pulse **+ Nuevo**, complete **Nombre** (obligatorio) y los datos opcionales y pulse **Crear proveedor**: queda seleccionado.
4. Elija la **Sede** (obligatorio).
5. Escriba el **Número de factura** (obligatorio) tal como viene en el documento del proveedor (ejemplo del campo: "Ej. F-2024-001").
6. Escriba el **Monto total (B/.)** (obligatorio).
7. Elija el **Tipo de compra** (obligatorio): **Crédito (cuenta por pagar)** (por defecto) o **Contado (pagada en el acto)**.
8. Escriba la **Fecha de emisión** (obligatorio; viene vacía).
9. Si es a crédito, complete la **Fecha de vencimiento** (obligatorio; con contado este campo desaparece).
10. Pulse **Registrar factura**.

**Qué verá al terminar:** **Factura registrada correctamente.** Si era a crédito, aparece en la lista de **Cuentas por pagar** con estado **Por pagar**. **Si era de contado no aparecerá en esta lista**: búsquela en **Todas las facturas** (4.2).

**Errores frecuentes:**

- **El monto total debe ser un número positivo.**
- **Una compra a crédito requiere fecha de vencimiento.**
- **Ya existe la factura "F-001" para ese proveedor; use una corrección para ajustarla.** — cada número de factura es único por proveedor. Revise si ya la registró antes.
- **El proveedor o la sede indicados no existen.** — el proveedor o la sede fueron desactivados; recargue.

**Tenga en cuenta:** una factura **no se edita ni se borra** después de registrarla, y tampoco se puede cambiar de contado a crédito ni corregir su monto. Verifique número, monto y tipo antes de pulsar el botón. Si ya se equivocó, ver 6.2.

### 3.5 Registrar un abono (pago parcial o total) a un proveedor

Roles: Administrador, Supervisor.

**Regla: no hay sobrepago.** GestorPro **nunca permite pagar más de lo que se debe** de una factura, ni al registrar un abono ni al corregir uno. Si intenta abonar B/. 150 a una factura con saldo B/. 100 verá **El monto no puede exceder el saldo (B/. 100.00).** o, desde el servidor, **El pago (150.00) excede el saldo pendiente (100.00).** Esto protege contra errores de tecleo y pagos duplicados.

1. Menú **Principal → Cuentas por pagar**.
2. Localice la factura (use **Filtrar por estado:** si hace falta) y pulse **Abonar** al final de su fila. El botón solo existe si la factura no está **Pagado**.
3. Se abre el diálogo **Registrar abono** con **Proveedor:**, **Factura:**, **Total factura:**, **Ya pagado:** y **Saldo pendiente:**.
4. Escriba el **Monto del abono (B/.)** (obligatorio). Puede ser menor que el saldo (pago parcial) o igual al saldo (pago total).
5. Pulse **Registrar abono**.

**Qué verá al terminar:** el diálogo se cierra y la lista se actualiza: **Pagado** sube, **Saldo** baja y el estado pasa a **Parcial** (si queda saldo) o **Pagado** (si quedó en cero).

**Ejemplo de pago parcial:** factura F-2024-001 por B/. 800, vence el 30 de septiembre.

| Acción | Pagado | Saldo | Estado |
|---|---|---|---|
| Se registra la factura | 0.00 | 800.00 | Por pagar |
| Abono de B/. 300 | 300.00 | 500.00 | Parcial |
| Abono de B/. 500 | 800.00 | 0.00 | Pagado |
| Intento de abonar B/. 50 más | — | — | No permitido: no hay botón **Abonar** |

**Errores frecuentes:**

- **Ingresa un monto válido mayor que cero.**
- **El monto no puede exceder el saldo (B/. X).**
- **Una compra de contado se paga en el acto y no admite abonos.**

**Tenga en cuenta:** desde la pantalla, la fecha del pago es siempre **hoy** (no hay campo de fecha). **Registre el abono el mismo día que paga.** Un pago no se edita ni se borra: se corrige desde **Historial de pagos** (4.3 y 6.1).

### 3.6 Cola de revisión de fichajes

Roles: Administrador, Supervisor.

Sirve para que el jefe confirme o rechace los **fichajes de excepción** (los que pasaron por PIN o por autorización de supervisor porque la verificación falló). Si el proveedor activó la **revisión total** en el servidor (es una configuración global de la instalación, no por empresa), entran **todos** los fichajes.

1. Menú **Principal → Cola de revisión**. Verá **{n} pendiente(s)**, el botón **Actualizar** y una tarjeta por fichaje con el empleado, el tipo (**Entrada**, **Salida comida**, **Vuelta de comida**, **Salida**), **Kiosco:**, fecha y hora, y el mecanismo (**Excepción por PIN** / **Excepción por supervisor**).
2. Para aceptar, pulse **Validar**: la tarjeta desaparece de inmediato.
3. Para rechazar, pulse **Rechazar**. Se abre **Rechazar fichaje** con **Empleado: {nombre} — {tipo} el {fecha}**; escriba opcionalmente el **Motivo del rechazo (opcional):** y pulse **Confirmar rechazo**.

**Qué verá al terminar:** la tarjeta sale de la cola; si no queda ninguna, **No hay fichajes de excepción pendientes de revisión.**

**Importante:** rechazar **no borra el fichaje ni recalcula la jornada**; solo deja constancia de su decisión. Si el fichaje rechazado era falso (por ejemplo, alguien marcó por otro), vaya además a **Jornadas** y corrija las horas y el monto extra de ese día (4.10).

**Errores:** **Este fichaje ya fue revisado.** (otro jefe lo revisó antes), **Error al validar el fichaje.**, **Error al rechazar el fichaje.**

---

## 4. Cada semana y cada quincena

**Rutina semanal / quincenal:**

- **Semanal:** revisar **Cuentas por pagar** (4.1) y **Antigüedad** (4.4); armar el **Planificador** con el presupuesto de la semana (4.5); abonar según lo decidido (3.5).
- **Quincenal:** revisar **Jornadas** (4.8) y corregir anomalías (4.10); calcular las horas extra a pagar (4.11); atender solicitudes de **Cobros** (4.12); registrar la quincena como gasto (3.3).
- **Mensual:** generar el **Estado de cuenta** de cada proveedor con el que cuadre (4.6); leer el **Dashboard** (5.1) y exportar lo que necesite el contador (FAQ 12).

### 4.1 Cuentas por pagar: ver qué debe y a quién

Roles: todos (solo Administrador y Supervisor ven **+ Registrar factura**, **Abonar** y **Planificar pagos**).

1. Menú **Principal → Cuentas por pagar**.
2. Use **Filtrar por estado:** con los botones **Todos los estados**, **Por pagar**, **Vencidas**, **Parciales**, **Pagadas**.

Columnas: **Proveedor**, **Factura**, **Total**, **Pagado**, **Saldo**, **Vencimiento**, **Estado**. Si no hay resultados: **No hay cuentas por pagar.** o **No hay cuentas por pagar con estado "{estado}".**

**Cómo se decide el estado** (en este orden):

1. **Pagado**: el saldo llegó a cero.
2. **Parcial**: ya tiene algún abono (aunque esté vencida).
3. **Vencida**: sin abonos y la fecha de vencimiento ya pasó.
4. **Por pagar**: el resto.

Una factura con un abono parcial y vencida se muestra como **Parcial**, no como **Vencida**. Aquí solo aparecen facturas a crédito (ver 3.4). Enlaces de la cabecera: **Ver antigüedad**, **Planificar pagos**, **Todas las facturas**.

### 4.2 Todas las facturas (contado y crédito)

Roles: todos. Solo lectura.

1. Menú **Principal → Todas las facturas** (o el enlace **Todas las facturas** en Cuentas por pagar).
2. Filtre por **Proveedor**, **Tipo** (**Todos los tipos**, **Contado (pagada en el acto)**, **Crédito (cuenta por pagar)**) y **Estado** (**Todos los estados**, **Por pagar**, **Vencidas**, **Parciales**, **Pagadas**). La lista se recarga al cambiar.

La tabla muestra **Proveedor**, **Factura**, **Tipo**, **Total**, **Pagado**, **Saldo**, **Vencimiento** (— para contado) y **Estado**. Una factura de contado siempre aparece con **Pagado** igual al total, **Saldo** 0 y estado **Pagado**. Desde aquí no se abona ni se corrige nada.

### 4.3 Historial de pagos

Roles: todos (**Corregir** solo Administrador y Supervisor).

1. Menú **Principal → Historial de pagos**. En la cabecera hay un enlace **Estado de cuenta** (4.6).
2. Filtre por **Proveedor**, **Desde**, **Hasta** y **Estado** (**Vigente**, **Corregido**, **Anulado**). **Limpiar filtros** quita todo.

Arriba verá el resumen de todo el conjunto filtrado: **Pagos** (cantidad), **Total registrado**, **Total vigente** y **Corregido / anulado**. La tabla muestra **Fecha**, **Proveedor**, **Factura**, **Registrado por**, **Monto registrado**, **Monto vigente** y **Estado**, de 20 en 20 (**Anterior** / **Siguiente**).

**Corregir un pago:** pulse **Corregir** al final de la fila (solo si está **Vigente**) y siga 6.1.

### 4.4 Antigüedad de cuentas: priorizar pagos

Roles: todos. Solo lectura.

1. Menú **Principal → Antigüedad de cuentas** (o **Ver antigüedad** desde Cuentas por pagar). La pantalla se titula **Antigüedad de cuentas por pagar**.
2. Filtre por **Proveedor**, **Antigüedad** (tramos), **Ordenar por** (**Mayor saldo**, **Más antigua**, **Proveedor (A–Z)**, **Fecha de compra**) y **Buscar** (proveedor o número de factura; aplica con Enter o al salir del campo). **Limpiar filtros** quita todo.

**Qué significa "antigüedad":** la pantalla lo avisa: **La antigüedad se cuenta en días desde la fecha de compra, no es mora contractual: el sistema no exige una fecha de vencimiento. Es la edad del saldo pendiente.** Es decir, cuenta los días desde la **fecha de emisión** de la factura hasta hoy, **no** los días de atraso sobre el vencimiento ("mora"). Una factura puede estar **Vencida** en Cuentas por pagar y a la vez en el tramo **0–30 días** aquí.

**Qué verá:**

- Tarjetas **Deuda total**, **Facturas pendientes**, **Proveedores**, **Deuda más antigua** (en días) y **Mayor deudor**.
- La barra **Distribución por antigüedad** con los tramos **0–30 días**, **31–60 días**, **61–90 días** y **Más de 90 días**. Pulsar un tramo filtra por él.
- Tabla **Deuda por proveedor**, con la deuda en cada tramo y accesos rápidos a **Estado de cuenta**, **Historial de pagos** y **Registrar pago**.
- Tabla **Compras con saldo pendiente**, con **Monto original**, **Pagos vigentes**, **Saldo pendiente**, **Antigüedad** (con la marca **+90d** para las más viejas) y **Tramo**.

**Acciones:** **Crear plan de pagos** (lleva el filtro al planificador), **Imprimir / Guardar PDF** y **Exportar CSV** (exporta todo el conjunto filtrado; abre en Excel). El enlace **Actualizar** recalcula.

### 4.5 Planificador de pagos: armar un plan con un presupuesto

Roles: Administrador, Supervisor.

Sirve para responder: "Tengo B/. X esta semana, ¿qué facturas pago y cuánto a cada una?".

**Muy importante:** el planificador es una **propuesta**. La pantalla lo dice: **Esto es una PROPUESTA de pagos: no registra ningún pago ni modifica la deuda. Sirve para decidir e imprimir para ejecución manual.** No guarda nada: al salir de la pantalla el plan se pierde. Para ejecutarlo debe registrar cada abono a mano (3.5).

1. Menú **Principal → Planificador de pagos** (o **Planificar pagos** desde Cuentas por pagar, o **Crear plan de pagos** desde Antigüedad). La pantalla se titula **Planificador de pagos a proveedores** y tiene el enlace **Volver a antigüedad**.
2. En **1. Configurar el plan**, escriba el **Presupuesto disponible (B/.)**.
3. Elija la **Estrategia**: **Más antiguas primero** (por defecto), **Saldos menores primero** o **Proporcional por proveedor**.
4. Opcional: **Proveedor**, **Pago mínimo (opcional)**, **Límite por proveedor (opcional)**, **Fecha de corte (opcional)** y los botones de tramo de antigüedad (puede marcar varios a la vez).
5. Pulse **Generar plan**.
6. Revise la barra **Uso del presupuesto**, la tabla **Antigüedad antes y después del plan** y **Plan por proveedor**.
7. En **2. Detalle y ajuste** puede cambiar el **Pago planificado** de cada factura a mano (el botón **Saldo** pone el saldo completo). Use **Vaciar todo** o **Restaurar sugerencia** si se enreda, y pulse **Aplicar montos** para que el sistema revalide. **Usar todo el presupuesto** ajusta el presupuesto a la deuda total.
8. En **3. Reporte de confirmación** vea el resumen y use **Imprimir / Guardar PDF** o **Exportar CSV** para llevárselo.

**Qué verá al terminar:** el reporte con el descargo **Este plan es una propuesta de pagos y NO ha sido registrado como pagos reales. Para ejecutarlo, registra cada abono en Cuentas por pagar.**

**Errores frecuentes:**

- **Ingresa un presupuesto válido mayor que cero.**
- **Cambiaste la configuración: el plan de abajo es el ANTERIOR. Pulsa "Generar plan" para actualizarlo.**
- **El total planificado supera el presupuesto disponible.** / **Un pago supera el saldo de su factura.** — ajuste los montos marcados.
- **No hay facturas pendientes con estos filtros.**

### 4.6 Estado de cuenta de un proveedor

Roles: todos. Solo lectura.

Es el documento para cuadrar cuentas con un proveedor: cuánto le debía al inicio del período, qué facturas entraron, qué pagó y cuánto queda.

1. Menú **Principal → Estado de cuenta de proveedor** (hay enlace **Ver antigüedad**).
2. Elija el **Proveedor** (obligatorio; no existe un estado de cuenta "de todos").
3. Indique **Desde** y **Hasta**.
4. Pulse **Generar estado de cuenta**.

**Qué verá:** el nombre de su empresa, **Período:**, **Generado el:**, los datos del proveedor, y las tarjetas **Saldo inicial**, **Compras del período**, **Pagos vigentes**, **Correcciones / anulaciones** y **Saldo final**. Debajo, la tabla con **Fecha**, **Documento**, **Concepto**, **Débito** (aumenta la deuda: "Factura de compra a crédito"), **Crédito** (la reduce: "Pago a proveedor") y **Saldo** corriente. Los pagos corregidos o anulados aparecen indicados con su motivo.

**Acciones:** **Imprimir / Guardar PDF** y **Exportar CSV**. Al pie: **Para guardarlo como PDF, usa "Imprimir" y elige "Guardar como PDF"… El sistema no genera el PDF en el servidor.** (en el diálogo de impresión del navegador elija "Guardar como PDF").

**Tenga en cuenta:**

- **Saldo inicial** es toda la deuda anterior al período, aunque venga de hace años; no es cero.
- Las compras de contado no aparecen (no generan deuda).
- Si cambia el proveedor o las fechas después de generar, verá **Cambiaste los filtros: el estado de cuenta que se muestra abajo es el ANTERIOR. Pulsa "Generar estado de cuenta" para actualizarlo.**
- Error: **La fecha "desde" no puede ser posterior a "hasta".**

### 4.7 Ejemplo completo: de la factura al pago al proveedor

> El 1 de agosto llega un pedido de filtros de "Repuestos del Istmo" con factura F-3310 por B/. 900 a 30 días.
>
> 1. **Registrar la factura (3.4):** Cuentas por pagar → **+ Registrar factura** → Proveedor "Repuestos del Istmo" → Sede → Número `F-3310` → Monto `900` → **Crédito (cuenta por pagar)** → Fecha de emisión 01/08 → Fecha de vencimiento 31/08 → **Registrar factura**. Aparece **Por pagar**, saldo 900.
> 2. **Semana 3, viene el vendedor a cobrar y usted paga B/. 300 (3.5):** en la fila de F-3310 pulse **Abonar** → Monto `300` → **Registrar abono**. Estado **Parcial**, saldo 600. Hágalo el mismo día del pago.
> 3. **Fin de mes, cuadrar con el vendedor (4.6):** Estado de cuenta → Proveedor "Repuestos del Istmo" → Desde 01/08 → Hasta 31/08 → **Generar estado de cuenta** → **Imprimir / Guardar PDF**. Verá el débito de 900, el crédito de 300 y saldo final 600.
> 4. **Decidir el próximo pago (4.5):** Planificador → presupuesto de la semana → **Generar plan** → imprimir. Luego registre los abonos reales en Cuentas por pagar.

### 4.8 Jornadas: consultar horas trabajadas y horas extra

Roles: todos (Empleado solo consulta: el botón **Corregir** se muestra a todos, pero al Empleado el servidor le responde **No tiene permiso para esta operación.**; **Barrer huérfanos** solo Administrador).

1. Menú **Principal → Jornadas** (subtítulo **Consulta y corrección de jornadas laborales**).
2. Ajuste **Desde** / **Hasta** y pulse **Filtrar** (o **Actualizar**). Use **Buscar empleado** para filtrar por número o nombre.

Columnas: **Empleado**, **Fecha**, **Trabajadas** (`Xh Ym`), **Clasificación** (**Diurna** / **Nocturna** / **Mixta**), **Extra** (`Xh Ym`), **Monto extra**, **Estado** (**Calculada** / **Anomalía** / **Corregida**) y **Festivo**. Si hay anomalías, un aviso ámbar indica **{n} jornada(s) con anomalía en el período** y cada fila muestra el detalle (ver 6.3).

**Limitación: "¿a qué hora llegó cada uno?"** GestorPro no tiene hoy una pantalla que liste los fichajes individuales con su hora: Jornadas muestra el total de horas del día, y la Cola de revisión solo muestra los fichajes de excepción (con hora). Si necesita las horas de entrada exactas, pídalas al soporte del proveedor; una jornada sin fichajes (registro manual) tampoco se puede crear desde la pantalla.

### 4.9 Cómo se calcula una jornada

El sistema calcula la jornada automáticamente al marcar **Salida**, con estas reglas:

1. **Trabajadas** = (Salida − Entrada) − pausa de comida (Vuelta de comida − Salida comida). Si no hay fichajes de comida, no se descuenta pausa (salvo que al empleado se le haya asignado un turno con pausa por defecto, cosa que hoy no se hace desde la pantalla). **Trabajadas** incluye las horas extra.
2. **Clasificación** según la franja nocturna (de 18:00 a 06:00): **Diurna** si nada cae en la franja, **Nocturna** si todo, **Mixta** si una parte.
3. **Jornada legal**: diurna 8 h, nocturna 7 h, mixta 7,5 h. Lo que excede es **hora extra**.
4. **Recargos legales fijos**: 25 % en jornada diurna, 50 % nocturna, 75 % mixta y **150 % si el día es festivo**. Son los **mínimos del Código de Trabajo de Panamá**: **no se pueden configurar ni rebajar** en ningún lugar de la aplicación.
5. **Topes**: se pagan como máximo 3 horas extra por día y 9 por semana. El exceso se ve en **Extra** pero no se paga hasta que el jefe lo revise y corrija.
6. **Valor de la hora** = salario mensual ÷ 240.
7. **Monto extra** = horas extra pagables × valor hora × (1 + recargo), redondeado a centavos. Se **acredita al saldo de horas extra** del empleado (4.11, 4.12).

Nota: los topes (3 h / 9 h) y el divisor 240 son criterio del sistema **pendiente de validación legal**; los recargos sí están validados. Los días festivos los mantiene el equipo técnico; no hay pantalla para cargarlos.

**Ejemplo, en el formato de la tabla:** Ana tiene salario B/. 600 → valor hora = 600 ÷ 240 = **B/. 2.50**. Un día marca Entrada 08:00, Salida comida 12:00, Vuelta de comida 13:00 y Salida 19:00.

- Presencia 11 h, pausa 1 h → **Trabajadas 10h 0m**.
- Una hora (18:00–19:00) cae en la franja nocturna → **Mixta**, jornada legal 7,5 h.
- **Extra 2h 30m** (dentro del tope de 3 h).
- Recargo mixta 75 % → 2,5 × 2.50 × 1,75 = **Monto extra B/. 10.94**.
- Si ese día fuera festivo: 2,5 × 2.50 × 2,50 = **B/. 15.63**.

**Tabla de cálculo rápida** (para corregir jornadas a mano, 4.10):

| Salario mensual | Valor hora (÷ 240) | 2 h extra diurna (×1,25) | 2 h nocturna (×1,50) | 2 h mixta (×1,75) | 2 h festivo (×2,50) |
|---|---|---|---|---|---|
| B/. 600 | 2.50 | 6.25 | 7.50 | 8.75 | 12.50 |
| B/. 800 | 3.33 | 8.33 | 10.00 | 11.67 | 16.67 |
| B/. 1 000 | 4.17 | 10.42 | 12.50 | 14.58 | 20.83 |

Fórmula: **horas extra × (salario ÷ 240) × factor**, donde el factor es 1,25 / 1,50 / 1,75 / 2,50. El sistema redondea al final, por lo que puede haber diferencias de un centavo.

### 4.10 Corregir una jornada

Roles: Administrador, Supervisor.

1. En la fila, pulse **Corregir** (al final de la fila). Se abre **Corregir jornada** con **Empleado: {nombre} ({número}) — Fecha: {fecha}**.
2. Escriba el **Motivo de la corrección** (obligatorio).
3. Complete solo lo que quiera cambiar: **Minutos trabajados** (en minutos: 8 h 30 min = 510), **Minutos extra**, **Monto extra (B/.)**. Lo que deje vacío no cambia (el campo muestra el valor actual como ayuda).
4. Si la jornada tiene anomalía, deje marcada **Resolver anomalía (marcar como corregida)**.
5. Pulse **Guardar corrección**.

**Qué verá al terminar:** la jornada pasa a estado **Corregida**. Si cambió el **Monto extra**, el saldo de horas extra del empleado se ajusta por la diferencia.

**Importante:** los tres campos son independientes. **Cambiar los minutos NO recalcula el monto.** Si corrige las horas, calcule también el monto extra con la tabla de 4.9 y escríbalo. Cada corrección queda registrada de forma permanente (valor anterior, nuevo, motivo y quién).

### 4.11 Cuánto debo de horas extra a cada empleado esta quincena

Roles: Administrador, Supervisor (Empleado puede consultar).

GestorPro no liquida la quincena: usted la paga fuera de la aplicación. Para saber el monto:

1. **Jornadas** → **Desde** / **Hasta** de la quincena → **Buscar empleado** → sume la columna **Monto extra** de sus jornadas (o exporte/anote).
2. Reste los adelantos ya pagados en **Cobros** en ese período (estado **Pagada**).
3. Registre el pago de la quincena como gasto (3.3) en una categoría de pago a empleado, **Tipo de pago: Quincenal** (o en una categoría "Planilla" sin marca de empleado, ver 3.3).

**Limitación importante:** el **Saldo acumulado** que muestra **Cobros** es la suma histórica de todos los montos extra menos los adelantos aprobados; **no se reinicia al pagar la quincena** fuera del sistema, y no hay pantalla para descontarlo (el adelanto solo permite hasta el 80 %). Use el saldo de Cobros solo para decidir adelantos, y las **Jornadas del período** para calcular la quincena.

### 4.12 Cobros: adelanto de horas extra

La pantalla **Cobros** (título **Cobro anticipado de horas extra**) **no es planilla ni pago de salario** ni tiene nada que ver con cobrar a clientes. Cada jornada con horas extra suma dinero al **saldo de horas extra** del empleado. Con esta pantalla se pide un **adelanto** de parte de ese saldo antes de la quincena; el jefe lo aprueba y el administrador, tras entregar el efectivo por fuera de la aplicación, lo marca como pagado.

Reglas:

- Solo se puede adelantar hasta el **80 %** del saldo, menos lo que ya esté solicitado y pendiente.
- Si el monto es **igual o menor al umbral de aprobación** (B/. 100), la solicitud nace **Aprobada** y descuenta el saldo al instante. Si lo supera, nace **Pendiente** y descuenta al aprobarse.
- Los valores 80 % y B/. 100 son los de su empresa por defecto; **no hay pantalla para cambiarlos**: solo el equipo técnico del proveedor puede ajustarlos.
- El saldo nunca queda negativo. Un rechazo no toca el saldo.
- Al marcar **Marcar pagado** se crea automáticamente un **gasto** con: la primera categoría activa de pago a empleado, la sede del empleado, la fecha de hoy y **Tipo de pago** "cobro de horas extra" (un valor que no está en el desplegable de gastos). No lo registre otra vez a mano.

**Solicitar un adelanto.** Roles: todos.

1. Menú **Principal → Cobros**.
2. En **Nueva solicitud**, elija el **Empleado**. Verá **Saldo acumulado: B/. X**, **% cobrable: 80%** y **Disponible para adelanto: B/. Y**.
3. Escriba el **Monto a solicitar (B/.)** (máximo el disponible).
4. Pulse **Solicitar adelanto**.

**Qué verá al terminar:** **Solicitud enviada correctamente.** y la solicitud en la lista **Solicitudes de cobro** como **Aprobada** o **Pendiente**.

**Ejemplo:** Ana tiene saldo B/. 60. Disponible = 80 % = **B/. 48**. Pide B/. 30 → como 30 ≤ 100, queda **Aprobada** de inmediato y su saldo baja a B/. 30. El administrador le entrega B/. 30 en efectivo y pulsa **Marcar pagado** → estado **Pagada** y aparece un gasto de B/. 30 en **Gastos**.

**Errores frecuentes:**

- **Ingrese un monto válido mayor a cero.**
- **El monto solicitado (B/. 50.00) excede tu monto adelantable disponible (B/. 40.00; 80% del saldo, menos lo ya solicitado).**

> **Riesgo que debe conocer:** el desplegable permite a **cualquier usuario con sesión** solicitar a nombre de **cualquier empleado**, y las solicitudes de B/. 100 o menos se aprueban solas. Práctica recomendada: que solo el supervisor registre solicitudes, tras petición verbal del empleado; revisar a diario las listas **Pendientes** y **Aprobadas**; y no entregar dinero sin ver la solicitud en pantalla.

**Aprobar, rechazar y marcar pagado.** Roles: **Aprobar** / **Rechazar**: Administrador, Supervisor. **Marcar pagado**: solo Administrador.

1. En **Solicitudes de cobro**, filtre por **Estado** (**Pendientes**, **Aprobadas**, **Rechazadas**, **Pagadas**).
2. En una solicitud **Pendiente**: pulse **Aprobar** (inmediato) o **Rechazar** (escriba el **Motivo del rechazo (opcional):** y pulse **Confirmar rechazo**).
3. En una solicitud **Aprobada**, después de entregar el dinero: pulse **Marcar pagado**.

**Errores frecuentes:**

- **Saldo insuficiente: disponible B/. X, solicitado B/. Y.** — el saldo bajó desde que se pidió (por ejemplo, por una corrección de jornada).
- **No hay una categoría de "pago a empleado" configurada.** — active una en **Categorías de gasto**.
- **Solo se puede aprobar una solicitud pendiente.** / **Solo se puede rechazar una solicitud pendiente.** / **Solo se puede pagar un cobro aprobado (ya pagado o no aprobado no aplica).**

Un **pagado** no se deshace: el gasto creado es inmutable y, si fue un error, se corrige desde **Gastos** (6.1).

---

## 5. Revisar el negocio

### 5.1 Dashboard de ganancias

Roles: todos (Empleado solo consulta).

1. Menú **Principal → Dashboard**. Título: **Dashboard de ganancias**.
2. Ajuste **Desde**, **Hasta**, **Sede**, **Turno** y **Cajera**. Los filtros se aplican al cambiar; **Filtrar** vuelve a consultar.

Cinco tarjetas:

| Tarjeta | Qué muestra |
|---|---|
| **Ventas** | Total de cierres de caja del período (los corregidos valen su monto corregido; los anulados, 0). |
| **Compras registradas** | Todas las facturas de compra por fecha de emisión, crédito y contado, pagadas o no. Es informativa: **no** entra en la ganancia. |
| **Pagos a proveedor** | Lo que realmente salió: abonos a facturas a crédito (por fecha de pago) más las compras de contado (por fecha de factura). |
| **Gastos** | Gastos del período, netos de correcciones. |
| **Ganancia** | **Ventas − Pagos a proveedor − Gastos.** Verde si es positiva, roja si es negativa. |

**Cómo interpretarlo:** la ganancia se calcula "por caja" (cuenta el dinero cuando realmente sale): una factura a crédito que todavía no pagó **no resta** hasta que la pague. Por eso **Compras registradas** puede ser mucho mayor que **Pagos a proveedor**: la diferencia es su deuda pendiente (4.1). Para ver cuánto vendió por sede, filtre por **Sede**.

Debajo, el bloque **Gastos por categoría** muestra cuánto pesa cada categoría en el total de gastos, y la lista de cierres (3.2). Enlace **Ver flujo de caja**.

**Tenga en cuenta:** si filtra por **Cajera** o **Turno**, verá la nota **El filtro de cajera/turno acota solo las Ventas; las compras y los gastos no tienen cajera y se muestran de toda la sede del período.** Ese filtro sirve para revisar descuadres de una cajera, no para medir su ganancia. Un pago corregido o anulado conserva su fecha original y su reverso lleva la fecha de la corrección: el neto es cero solo si el período incluye ambas fechas.

### 5.2 Flujo de caja

Roles: Administrador, Supervisor.

1. Menú **Principal → Flujo de caja** (o **Ver flujo de caja** desde el Dashboard). Título: **Flujo de caja operativo**.
2. Filtre por **Desde**, **Hasta**, **Tipo** (**Ingreso**, **Gasto**, **Pago a proveedor**), **Sede**, **Proveedor**, **Categoría**, **Estado**, **Ordenar por** y **Buscar**.

**Lea siempre el aviso:** **Cuenta solo los movimientos de dinero YA registrados en GestorPro. NO incluye compras a crédito impagas, NO es la ganancia y NO es el saldo real de banco o caja. No sustituye la conciliación bancaria.**

**Qué verá:**

- Resumen: **Total ingresos**, **Gastos**, **Pagos a proveedores**, **Total salidas** y **Flujo neto** (con días positivos y negativos).
- **Saldo inicial manual**: puede escribir cuánto tenía en caja al inicio para ver un **Saldo final proyectado**. Es solo una simulación: no se guarda y se marca como **Valor manual, no verificado**.
- **Tendencia diaria**: barras de entradas y salidas por día y el acumulado.
- **Ingresos por método de cobro**: Efectivo, Tarjeta, Yappy y Lotería, según el arqueo vigente de los cierres.
- **Movimientos**: cada cierre, gasto y pago con **Entrada** o **Salida**, **Estado** y **Usuario**, de 25 en 25. **Ver origen** lleva a la pantalla donde se registró; **Ver auditoría** a su corrección.

**Acciones:** **Imprimir / Guardar PDF** y **Exportar CSV** (todo el conjunto filtrado).

**Tenga en cuenta:** las compras de **contado** no aparecen como movimiento (no generan un pago), aunque sí restan en **Pagos a proveedor** del Dashboard. Por eso el **Flujo neto** puede no coincidir con la **Ganancia**.

### 5.3 Auditoría financiera

Roles: Administrador, Supervisor. Solo lectura.

Sirve para revisar cada vez que alguien corrigió o anuló dinero ya registrado: qué monto había, qué monto vale hoy, la diferencia, el motivo y quién lo hizo. Desde aquí no se cambia nada y nada se puede borrar.

1. Menú **Gestión → Auditoría financiera**.
2. Filtre por **Desde** / **Hasta** (vacíos = **Todo el historial**), **Módulo** (**Gasto**, **Cierre de caja**, **Pago**), **Acción** (**Corrección**, **Anulación**), **Usuario** y **Buscar** (motivo, proveedor, categoría, cajera…). Botón **Actualizar**; enlace **Ver flujo de caja**.

**Importante:** las fechas filtran por el día en que se **hizo la corrección**, no por la fecha del movimiento original.

**Qué verá:** tarjetas **Correcciones**, **Por módulo**, **Total original**, **Total vigente**, **Diferencia neta** (lo que las correcciones quitaron; no es una pérdida) y **Usuarios**. La tabla lista **Fecha de corrección**, **Módulo**, **Acción**, **Objeto**, **Monto original**, **Monto vigente**, **Diferencia**, **Motivo**, **Usuario** y el botón **Ver detalle**.

**Detalle de una corrección:** pulse **Ver detalle**. El panel **Detalle de la corrección** muestra la **Línea de tiempo del dinero** (**Registro original** → **Reverso (anula el original)** → **Corrección (monto correcto)** o **Sin nuevo monto (anulación)** → **Monto vigente**), los **Datos de la corrección** (motivo, usuario, diferencia, identificadores) y el **Detalle del registro** (categoría; o proveedor y factura, donde el monto total de la factura aparece bajo el rótulo **Saldo inicial**; o sede, cajera, turno y arqueo original vs. vigente, según el caso).

**Acciones:** **Imprimir / Guardar PDF** y **Exportar CSV** (aparecen si hay al menos un registro). También puede llegar aquí con **Ver auditoría** desde cualquier lista.

---

## 6. Cuando algo sale mal

### 6.1 Corregir un error de dinero (gastos, pagos y cierres)

Roles: Administrador, Supervisor.

Los **gastos**, los **pagos a proveedores** y los **cierres de caja** son inmutables. Cuando hay un error, el sistema crea un **reverso** (una anotación automática que anula el original por el mismo monto) y, si corresponde, una **corrección** (una anotación nueva con el monto correcto). El original queda intacto, todo queda en la **Auditoría financiera** (5.3), y las sumas del Dashboard, el flujo de caja y las deudas se recalculan solas.

Consecuencias que debe conocer:

- Cada movimiento se puede corregir **una sola vez**. El segundo intento da **El movimiento ya fue corregido: no admite una segunda corrección.** (en algún caso puede ver la variante **Este movimiento ya fue corregido: no admite otra corrección.**). La corrección es definitiva: revise bien el monto antes de confirmar.
- El **Motivo** es obligatorio siempre y queda grabado.
- No hay pregunta de "¿está seguro?": el botón de confirmación es la confirmación.

**Pasos:**

1. Vaya a la lista donde está el movimiento: **Gastos** (gasto), **Historial de pagos** (pago) o **Dashboard** (cierre de caja). Solo los movimientos **Vigente** tienen el botón.
2. Pulse **Corregir** al final de la fila. Se abre **Corregir movimiento**, con la descripción del movimiento y **Monto registrado: B/. X**, y el aviso **El movimiento original NO se modifica ni se borra: se anula con un reverso y, si corresponde, se registra el importe correcto. Todo queda en la auditoría. Solo se puede corregir UNA vez.**
3. Elija una opción:
   - **Corregir el importe** ("El movimiento existió, pero con otro monto."). Corrija el **Monto correcto (B/.)** (viene precargado con el monto registrado). En cierres de caja aparece en su lugar el bloque **Arqueo corregido** con **Efectivo**, **Tarjeta**, **Yappy** y **Lotería** precargados: deje los **cuatro** con el valor correcto, porque el arqueo corregido reemplaza al original completo.
   - **Anular el movimiento** ("No debió registrarse: queda en cero.").
4. Escriba el **Motivo** (obligatorio; ejemplo del campo: "Ej.: se tecleó 150 en vez de 15.").
5. Pulse **Registrar corrección** (o **Anular movimiento**, en rojo). El diálogo no se cierra hasta que el servidor confirma.

**Qué verá al terminar:** **Corrección registrada: el movimiento quedó corregido.** (en pagos: **Corrección registrada: el pago quedó corregido y la deuda de la factura se recalculó.**). En la lista, el estado pasa a **Corregido** (monto original tachado + monto nuevo) o **Anulado** (fila atenuada, vale B/. 0.00). El botón **Corregir** se sustituye por **Ver auditoría**.

**Ejemplo:** registró un gasto de combustible de B/. 150.00 cuando eran B/. 15.00. **Corregir** → **Corregir el importe** → **Monto correcto (B/.)** `15` → **Motivo** "Se tecleó 150 en vez de 15" → **Registrar corrección**. En la lista verá ~~B/. 150.00~~ B/. 15.00 con estado **Corregido**, y el total del período bajará B/. 135.00. En Auditoría financiera aparecerá un evento **Corrección** con **Diferencia** −B/. 135.00.

**Particularidades por tipo:**

- **Pagos:** si elige **Corregir el importe**, el pago correcto queda fechado hoy; si **Anular**, el pago vale cero y la deuda de la factura vuelve a subir (puede volver a **Parcial** o **Por pagar**). El pago original conserva su fecha y el reverso lleva la fecha de hoy. Si tras corregir la lista no se recarga por un fallo de red, **la corrección sí quedó registrada**: no la repita.
- **Cierres de caja:** si el cierre existió pero estaba mal, use **Corregir el importe**, no **Anular el movimiento**. Un cierre anulado **sigue ocupando** la combinación sede + fecha + turno + cajera, así que no podrá registrar otro cierre igual después.

**Errores frecuentes:**

- **Ingrese un monto válido (0 o mayor).**
- **El motivo de la corrección es obligatorio.**
- **El movimiento ya fue corregido: no admite una segunda corrección.**
- **La corrección excede el saldo de la factura: el pago efectivo superaría el total de la compra.** (solo pagos; use un monto menor).
- **La corrección de un cierre requiere el arqueo corregido.** (solo cierres).

### 6.2 Registré una factura con monto o tipo equivocado

Una factura no se edita, no se borra y no tiene corrección. Qué hacer según el caso:

- **Monto registrado MENOR que el real:** registre una segunda factura del mismo proveedor por la diferencia, con el número original más un sufijo (por ejemplo `F-3310-AJUSTE`) y el mismo tipo. La deuda total quedará correcta.
- **Monto registrado MAYOR que el real, o factura que no debió existir, o tipo equivocado (contado en vez de crédito o al revés):** no existe hoy una forma soportada de reducir o anular una factura desde la aplicación; el saldo sobrante quedaría como deuda "fantasma" en Cuentas por pagar y en el estado de cuenta. **Contacte al soporte del proveedor (6.6)** con el número de factura, el proveedor y el monto correcto, y no registre abonos "para cerrarla".
- **El proveedor hizo un descuento después de facturar:** es el mismo caso anterior (monto mayor que el real). Mientras tanto, pague solo el monto real y deje constancia del descuento en el motivo cuando soporte lo resuelva.

### 6.3 Fichajes equivocados, salida olvidada y anomalías

Los **fichajes son inmutables**: no se pueden borrar ni cambiar desde el kiosco ni desde ninguna pantalla. Lo que ocurre y lo que ve el jefe en **Jornadas**:

| Situación | Resultado | Detalle que muestra la jornada |
|---|---|---|
| Marcó **Salida** sin **Entrada** | No se genera jornada. | — |
| Dos veces **Entrada** o dos veces **Salida** | **Anomalía**, horas en cero. | **Falta el fichaje de entrada o de salida, o está duplicado.** |
| Dos veces **Salida comida** o dos veces **Vuelta de comida** | **Anomalía**. | **Fichajes de comida duplicados.** |
| **Vuelta de comida** antes que **Salida comida** | **Anomalía**. | **Los fichajes de comida están en desorden.** |
| **Salida comida** sin **Vuelta de comida** (o al revés) | **Anomalía**. | **Fichajes de comida incompletos (falta la salida o la vuelta de comida).** |
| Salida anterior a la entrada | **Anomalía**. | **La salida no es posterior a la entrada.** |
| Olvidó marcar **Salida** | La entrada queda "huérfana"; no hay jornada hasta el barrido. | **Fichaje de entrada sin salida (huérfano).** |

**Qué hace el jefe (paso a paso):**

1. Si un empleado olvidó marcar **Salida**: espere a que hayan pasado más de 16 horas desde la entrada y, como **Administrador**, en **Jornadas** pulse **Barrer huérfanos**. Verá **Se marcaron {n} fichaje(s) huérfano(s).** o **No se encontraron fichajes huérfanos.** **No hay proceso automático**: las entradas sin salida solo se marcan como anomalía cuando alguien pulsa ese botón.
2. Localice la jornada en **Anomalía** y pulse **Corregir** (4.10): escriba el motivo, los **Minutos trabajados** reales, los **Minutos extra** y el **Monto extra** calculado con la tabla de 4.9, y deje marcada **Resolver anomalía (marcar como corregida)**.
3. Si el fichaje erróneo pasó por la **Cola de revisión** (3.6), rechácelo allí además, para dejar constancia.

Para el empleado: avise a su supervisor el mismo día; no intente "arreglarlo" marcando más fichajes.

### 6.4 La tablet no funciona: sin token o sin Internet

- **Dispositivo no configurado**: falta el token del kiosco. El administrador lo obtiene en **Gestión → Kioscos** (al crear el kiosco o con **Regenerar token**) y lo pega en la tablet pulsando **Guardar** (2.6). Si regenera el token, el anterior deja de servir.
- **Kiosco no autorizado**: el token no es válido o el kiosco elegido en el selector no corresponde a esta tablet. Elija el kiosco correcto; si persiste, regenere el token.
- **Error de red. Intente nuevamente.** / la tablet no tiene Internet: **no hay modo sin conexión**. Anote en papel la hora de cada entrada y salida. Al final del día el supervisor corrige la jornada de cada afectado en **Jornadas → Corregir** (minutos trabajados, extra y monto, con el motivo "sin Internet en el kiosco"). Si el día no generó jornada (nadie marcó Salida), no hay fila que corregir: en ese caso no se puede crear la jornada desde la pantalla; contacte al soporte (6.6) y conserve la anotación en papel.
- **La tablet se apagó a mitad de turno**: los fichajes ya enviados se conservan; al encenderla vuelva a abrir **https://app.gestorpro.us/kiosco** y elija el **Kiosco** de nuevo (el token se conserva salvo que se hayan borrado los datos del navegador).

### 6.5 Contraseñas y sesiones

**Cambiar su contraseña cuando usted quiera.** Roles: todos.

1. En el menú lateral, abajo, pulse **Cambiar contraseña** (icono de llave).
2. Complete **Contraseña actual**, **Nueva contraseña** y **Confirmar nueva contraseña**.
3. Pulse **Cambiar contraseña**. Aquí sí puede **Cancelar** o cerrar con la tecla Escape.
4. Verá **Contraseña actualizada** y deberá pulsar **Ir a iniciar sesión** y entrar de nuevo.

**Importante:** al cambiar la contraseña se cierran **todas** sus sesiones en todos los dispositivos (celular, otras pestañas, la tablet). No se avisa antes; si tenía un formulario a medias en otra pestaña, se perderá. (En **Usuarios**, el aviso de su propia fila dice que la contraseña se cambia desde la "barra superior"; el sitio correcto es el menú lateral.)

**Cerrar sesión.** Pulse **Cerrar sesión** (icono de salida) en la parte inferior del menú lateral. No pide confirmación y vuelve a **Iniciar sesión**. Solo cierra la sesión de este dispositivo; para expulsar todos los dispositivos a la vez, cambie la contraseña. La sesión dura **30 días desde que inició sesión** (no se prolonga por usar la aplicación) aunque cierre la pestaña o el navegador. En computadoras compartidas, cierre sesión siempre al terminar.

**Un usuario olvidó su contraseña (flujo completo).** No existe "recuperar contraseña".

1. Un **Administrador** entra en **Gestión → Usuarios** y pulsa **Restablecer contraseña** en la fila de la persona. Se abre **Restablecer contraseña — {nombre}** con el texto **Define una contraseña temporal. Se cerrarán todas las sesiones del usuario y deberá cambiarla en su próximo ingreso.**
2. Escribe **Contraseña temporal** y **Confirmar contraseña temporal** y pulsa **Restablecer**. Ve **Contraseña restablecida** — **Comunica la contraseña temporal a {nombre}: deberá cambiarla en su próximo ingreso.**
3. Comunica la contraseña temporal en persona.
4. La persona entra con la temporal; aparece el diálogo obligatorio **Cambiar contraseña** (2.1) y define la suya.
5. Pulsa **Ir a iniciar sesión** y entra con la nueva.

Su propia fila muestra **Tu cuenta** (su contraseña se cambia desde el menú lateral). Si la cuenta está inactiva, el botón está deshabilitado (**Cuenta desactivada: no puede iniciar sesión, restablecerla no tendría efecto.**). Si el único administrador olvida su contraseña, debe pedirlo al soporte del proveedor (6.6).

### 6.6 Soporte del proveedor

Necesitará al soporte del proveedor de GestorPro para: recuperar el acceso del único administrador; dar acceso a su empresa a un correo que ya existe en otra; cambiar contraseña o estado de una cuenta que pertenece a varias empresas; ajustar el porcentaje y umbral de adelantos; cargar días festivos; obtener los identificadores técnicos de empleados; resolver una factura con monto equivocado (6.2); crear una jornada sin fichajes; activar la revisión total de fichajes; y reactivar una empresa suspendida.

Canal de soporte: use el que le facilitó su proveedor al contratar el servicio (anótelo aquí: ______________________). Al escribir, indique siempre: nombre de la empresa, su correo de acceso, la pantalla y el mensaje exacto que ve (una captura ayuda) y, si aplica, número de factura o de empleado. Nunca envíe contraseñas.

---

## 7. Usar GestorPro en el celular

- Abra **https://app.gestorpro.us** en el navegador del celular; funciona con la misma cuenta. En iPhone puede añadirla a la pantalla de inicio con **Compartir → Añadir a pantalla de inicio**; en Android, con el menú del navegador **Añadir a pantalla principal**. Sigue siendo la web: sin Internet no funciona.
- **Aplicación Android:** está en preparación (un envoltorio de la misma web) y **todavía no se distribuye a clientes**. No instale ningún archivo APK que no venga de su proveedor.
- El menú se reduce a iconos (mantenga pulsado para ver el nombre); no se ven el nombre de la empresa, su nombre ni el rol, y no se puede cambiar de idioma ni de empresa (use la pantalla de inicio de sesión o una pantalla ancha).
- Las tablas anchas se desplazan de lado: los botones de acción están al final de cada fila.
- **Imprimir / Guardar PDF** abre el diálogo de impresión o de compartir del celular; elija "Guardar como PDF". **Exportar CSV** descarga un archivo que puede enviar por correo.
- El **kiosco** es para una tablet dedicada del local. No use el celular personal de un empleado como kiosco: el token autoriza al aparato, y quien lo tenga puede fichar por cualquier número.

---

## 8. Preguntas frecuentes

**1. Registré una factura y no la veo en Cuentas por pagar. ¿Se perdió?**
No. Seguramente la registró como **Contado (pagada en el acto)**. Búsquela en **Principal → Todas las facturas**, filtrando por **Tipo: Contado**. Ver 3.4.

**2. Me equivoqué en un gasto. ¿Cómo lo borro?**
No se borra. En **Gastos**, pulse **Corregir** y siga 6.1. Solo puede hacerlo una vez.

**3. ¿Por qué no puedo pagar más de lo que debo?**
Porque sería un sobrepago y GestorPro lo bloquea siempre (**El monto no puede exceder el saldo (B/. X).**). Si el proveedor le cobró de más, eso se resuelve con él fuera del sistema; si la factura tenía un monto equivocado, ver 6.2.

**4. Corregí un pago y me equivoqué otra vez. ¿Puedo corregirlo de nuevo?**
No: cada movimiento admite una única corrección. Si el pago corregido sigue mal, registre un nuevo abono por la diferencia (si falta dinero) o consulte al soporte cómo documentarlo.

**5. Entro con mi contraseña correcta y me dice "Credenciales inválidas.".**
Ese mensaje también aparece si su cuenta fue desactivada o si la empresa fue suspendida. Contacte al administrador de su empresa; si es usted el administrador, al soporte del proveedor (6.6).

**6. Olvidé mi contraseña. ¿Dónde está "recuperar contraseña"?**
No existe. Siga el flujo de 6.5: un administrador le asigna una temporal en **Usuarios → Restablecer contraseña**, usted entra con ella, la cambia y vuelve a entrar.

**7. Cambié mi contraseña y me sacó del celular también.**
Es intencional: cambiar la contraseña cierra todas las sesiones en todos los dispositivos. Vuelva a entrar con la nueva.

**8. La cajera ya cerró caja y se equivocó. ¿Registro el cierre de nuevo?**
No. Verá **Ya existe el cierre de esa cajera y turno para la fecha; use una corrección para ajustarlo.** En el Dashboard pulse **Corregir** en la fila, elija **Corregir el importe** y escriba el arqueo completo correcto. No lo anule: un cierre anulado sigue ocupando ese turno.

**9. ¿Por qué "Compras registradas" es mucho mayor que "Pagos a proveedor"?**
Porque compra a crédito. La diferencia es su deuda, visible en **Cuentas por pagar**. La **Ganancia** usa solo lo pagado (5.1).

**10. La "Ganancia" del Dashboard no coincide con el "Flujo neto".**
Son cálculos distintos: el flujo de caja no incluye las compras de contado como movimiento; el Dashboard sí las resta. Ninguno de los dos es el saldo de su banco (5.2).

**11. Una factura dice "Vencida" pero en Antigüedad está en "0–30 días". ¿Cuál es correcta?**
Las dos. **Vencida** se refiere a la fecha de vencimiento; la **antigüedad** cuenta los días desde la fecha de emisión (4.4).

**12. ¿Cómo saco un reporte para mi contador?**
Use **Exportar CSV** en **Flujo de caja** (todos los movimientos del período), **Antigüedad**, **Estado de cuenta** y **Auditoría financiera**; los archivos abren en Excel. Los gastos y el historial de pagos se consultan en pantalla por período.

**13. ¿Cómo veo cuánto vendí este mes por sede?**
**Dashboard** → **Desde** / **Hasta** del mes → **Sede**. La tarjeta **Ventas** es la suma de los cierres de caja.

**14. ¿Cómo registro el pago de la quincena o del salario?**
Como gasto (3.3), con una categoría de pago a empleado y **Tipo de pago: Quincenal** o **Mensual**; necesita el identificador técnico del empleado. Si no lo tiene, use una categoría "Planilla" sin marca de empleado y anote el nombre en la **Descripción**. Ver también 4.11.

**15. ¿Dónde anoto un préstamo o adelanto de salario que no es de horas extra?**
Como gasto con **Tipo de pago: Adelanto** (o **Otro**). **Cobros** es solo para horas extra.

**16. ¿Cómo registro el alquiler del local?**
Como gasto en la categoría **Alquiler** (viene creada), con la sede correspondiente.

**17. ¿Puedo registrar un gasto de ayer? ¿Y un abono de ayer?**
Gasto: sí, cambiando la **Fecha de operación**. Abono: **no**, siempre queda con la fecha de hoy; por eso conviene abonar el mismo día que se paga.

**18. ¿El planificador de pagos ya pagó las facturas?**
No. Es solo una propuesta y no guarda nada. Registre cada abono en **Cuentas por pagar → Abonar** e imprima o exporte el plan antes de salir de la pantalla.

**19. Un empleado marcó dos veces "Entrada". ¿Cómo borro el fichaje repetido?**
No se borra. La jornada saldrá como **Anomalía**; corríjala en **Jornadas** (6.3).

**20. Un empleado olvidó marcar la salida. ¿Qué hago?**
Espere más de 16 horas, pulse **Barrer huérfanos** (solo Administrador) y corrija la jornada (6.3). No hay proceso automático.

**21. Rechacé un fichaje en la cola de revisión, pero la jornada sigue igual.**
Es correcto: rechazar solo registra su decisión. Corrija además la jornada en **Jornadas** (4.10).

**22. ¿Puedo cambiar el porcentaje de recargo de horas extra?**
No. Los recargos (25 % diurna, 50 % nocturna, 75 % mixta, 150 % festivo) son mínimos fijados por la ley panameña y no son configurables.

**23. ¿"Cobros" es para cobrar a clientes?**
No. GestorPro no maneja clientes. **Cobros** es el adelanto de horas extra a los empleados (4.12). Las ventas se anotan en el Dashboard como cierre de caja.

**24. ¿Qué diferencia hay entre Empleado (rol) y empleado (ficha)?**
El **rol Empleado** es una cuenta de usuario que entra a GestorPro y ve todo en solo lectura. La **ficha de empleado** es el trabajador que ficha en el kiosco; no necesita cuenta. Ver 1.5 y 2.5.

**25. ¿Un empleado con cuenta puede ver los datos de dinero?**
Sí: el rol Empleado ve Dashboard, gastos, pagos, proveedores y deudas. Cree ese tipo de cuenta solo para quien deba verlo (1.5).

**26. ¿Cómo cambio el nombre de un empleado (por ejemplo, se casó)?**
**Empleados → Editar → Guardar cambios**. Los cierres de caja antiguos conservan el nombre con el que se registraron.

**27. Quise desactivar una categoría y me lo impidió.**
Verá **Debe quedar al menos una categoría de "pago a empleado" activa…**. Cree o reactive otra categoría de pago a empleado antes de desactivar esa (2.3).

**28. El empleado pasa la tarjeta QR en el kiosco y sale "Empleado no encontrado o inactivo.".**
Hoy el kiosco reconoce solo el **número de empleado** (por ejemplo E001); la lectura del QR aún no está disponible. Escriba el número y compruebe que el empleado esté **Activo** en **Empleados**.

**29. El kiosco no tiene Internet y los empleados no pueden fichar.**
No hay modo sin conexión. Anote las horas en papel y el supervisor corrige las jornadas al final del día (6.4).

**30. La tablet dice "Dispositivo no configurado".**
Falta el token del kiosco (2.6 y 6.4).

**31. No veo el nombre de la empresa ni puedo cambiar el idioma en el celular.**
En pantallas estrechas esos controles se ocultan. Cambie el idioma desde la pantalla de inicio de sesión o use una pantalla más ancha (7).

**32. Me salió algo en inglés.**
Dos casos normales: **Rate limit exceeded, retry in 1 minute** (demasiados intentos de inicio de sesión; espere un minuto) y una página de error sin menú al escribir una dirección que no existe (pulse "Atrás" o escriba **https://app.gestorpro.us**). Cualquier otro texto en inglés, repórtelo al soporte con una captura.

---

## 9. Glosario

- **Abono**: pago parcial o total a una factura de compra a crédito. Se registra en **Cuentas por pagar → Abonar**.
- **Anomalía**: jornada que el sistema no pudo calcular por fichajes faltantes, repetidos o en desorden. Se corrige en **Jornadas**.
- **Antigüedad**: días transcurridos desde la fecha de emisión de una factura a crédito con saldo pendiente. No es lo mismo que "vencida".
- **Anular**: dejar un movimiento de dinero en cero mediante un reverso, sin borrarlo. Es una de las dos opciones de **Corregir movimiento**.
- **Arqueo**: conteo del dinero de la caja al cerrar el turno, desglosado en Efectivo, Tarjeta, Yappy y Lotería.
- **Auditoría financiera**: registro permanente de todas las correcciones y anulaciones de dinero. Solo se consulta; nunca se borra.
- **B/.**: balboas, moneda de Panamá; 1 balboa = 1 dólar estadounidense.
- **Cajera / Verificador**: roles operativos de un empleado (funciones en la tienda). No son roles del sistema.
- **Cierre de caja (venta diaria)**: registro del total vendido en un turno por una cajera, según el arqueo y Firestec.
- **Cobro anticipado de horas extra**: adelanto de parte del saldo de horas extra de un empleado antes de la quincena.
- **Contado**: factura pagada al recibirla. No genera deuda.
- **Corrección**: anotación nueva con el monto correcto que se crea junto con el reverso cuando se corrige un movimiento.
- **Crédito**: factura con plazo de pago. Genera deuda y aparece en Cuentas por pagar.
- **Empleado**: ficha del trabajador que ficha en el kiosco. No es una cuenta de acceso.
- **Estado de cuenta**: documento de conciliación con un proveedor para un período.
- **Fichaje**: marca de Entrada, Salida comida, Vuelta de comida o Salida hecha en el kiosco. Es permanente.
- **Fichaje de excepción**: fichaje completado con PIN o autorización de supervisor porque la verificación falló. Va a la **Cola de revisión**.
- **Firestec**: sistema externo de punto de venta. GestorPro solo recibe el total del cierre.
- **Flujo de caja**: lista de dinero que entró y salió según lo registrado. No es ganancia ni saldo bancario.
- **Franja nocturna**: de 18:00 a 06:00; define si una jornada es diurna, nocturna o mixta.
- **Huérfano**: fichaje de Entrada sin Salida después de 16 horas; se marca con **Barrer huérfanos**.
- **Inmutable**: que no se puede editar ni borrar. Aplica a gastos, pagos, facturas, cierres, fichajes y correcciones.
- **Jornada**: cálculo diario de horas trabajadas y extra de un empleado a partir de sus fichajes.
- **Kiosco**: tablet o computadora donde los empleados fichan. Requiere un token.
- **Lotería**: premios de lotería pagados a clientes desde el cajón; los billetes premiados suman al total del cierre.
- **Membresía**: acceso de una cuenta de usuario a una empresa concreta (una cuenta puede tener varias).
- **Modo de excepción**: configuración de la sede que define si, al fallar la verificación, el empleado ficha con PIN, con un supervisor, o con cualquiera de los dos.
- **Monto vigente**: lo que vale hoy un movimiento después de correcciones (el monto corregido, o cero si fue anulado).
- **Reverso**: anotación automática que anula un movimiento original por el mismo monto, dejando el original intacto y visible.
- **Rol del sistema**: permiso de una cuenta de usuario: Administrador, Supervisor o Empleado.
- **RUC / NIT**: número de registro fiscal de un proveedor.
- **Saldo de horas extra**: dinero acumulado por horas extra menos los adelantos aprobados; base de los adelantos en **Cobros**. No se reinicia al pagar la quincena.
- **Sede**: cada local o sucursal del negocio.
- **Sobrepago**: pagar más del saldo de una factura. GestorPro lo impide siempre.
- **Token del kiosco**: clave secreta que autoriza a una tablet a enviar fichajes. Se muestra una sola vez y se guarda en el navegador de la tablet.
- **Usuario**: cuenta con correo y contraseña que entra a GestorPro.
- **Vigente / Corregido / Anulado**: estados de un movimiento de dinero según si fue corregido.
- **Yappy**: pagos por transferencia móvil (Banco General) recibidos en caja.

---

## Anexo A: matriz de permisos completa

E = Empleado · S = Supervisor · A = Administrador · P = cuenta de plataforma (proveedor). "Sí" indica que el servidor permite la acción; los enlaces del menú pueden ocultarse aunque la consulta esté permitida, y algunos botones se muestran a roles que el servidor rechaza con **No tiene permiso para esta operación.** (Proveedores, Sedes, Kioscos, Jornadas).

| Función | E | S | A | P |
|---|---|---|---|---|
| Iniciar sesión, cambiar la propia contraseña, cambiar de empresa (si tiene varias) | Sí | Sí | Sí | Sí (sin empresa) |
| Dashboard de ganancias y gastos por categoría (ver) | Sí | Sí | Sí | – |
| Flujo de caja | – | Sí | Sí | – |
| Cierres de caja: consultar | Sí | Sí | Sí | – |
| Cierres de caja: registrar | – | Sí | Sí | – |
| Gastos: ver | Sí | Sí | Sí | – |
| Gastos: registrar | – | Sí | Sí | – |
| Categorías de gasto: ver | Sí | Sí | Sí | – |
| Categorías de gasto: crear, editar, desactivar | – | Sí | Sí | – |
| Proveedores: ver | Sí | Sí | Sí | – |
| Proveedores: crear, editar, desactivar | – | Sí | Sí | – |
| Facturas de compra: ver (Cuentas por pagar, Todas las facturas) | Sí | Sí | Sí | – |
| Facturas de compra: registrar | – | Sí | Sí | – |
| Pagos a proveedor: historial | Sí | Sí | Sí | – |
| Pagos a proveedor: registrar abono | – | Sí | Sí | – |
| Antigüedad de cuentas y estado de cuenta (ver) | Sí | Sí | Sí | – |
| Planificador de pagos | – | Sí | Sí | – |
| Corregir gastos, pagos y cierres (reverso) | – | Sí | Sí | – |
| Auditoría financiera | – | Sí | Sí | – |
| Sedes: ver | Sí | Sí | Sí | – |
| Sedes: crear, editar, desactivar | – | – | Sí | – |
| Empleados: ver | Sí | Sí | Sí | – |
| Empleados: crear, editar, desactivar | – | Sí | Sí | – |
| Empleados: ver/regenerar QR, resetear PIN | – | – | Sí | – |
| Roles operativos: ver | Sí | Sí | Sí | – |
| Kioscos: ver | Sí | Sí | Sí | – |
| Kioscos: crear, regenerar token | – | – | Sí | – |
| Fichar en el kiosco | Público (dispositivo con token) | | | |
| Cola de revisión: validar/rechazar fichajes | – | Sí | Sí | – |
| Jornadas: ver | Sí | Sí | Sí | – |
| Jornadas: corregir | – | Sí | Sí | – |
| Jornadas: barrer huérfanos | – | – | Sí | – |
| Jornada manual (sin fichajes) | Solo el equipo técnico (no hay pantalla) | | | |
| Cobros: ver saldo, solicitar adelanto, ver solicitudes | Sí | Sí | Sí | – |
| Cobros: aprobar / rechazar | – | Sí | Sí | – |
| Cobros: marcar pagado | – | – | Sí | – |
| Cobros: configurar porcentaje y umbral | Solo el equipo técnico (no hay pantalla) | | | |
| Usuarios: listar, crear, cambiar rol, desactivar/reactivar, restablecer contraseña | – | – | Sí | – |
| Plataforma: crear/listar empresas, suspender/reactivar/cancelar, añadir membresía, restablecer administrador | – | – | – | Sí |

Notas:

- La cuenta de plataforma no puede entrar a ninguna empresa ni ver sus datos.
- El cambio de cuentas que pertenecen a varias empresas (contraseña y estado) se hace desde la plataforma, no desde **Usuarios**.

---

## Anexo B: solo para el proveedor de GestorPro (administración de plataforma)

Esta sección es de uso interno del proveedor. El cliente no la necesita para operar.

Existe una cuenta especial de **plataforma** (super-administrador) que **no entra a ninguna empresa**: solo ve la pantalla **Plataforma** (título **Crear empresa**, subtítulo **Alta de un nuevo cliente (empresa) con su primer administrador.**). Desde ahí:

- **Crear empresa**: nombre, **Identificador (slug)** (nombre corto para direcciones: solo minúsculas, números y guiones), nombre y correo del administrador, y **Contraseña inicial** (temporal). Al crearla se generan por defecto las categorías de gasto **Servicios públicos**, **Alquiler**, **Mantenimiento** y **Pago a empleado** (esta última marcada como pago a empleado), los roles operativos **Cajera** y **Verificador**, y la configuración de cobro (80 % cobrable, umbral de aprobación B/. 100).
- Tabla **Empresas** con **Estado** (**Activa** / **Suspendida** / **Cancelada**) y acciones: **Suspender**, **Reactivar**, **Cancelar empresa** (con confirmación en un segundo clic: **¿Confirmar suspensión?** / **¿Cancelar DEFINITIVAMENTE?**), **Añadir membresía** (dar acceso a esta empresa a un usuario que ya existe en otra; el diálogo solo ofrece los roles **Empleado** y **Administrador**) y **Restablecer contraseña del admin** (genera una contraseña temporal que se muestra **una sola vez**, con botón **Copiar**). **Añadir membresía** y **Restablecer contraseña del admin** solo están habilitados si la empresa está **Activa**.

Efecto en el cliente: cuando una empresa se **suspende**, todos sus usuarios son expulsados al momento sin aviso y, al intentar entrar, ven **Credenciales inválidas.** aunque su contraseña sea correcta. **Reactivar** devuelve el acceso sin cambiar contraseñas. **Cancelar** es definitivo. Las empresas nunca se borran.

Si un cliente reporta "no puedo entrar y mi contraseña es correcta", lo primero es comprobar el estado de su empresa.

---

## Anexo C: textos de pantalla desactualizados (para el equipo técnico)

Detectados al contrastar este manual con la aplicación; el manual describe el comportamiento real.

1. **Categorías de gasto**: la ayuda de la casilla **Es categoría de pago a empleado** dice **No se puede cambiar después.**, pero la edición sí acepta el cambio.
2. **Usuarios**: el aviso de **Tu cuenta** dice que la propia contraseña se cambia desde la **barra superior**; está en el menú lateral.
3. **Auditoría financiera → Ver detalle** (pagos): el total de la factura se rotula **Saldo inicial**.
4. **Kiosco**: el subtítulo de **Identificación** invita a "pasar la tarjeta QR", pero el kiosco envía todo como número de empleado y el QR no identifica.
5. Mensaje de segunda corrección: la aplicación tiene el texto **Este movimiento ya fue corregido: no admite otra corrección.** y el servidor responde **El movimiento ya fue corregido: no admite una segunda corrección.**

---

Versión del manual: 2026-08-25 · corresponde a GestorPro en producción (app.gestorpro.us)