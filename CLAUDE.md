# CLAUDE.md

Instrucciones para Claude Code al trabajar en este proyecto. Archivo corto y
permanente: las reglas de aquí aplican siempre. El detalle de cada parte
está en los documentos de `docs/` — este archivo apunta a ellos, no los
repite.

---

## Qué es GestorPro

App de administración para empresas de retail en Panamá. Una sola app con
dos áreas: **finanzas** (cuentas por pagar, gastos, dashboard) y
**asistencia** (fichaje, jornada, cobro de horas extra). No es un POS ni
maneja inventario — eso lo cubre Firestec, un sistema externo.

## Stack

Node.js + TypeScript (estricto) + Fastify · Prisma + PostgreSQL · React +
Vite · JWT con refresh · Vitest + Testcontainers.

## Antes de escribir código, leer

- `docs/PLAN_DE_CONSTRUCCION.md` — las 7 fases y su orden.
- `docs/DECISIONES.md` — todas las decisiones de diseño ya cerradas.
- `docs/BRIEF_FASE_0.md`, `docs/BRIEF_BLOQUE_1.md`, `docs/BRIEF_BLOQUE_2.md`
  — el detalle de cada fase.
- `docs/ESTRUCTURA_DE_CARPETAS.md` — dónde va cada archivo.
- `docs/CONVENCIONES.md` — convenciones de código y de proceso (formularios,
  verificación por UI, revisión adversarial).
- `docs/BUGS_PREEXISTENTES.md` — bugs preexistentes destapados por verificables.

Construir en el orden del plan: Fase 0 primero, luego 1 → 6. No saltarse
fases.

---

## Reglas de trabajo

### Idioma y estilo
- Código, comentarios y nombres de variables en español.
- Comentarios solo donde aportan; documentación técnica estilo JSDoc.
- TypeScript en modo estricto. Nada de `any` sin justificación.

### Decisiones ya cerradas — NO reabrir
Las decisiones de diseño están en `docs/DECISIONES.md`. Están cerradas tras
discusión. No reabrirlas ni "mejorarlas" sin que el responsable lo pida
explícitamente. Si algo parece un error, primero revisar si ya se decidió y
por qué.

### Seguridad — innegociable
- Contraseñas y PINs SIEMPRE hasheados (bcrypt o argon2). Nunca texto plano,
  nunca en logs.
- El `usuarioId` de cualquier operación sale del token JWT (`request.user`),
  NUNCA del body de la petición.
- Secretos (JWT, base de datos, API keys) viven en `.env`, jamás en el
  código. El `.env` nunca se commitea.
- Los recargos legales (25/50/75/150%) son FIJOS. No crear ninguna opción
  que permita pagar bajo el mínimo legal.

### Integridad de datos — innegociable
- Los movimientos de dinero (Gasto, PagoProveedor, VentaDiaria) son
  inmutables: no se editan ni se borran. Se corrigen con el servicio de
  corrección (reverso + corrección).
- La `Auditoria` es append-only: solo inserción.
- Dinero siempre en `Decimal`, nunca `Float`.
- El `Fichaje` es inmutable; la `Jornada` se recalcula; la `Correccion` es
  inmutable.

### Calidad
- Código modular y DRY. Si algo se repite tres veces, abstraerlo.
- Manejo de errores explícito (try/catch) en rutas y servicios.
- Las tareas que tocan dinero o saldos van en transacciones.
- Escribir tests para la lógica crítica (corrección, cálculo de jornada,
  saldos). Los tests corren contra PostgreSQL real vía Testcontainers.

### Flujo de trabajo
- Antes de una tarea grande o una decisión de arquitectura: proponer un
  plan breve y esperar confirmación. No generar código a ciegas.
- Si falta contexto sobre estructura de archivos o datos, pedirlo — no
  asumir.
- Commits con mensajes claros en español.

---

## Pendientes abiertos (ver docs/DECISIONES.md)

- Firestec: confirmar si imprime el total de ventas diario (afecta Fase 3).
- Validación legal de las reglas de jornada por un asesor laboral panameño
  antes de producción de la Fase 5.

## Entorno

El proyecto nació en Windows y migra a Mac vía Git. Mientras el desarrollo
sea en Windows: usar PowerShell 7, no comandos bash/Linux.
