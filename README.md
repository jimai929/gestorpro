# GestorPro

App de administración para empresas de retail en Panamá. Maneja dos áreas:
**finanzas** (cuentas por pagar a proveedores, gastos, dashboard de
ganancias) y **asistencia** (fichaje en kiosco, motor de jornada laboral,
cobro anticipado de horas extra).

No es un POS y no maneja inventario — eso lo cubre Firestec, un sistema
externo. GestorPro cubre lo que Firestec no: el control financiero de
proveedores y gastos, y el control de asistencia del personal.

---

## Stack

Node.js + TypeScript + Fastify · Prisma ORM + PostgreSQL · React + Vite ·
Auth JWT con refresh · Vitest + Testcontainers · Despliegue híbrido.

---

## El paquete de documentación

Leer en este orden:

1. **`PLAN_DE_CONSTRUCCION.md`** — el plan maestro. Las 7 fases, en qué
   orden se construyen y por qué.
2. **`ESTRUCTURA_DE_CARPETAS.md`** — el árbol completo del proyecto y dónde
   va cada archivo.
3. **`DECISIONES.md`** — todas las decisiones de diseño ya cerradas. Leer
   antes de cuestionar cualquier elección: probablemente ya se discutió.
4. **`BRIEF_FASE_0.md`** — detalle de las fundaciones (scaffold, núcleo de
   datos, autenticación). Lo PRIMERO que se construye.
5. **`BRIEF_BLOQUE_1.md`** — detalle del área de finanzas (Fases 1–3).
6. **`BRIEF_BLOQUE_2.md`** — detalle del área de asistencia (Fases 4–6).

Estos documentos van en la carpeta `docs/` del proyecto.

---

## Cómo arrancar

1. Correr `crear-estructura.ps1` desde `C:\Users\jimfe\dev` — crea la
   carpeta `gestorpro` con toda la estructura.
2. Colocar los documentos `.md` en `docs/`.
3. Colocar `.gitignore`, `.env.example` y `CLAUDE.md` en la raíz. Copiar
   `.env.example` como `.env` y rellenar los valores reales (el `.env` no
   se versiona). El `CLAUDE.md` lo lee Claude Code automáticamente.
4. Colocar los archivos de código ya generados del área de finanzas en su
   ubicación (ver `ESTRUCTURA_DE_CARPETAS.md`).
5. `cd gestorpro && git init` — primer commit con el esqueleto.
6. Ejecutar la **Fase 0** siguiendo `BRIEF_FASE_0.md`.
7. Seguir fase por fase según `PLAN_DE_CONSTRUCCION.md`.

---

## Orden de construcción

| Fase | Entrega | Documento de detalle |
|------|---------|----------------------|
| 0 | Fundaciones: scaffold, núcleo, auth | `BRIEF_FASE_0.md` |
| 1 | Cuentas por pagar | `BRIEF_BLOQUE_1.md` |
| 2 | Gastos | `BRIEF_BLOQUE_1.md` |
| 3 | Dashboard de ganancias | `BRIEF_BLOQUE_1.md` |
| 4 | Fichaje y kioscos | `BRIEF_BLOQUE_2.md` |
| 5 | Motor de jornada | `BRIEF_BLOQUE_2.md` |
| 6 | Cobro anticipado de horas extra | `BRIEF_BLOQUE_2.md` |

El área de finanzas (Fases 1–3) se construye, despliega y pone en uso real
antes de empezar la de asistencia (Fases 4–6).

---

## Pendientes que no dependen del código

- **Verificar `gestorpro.com`** en un registrador, y evaluar el registro de
  la marca en Panamá.
- **Firestec:** ✅ RESUELTO (2026-06-17) — captura de ventas 100 % manual;
  Firestec no tiene API y no se integra.
- **Validación legal:** ✅ VALIDADO (2026-06-17) — un asesor laboral panameño
  confirmó las reglas de jornada y festivos (11 parámetros, sin cambios). Ver
  `docs/VALIDACION_LEGAL.md`.

---

## Nota sobre el entorno

El proyecto se crea hoy en Windows y migra a Mac como máquina principal.
La migración se hace vía Git: `git push` desde Windows, `git clone` en el
Mac. El código viaja limpio; solo se reconfigura el entorno local.
