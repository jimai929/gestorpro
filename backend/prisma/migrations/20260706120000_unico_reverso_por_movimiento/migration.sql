-- Regla "sin doble corrección" a nivel de BD (respaldo del guard del servicio de
-- corrección): un movimiento `normal` admite A LO SUMO un asiento de `reverso`.
--
-- ─── SQL manual (no gestionado por Prisma) ──────────────────────────────────
-- Índices únicos PARCIALES (Prisma no soporta unique parcial, igual que
-- uq_venta_normal): viven solo aquí y los protege contra drift el guardarraíl
-- test/core/indices-parciales.test.ts.
--
-- corrige_id NULL no choca (NULLS DISTINCT por defecto): la unicidad solo aplica
-- a reversos reales, que siempre llevan corrige_id. 100% additive y reversible
-- en frío (DROP INDEX x3); no toca datos. Si ya existieran reversos duplicados
-- (violación histórica de la regla), el CREATE falla: eso es deliberado — hay
-- que sanear ANTES, nunca taparlo.
CREATE UNIQUE INDEX "uq_pago_reverso_unico" ON "pago_proveedor" ("corrige_id") WHERE "tipo" = 'reverso';
CREATE UNIQUE INDEX "uq_gasto_reverso_unico" ON "gasto" ("corrige_id") WHERE "tipo" = 'reverso';
CREATE UNIQUE INDEX "uq_venta_reverso_unico" ON "venta_diaria" ("corrige_id") WHERE "tipo" = 'reverso';
