import { describe, it, expect } from 'vitest';
import {
  calcularJornada,
  type FichajeCalculo,
} from '../../src/asistencia/jornada/calculo.js';

// Construye una fecha en hora LOCAL (el motor clasifica por getHours()).
const h = (hora: number, min = 0): Date => new Date(2026, 2, 10, hora, min);

function jornadaCompleta(
  entrada: number,
  salidaComida: number,
  entradaComida: number,
  salida: number,
): FichajeCalculo[] {
  return [
    { tipo: 'entrada', momento: h(entrada) },
    { tipo: 'salida_comida', momento: h(salidaComida) },
    { tipo: 'entrada_comida', momento: h(entradaComida) },
    { tipo: 'salida', momento: h(salida) },
  ];
}

describe('cálculo de jornada', () => {
  it('jornada diurna 8h con pausa de comida medida de 1h', () => {
    // 08:00 entra, 12:00–13:00 comida, 17:00 sale → 9h presencia − 1h pausa = 8h.
    const r = calcularJornada(jornadaCompleta(8, 12, 13, 17));
    expect(r.anomalia).toBe(false);
    expect(r.minutosPresencia).toBe(540);
    expect(r.minutosPausa).toBe(60);
    expect(r.minutosTrabajados).toBe(480);
    expect(r.clasificacion).toBe('diurna');
    expect(r.minutosOrdinarios).toBe(480);
    expect(r.minutosExtra).toBe(0);
  });

  it('jornada diurna con horas extra (sobre las 8h legales)', () => {
    // 07:00–18:00 con 1h de pausa = 10h trabajadas → 8h ordinarias + 2h extra.
    // Termina justo en el borde nocturno (18:00) sin entrar en él: sigue diurna.
    const r = calcularJornada(jornadaCompleta(7, 11, 12, 18));
    expect(r.anomalia).toBe(false);
    expect(r.minutosTrabajados).toBe(600);
    expect(r.minutosOrdinarios).toBe(480);
    expect(r.minutosExtra).toBe(120);
    expect(r.clasificacion).toBe('diurna');
  });

  it('sin fichajes de comida usa la pausa por defecto del turno', () => {
    const r = calcularJornada(
      [
        { tipo: 'entrada', momento: h(8) },
        { tipo: 'salida', momento: h(17) },
      ],
      { pausaPorDefectoMin: 60 },
    );
    expect(r.anomalia).toBe(false);
    expect(r.minutosPausa).toBe(60);
    expect(r.minutosTrabajados).toBe(480);
  });

  it('marca anomalía si los fichajes de comida están incompletos', () => {
    const r = calcularJornada([
      { tipo: 'entrada', momento: h(8) },
      { tipo: 'salida_comida', momento: h(12) }, // salió a comer, no fichó la vuelta
      { tipo: 'salida', momento: h(17) },
    ]);
    expect(r.anomalia).toBe(true);
    expect(r.detalleAnomalia).toMatch(/comida/i);
  });

  it('marca anomalía si falta el fichaje de salida', () => {
    const r = calcularJornada([{ tipo: 'entrada', momento: h(8) }]);
    expect(r.anomalia).toBe(true);
  });
});
