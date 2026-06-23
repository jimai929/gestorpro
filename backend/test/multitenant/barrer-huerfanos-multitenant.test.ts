import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { semilla, cerrarSemilla } from '../helpers/db.js';
import { sembrarDosEmpresas, type DosEmpresas } from './_fixture-dos-empresas.js';
import { barrerHuerfanos } from '../../src/asistencia/jornada/jornada.service.js';

/**
 * (job) `barrerHuerfanos` multi-tenant (Fase 8, regresión del bloqueante B2). El
 * job NO corre dentro de una request: itera las empresas activas y procesa cada
 * una en su PROPIA `txEmpresa({empresaId})`. Antes barría todas las sedes sin
 * contexto; bajo RLS eso daría 0 filas y reportaría `marcadas:0` EN SILENCIO. Aquí
 * se siembra un fichaje huérfano (entrada sin salida, pasada la ventana de 16h) en
 * A y en B, y se exige que el job marque la anomalía en AMBAS empresas.
 */
describe('Fase 8 (job) — barrerHuerfanos marca anomalías en TODAS las empresas', () => {
  let f: DosEmpresas;
  const fechaHuerfana = new Date('2026-01-01T08:00:00Z'); // muy anterior a `ahora`
  const ahora = new Date('2026-01-03T00:00:00Z'); // > 16h después → huérfano

  beforeAll(async () => {
    f = await sembrarDosEmpresas();
    // Entrada sin salida en A y en B, en una fecha SIN jornada previa.
    for (const e of [f.A, f.B]) {
      await semilla().fichaje.create({
        data: {
          empleadoId: e.empleadoId,
          kioscoId: e.kioscoId,
          tipo: 'entrada',
          momento: fechaHuerfana,
        },
      });
    }
  });
  afterAll(async () => {
    await cerrarSemilla();
  });

  it('marca la jornada-anomalía del huérfano en A y en B (no marcadas:0 silencioso)', async () => {
    const marcadas = await barrerHuerfanos(ahora);
    expect(marcadas).toBeGreaterThanOrEqual(2);

    for (const e of [f.A, f.B]) {
      const jornada = await semilla().jornada.findUnique({
        where: { empleadoId_fecha: { empleadoId: e.empleadoId, fecha: new Date('2026-01-01') } },
      });
      expect(jornada).not.toBeNull();
      expect(jornada?.anomalia).toBe(true);
      expect(jornada?.estado).toBe('anomalia');
    }
  });
});
