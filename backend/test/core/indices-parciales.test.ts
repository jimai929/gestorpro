import { describe, it, expect } from 'vitest';
import { prisma } from '../../src/core/prisma.js';

/**
 * GUARDARRAÍL DE DRIFT (protección activa, no solo documentación).
 *
 * Los índices únicos PARCIALES no viven en el schema declarativo de Prisma (no
 * soporta unique parcial); son SQL manual en las migraciones. Si una futura
 * `prisma migrate dev` los dropea por drift, ESTOS tests fallan — y atajan el
 * problema antes de que llegue a producción.
 *
 * Se valida contra `pg_indexes`: que el índice exista, sea UNIQUE, esté sobre la
 * tabla correcta y conserve su cláusula WHERE parcial.
 */
async function definicionIndice(nombre: string): Promise<string | null> {
  const filas = await prisma.$queryRaw<Array<{ indexdef: string }>>`
    SELECT indexdef FROM pg_indexes WHERE indexname = ${nombre}`;
  return filas[0]?.indexdef ?? null;
}

describe('índices parciales críticos (fuera del schema declarativo)', () => {
  it('uq_caja_sede_numero_activa existe, es único y parcial sobre activas', async () => {
    const def = await definicionIndice('uq_caja_sede_numero_activa');
    expect(def, 'el índice no existe (¿lo borró un drift?)').not.toBeNull();
    expect(def!).toMatch(/UNIQUE INDEX/i);
    expect(def!).toMatch(/ON\s+\S*caja\b/i);
    expect(def!).toMatch(/WHERE\s+\(activo = true\)/i);
  });

  it('uq_venta_normal existe, es único y parcial sobre tipo = normal', async () => {
    const def = await definicionIndice('uq_venta_normal');
    expect(def, 'el índice no existe (¿lo borró un drift?)').not.toBeNull();
    expect(def!).toMatch(/UNIQUE INDEX/i);
    expect(def!).toMatch(/ON\s+\S*venta_diaria\b/i);
    expect(def!).toMatch(/WHERE\s+\(tipo = 'normal'/i);
  });
});
