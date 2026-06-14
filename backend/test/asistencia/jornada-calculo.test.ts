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

  it('extra diurna: recargo 25% y monto en dinero', () => {
    // 07:00–17:00 sin pausa = 10h → 8h ord + 2h extra. Salario 1200 → valorHora 5.
    const r = calcularJornada(
      [
        { tipo: 'entrada', momento: h(7) },
        { tipo: 'salida', momento: h(17) },
      ],
      { salarioMensual: 1200 },
    );
    expect(r.clasificacion).toBe('diurna');
    expect(r.minutosExtra).toBe(120);
    expect(r.recargo).toBe(0.25);
    expect(r.montoExtra).toBe(12.5); // 2h × 5 × 1.25
  });

  it('turno nocturno que cruza medianoche: clasificación nocturna y recargo 50%', () => {
    // 22:00 → 06:00 del día siguiente = 8h, todo nocturno, sin pausa.
    const r = calcularJornada(
      [
        { tipo: 'entrada', momento: new Date(2026, 2, 10, 22, 0) },
        { tipo: 'salida', momento: new Date(2026, 2, 11, 6, 0) },
      ],
      { salarioMensual: 1200 },
    );
    expect(r.clasificacion).toBe('nocturna');
    expect(r.minutosTrabajados).toBe(480);
    expect(r.minutosExtra).toBe(60); // 8h − 7h legal nocturna
    expect(r.recargo).toBe(0.5);
    expect(r.montoExtra).toBe(7.5); // 1h × 5 × 1.50
  });

  it('festivo trabajado: recargo 150% sobre la extra', () => {
    const r = calcularJornada(
      [
        { tipo: 'entrada', momento: h(7) },
        { tipo: 'salida', momento: h(17) },
      ],
      { salarioMensual: 1200, esFestivo: true },
    );
    expect(r.esFestivo).toBe(true);
    expect(r.recargo).toBe(1.5);
    expect(r.montoExtra).toBe(25); // 2h × 5 × 2.50
  });

  it('jornada mixta: recargo 75%', () => {
    // 15:00–23:00 = 8h: 3h diurnas (15–18) + 5h nocturnas (18–23) → mixta.
    const r = calcularJornada(
      [
        { tipo: 'entrada', momento: h(15) },
        { tipo: 'salida', momento: h(23) },
      ],
      { salarioMensual: 1200 },
    );
    expect(r.clasificacion).toBe('mixta');
    expect(r.minutosExtra).toBe(30); // 8h − 7.5h legal mixta
    expect(r.recargo).toBe(0.75);
    expect(r.montoExtra).toBe(4.38); // 0.5h × 5 × 1.75
  });

  // Nota: "festivo NO trabajado → sin descuento" es inherente al motor: no aplica
  // descuentos por ausencia (salario fijo); solo añade pago extra. Sin jornada no
  // hay efecto, que es justamente el comportamiento requerido.

  it('aplica el tope diario de 3h de extra', () => {
    // 06:00–18:00 sin pausa = 12h → 8h ord + 4h extra, pero solo 3h son pagables.
    const r = calcularJornada(
      [
        { tipo: 'entrada', momento: h(6) },
        { tipo: 'salida', momento: h(18) },
      ],
      { salarioMensual: 1200 },
    );
    expect(r.minutosExtra).toBe(240);
    expect(r.topeDiaExcedido).toBe(true);
    expect(r.minutosExtraPagables).toBe(180);
    expect(r.montoExtra).toBe(18.75); // 3h × 5 × 1.25
  });

  it('sin previos semanales no marca el tope semanal', () => {
    const r = calcularJornada(jornadaCompleta(7, 11, 12, 18)); // 2h extra
    expect(r.minutosExtra).toBe(120);
    expect(r.topeSemanaExcedido).toBe(false);
  });

  it('aplica el tope semanal de 9h de extra pagable', () => {
    // 06:00–18:00 = 12h → 4h extra, 3h pagables por el tope diario. Pero ya hay
    // 8h (480 min) pagables esta semana → solo queda 1h (60 min) del tope semanal.
    const r = calcularJornada(
      [
        { tipo: 'entrada', momento: h(6) },
        { tipo: 'salida', momento: h(18) },
      ],
      { salarioMensual: 1200, minutosExtraPagablesSemanaPrevios: 480 },
    );
    expect(r.topeSemanaExcedido).toBe(true);
    expect(r.minutosExtraPagables).toBe(60); // 540 semanal − 480 previos
    expect(r.montoExtra).toBe(6.25); // 1h × 5 × 1.25
  });

  it('agotado el tope semanal, no se paga más extra (pagable 0)', () => {
    const r = calcularJornada(
      [
        { tipo: 'entrada', momento: h(7) },
        { tipo: 'salida', momento: h(18) }, // 2h extra
      ],
      { salarioMensual: 1200, minutosExtraPagablesSemanaPrevios: 540 },
    );
    expect(r.topeSemanaExcedido).toBe(true);
    expect(r.minutosExtraPagables).toBe(0);
    expect(r.montoExtra).toBe(0);
  });
});
