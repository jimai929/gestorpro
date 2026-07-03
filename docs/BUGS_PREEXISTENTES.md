# Bugs preexistentes destapados por verificables

Registro de bugs que **ya existían** en el código y que un verificable destapó.
Sirve para distinguirlos del trabajo nuevo, darles trazabilidad y recordar por
qué un cambio "menor" formó parte de otra parte del trabajo.

---

## CORS no permitía métodos de escritura (PUT/PATCH/DELETE)

- **Fecha:** 2026-05-30. **Destapado en:** verificable de la parte (b) Empleados
  (al **desactivar** un empleado desde la UI).
- **Síntoma:** toda edición/baja desde el navegador fallaba con
  `Access to fetch … blocked by CORS policy: Method PUT is not allowed by
  Access-Control-Allow-Methods in preflight response`. En la UI se veía como
  "Failed to fetch".
- **Causa:** la config de `@fastify/cors` en `backend/src/app.ts` solo fijaba
  `origin`, sin `methods`; el preflight `OPTIONS` no incluía PUT/PATCH/DELETE.
- **Alcance:** afectaba a **proveedores, sedes y empleados** (cualquier
  `PUT`/`DELETE` desde el front). No se había detectado antes porque esas
  acciones se habían probado **por API** (PowerShell/Invoke-RestMethod, sin
  CORS), no por UI — justo lo que motiva la convención de verificar por UI
  (`docs/CONVENCIONES.md`).
- **Arreglo:** `methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS']` en la
  config de CORS. Incluido en el commit de la parte (b) `90a9613` (no había un
  commit separado limpio porque bloqueaba el verificable de esa misma parte).

---

## PENDIENTE (parte e): barrido adversarial de los módulos viejos

- **Qué falta:** un barrido adversarial de los módulos **anteriores** (cobro,
  factura/compras, gastos, proveedores) buscando el **mismo patrón de error
  silenciado** que se halló en `rotarQr` y en el alta inline de proveedor:
  mutaciones (POST/PUT/DELETE) que no muestran el error en la UI, que cierran
  modales/redirigen antes de confirmar éxito, o que no tienen test de fallo del
  backend (ver la convención en `docs/CONVENCIONES.md`).
- **Cuándo:** se hace en la **parte (e)** del paquete de Administración.
- **Estado:** PENDIENTE.

---

## Lockout de login para usuario multi-membresía con la PREDETERMINADA dada de baja

- **Qué:** `resolverContextoActivo` (auth.service.ts) resuelve el login SIN
  fallback: toma `membresias[0]` (predeterminada primero) y, si ESA empresa está
  inactiva, lanza `ErrorAutenticacion` sin probar la siguiente membresía activa.
  Un usuario con predeterminada en la empresa A (dada de baja) y membresía en B
  (activa) queda bloqueado de TODOS sus tenants — la baja de A lo saca también
  de B — hasta reactivar A o cambiar la predeterminada a mano.
- **Alcance real hoy:** INALCANZABLE por API — ningún endpoint crea segundas
  membresías (email UNIQUE global; las altas siempre crean usuario nuevo). Solo
  aparece con estado sembrado a mano. Dirección fail-closed: no expone datos,
  es denegación de servicio.
- **Detectado:** revisión adversarial de la baja de empresas (2026-07-02), que
  vuelve el estado "empresa inactiva" alcanzable en producto.
- **Arreglo previsto:** en el slice del selector multi-membresía (backlog 4c),
  donde el fallback a la siguiente membresía activa (o la elección explícita)
  es parte natural del diseño. No parchear antes: cambiaría la semántica de
  login sin la UI que la acompaña.
- **Nota I5 (2026-07-03):** el check por-request de I5 eliminó el único escape
  que quedaba (usar el access token residual ≤15 min para `cambiar-empresa`
  hacia la empresa B activa). El lockout de este estado manual ahora es total
  hasta intervención en BD — una razón más para resolverlo con el selector.
- **Estado:** PENDIENTE (documentado; sin camino de producto que lo dispare).
