# GestorPro — Convenciones de código y de proceso

Convenciones de implementación y de trabajo. Complementa `docs/DECISIONES.md`
(decisiones de diseño del producto) y `docs/ESTRUCTURA_DE_CARPETAS.md` (dónde va
cada archivo). Lo de aquí aplica siempre, sin tener que recordarlo en cada tarea.

## Frontend

- **Formularios reutilizables/embebibles: nunca un `<form>` anidado.** Un
  `<form>` dentro de otro es HTML inválido; el navegador dispara un *submit*
  nativo (recarga la página) en vez del handler de React, y la petición no se
  envía. Los formularios de gestión (alta/edición) se construyen con `<div>` + un
  botón `type="button"` con `onClick` que valida y llama al servicio — nunca con
  `<form>`. (Origen: bug del alta inline de proveedor, diagnosticado 2026-05-29.)
- **Manejo de errores en mutaciones.** Toda mutación (POST/PUT/DELETE) debe:
  (1) capturar el error explícitamente; (2) mostrarlo al usuario **en la UI**
  (no solo en consola); (3) **no cerrar modales ni redirigir antes de confirmar
  el éxito** (el cierre/redirección solo ocurre en la rama de éxito); y (4) tener
  un **test que simule el fallo del backend** y verifique que el error se muestra
  y la UI no se cierra. (Origen: `rotarQr` que tragaba el error y el alta inline
  de proveedor que se "perdía" en un fallo, 2026-05-30.)

## Verificación

- **El verificable de cada parte se ejecuta DESDE LA UI del navegador, no solo
  por API.** Cualquier acción del verificable (alta, edición, baja, regenerar,
  reset…) debe haberse ejecutado con **clicks reales en la UI** — no con
  curl/HTTPie/Postman/Invoke-RestMethod. Probar solo por API esconde bugs de
  integración que solo aparecen en el navegador: CORS, validación del front,
  estado del formulario, manejo de errores en la UI. (Origen: el bug de CORS que
  no permitía `PUT` no se detectó en el verificable de la parte (a) Sedes porque
  las acciones de sede se probaron por API y no por UI; se destapó hasta la parte
  (b). Ver `docs/BUGS_PREEXISTENTES.md`.)
- **Revisión adversarial proactiva** del diff antes de cerrar cada parte: un
  workflow que revisa por dimensiones, verifica cada hallazgo de forma
  adversarial, y reporta solo los confirmados. Los hallazgos confirmados se
  arreglan antes de commitear y se reportan en el cierre de la parte.

## Bugs preexistentes

- Un bug preexistente que un verificable destape se reporta **aparte** del
  trabajo principal (en lo posible, no se mezcla en el mismo commit) y se anota
  en `docs/BUGS_PREEXISTENTES.md` con síntoma, causa, alcance y arreglo.
