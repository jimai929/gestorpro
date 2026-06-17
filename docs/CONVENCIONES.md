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

## Internacionalización (i18n)

La UI soporta **español / inglés / chino** (es/en/zh), por defecto **español**.
Solución ligera propia, **sin dependencias** (no react-i18next), en
`frontend/src/core/i18n/`.

- **Solo se traduce texto de UI.** Los mensajes del backend (`{ mensaje }`) y los
  DATOS (categorías, roles operativos, nombres de empleado/sede, montos `B/.`)
  quedan en español. No traducir datos del dominio.
- **Cómo se usa:** `const { t } = useTraduccion();` y `t('clave', { var })` con
  interpolación `{var}`. Para enums/etiquetas: `t(\`asi.tipo.${valor}\`)`.
- **Diccionarios:** claves base (`comun.*`, `rol.*`, `nav.*`, `login.*`,
  `inicio.*`) en `idiomas.ts`; por módulo en `modulos/{finanzas,administracion,
  asistencia}.ts` con prefijos `fin.` / `adm.` / `asi.`. Reutilizar `comun.*`
  para palabras genéricas (Cancelar, Guardar, Cerrar…) en vez de duplicar.
- **REGLA al añadir claves (no romper tests):** el valor `es` de cada clave debe
  ser **idéntico** al texto original (acentos, `…`, puntuación). Los tests montan
  componentes SIN proveedor y el contexto cae a `es` por defecto, así afirman las
  cadenas en español. Las tres lenguas deben tener el MISMO conjunto de claves.
  Nunca modificar los `*.test.tsx` para acomodar i18n.
- **`t` es estable** (deps `[]`, lee el idioma de un ref): se puede incluir en las
  dependencias de `useEffect`/`useCallback` sin re-ejecutar al cambiar de idioma.
- En `.map`, no nombrar el item `t` (sombrea el hook): usar otro nombre.

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
