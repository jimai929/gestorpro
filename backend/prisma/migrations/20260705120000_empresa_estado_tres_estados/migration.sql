-- B3 — Empresa pasa de boolean `activo` a TRES estados (`estado`):
--   activa     → opera con normalidad (única que permite login/refresh/cambiar-empresa/kiosco)
--   suspendida → bloqueada para el negocio; la plataforma puede reactivarla
--   cancelada  → TERMINAL: sin reactivación por el flujo normal
--
-- Migración ADITIVA (expand-migrate; el contract vendrá después):
--   * NO se elimina `activo`: queda como espejo legacy (true ⟺ activa) para permitir
--     rollback del código sin perder la baja lógica. La fuente de verdad pasa a `estado`.
--   * Backfill EXPLÍCITO e idempotente: activo=false → suspendida (decisión cerrada);
--     activo=true queda `activa` vía el DEFAULT de la columna nueva.
--   * Reversible en frío: DROP COLUMN "estado" + DROP TYPE "EstadoEmpresa" restaura el
--     mundo pre-B3 sin pérdida (el espejo `activo` siguió manteniéndose).

-- CreateEnum
CREATE TYPE "EstadoEmpresa" AS ENUM ('activa', 'suspendida', 'cancelada');

-- AlterTable: las filas existentes nacen 'activa' por el DEFAULT.
ALTER TABLE "empresa" ADD COLUMN "estado" "EstadoEmpresa" NOT NULL DEFAULT 'activa';

-- Backfill: la baja lógica previa (activo=false) se mapea a 'suspendida' (recuperable
-- desde plataforma), NUNCA a 'cancelada' (terminal). Idempotente: re-ejecutarlo no
-- degrada un estado posterior porque solo toca filas aún en 'activa'.
UPDATE "empresa" SET "estado" = 'suspendida' WHERE "activo" = false AND "estado" = 'activa';
