import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DialogoCorreccion } from './DialogoCorreccion';
import * as servicio from './servicioCorrecciones';
import { ErrorHttp } from '../../core/api';

vi.mock('./servicioCorrecciones');

beforeEach(() => {
  vi.clearAllMocks();
});

function montarGasto(props: { onCorregido?: () => void; onCerrar?: () => void } = {}) {
  render(
    <DialogoCorreccion
      entidad="gasto"
      movimientoId="g1"
      descripcion="Alquiler · 01/06/2026"
      montoOriginal={150}
      onCerrar={props.onCerrar ?? vi.fn()}
      onCorregido={props.onCorregido ?? vi.fn()}
    />,
  );
  return userEvent.setup();
}

describe('DialogoCorreccion — gasto (monto único)', () => {
  it('sin motivo NO se puede enviar (el motivo va a la auditoría)', async () => {
    montarGasto();
    expect(
      (screen.getByRole('button', { name: 'Registrar corrección' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(servicio.corregirMovimiento).not.toHaveBeenCalled();
  });

  it('corregir el importe envía montoCorregido + motivo y solo entonces avisa al padre', async () => {
    const onCorregido = vi.fn();
    vi.mocked(servicio.corregirMovimiento).mockResolvedValue({
      reverso: { id: 'r1', tipo: 'reverso' },
      correccion: { id: 'c1', tipo: 'correccion' },
    });
    const user = montarGasto({ onCorregido });

    // El monto viene precargado con el original: se corrige a 15.
    const monto = screen.getByRole('spinbutton');
    await user.clear(monto);
    await user.type(monto, '15');
    await user.type(screen.getByLabelText('Motivo *'), 'Se tecleó 150 en vez de 15');
    expect(onCorregido).not.toHaveBeenCalled(); // aún no se envió

    await user.click(screen.getByRole('button', { name: 'Registrar corrección' }));

    await waitFor(() =>
      expect(servicio.corregirMovimiento).toHaveBeenCalledWith({
        entidad: 'gasto',
        movimientoId: 'g1',
        motivo: 'Se tecleó 150 en vez de 15',
        montoCorregido: 15,
      }),
    );
    expect(onCorregido).toHaveBeenCalledTimes(1);
  });

  it('ANULAR envía solo el motivo (sin montoCorregido): anulación pura', async () => {
    vi.mocked(servicio.corregirMovimiento).mockResolvedValue({
      reverso: { id: 'r1', tipo: 'reverso' },
      correccion: null,
    });
    const user = montarGasto();

    await user.click(screen.getByRole('radio', { name: /anular el movimiento/i }));
    await user.type(screen.getByLabelText('Motivo *'), 'Gasto duplicado');
    await user.click(screen.getByRole('button', { name: 'Anular movimiento' }));

    await waitFor(() =>
      expect(servicio.corregirMovimiento).toHaveBeenCalledWith({
        entidad: 'gasto',
        movimientoId: 'g1',
        motivo: 'Gasto duplicado',
      }),
    );
    // El campo de monto no se envía ni se muestra en modo anular.
    expect(screen.queryByRole('spinbutton')).toBeNull();
  });

  it('si el backend rechaza (409 ya corregido) el error se ve, NO avisa al padre y se puede reintentar', async () => {
    const onCorregido = vi.fn();
    vi.mocked(servicio.corregirMovimiento).mockRejectedValue(
      new ErrorHttp(409, 'El movimiento ya fue corregido: no admite una segunda corrección.'),
    );
    const user = montarGasto({ onCorregido });

    await user.type(screen.getByLabelText('Motivo *'), 'Monto equivocado');
    await user.click(screen.getByRole('button', { name: 'Registrar corrección' }));

    expect(
      await screen.findByText('El movimiento ya fue corregido: no admite una segunda corrección.'),
    ).toBeTruthy();
    expect(onCorregido).not.toHaveBeenCalled(); // el diálogo NO se cierra ni anuncia éxito
    expect(
      (screen.getByRole('button', { name: 'Registrar corrección' }) as HTMLButtonElement).disabled,
    ).toBe(false); // reintentable
  });

  it('mientras envía, el botón queda deshabilitado (no hay doble corrección por doble clic)', async () => {
    let resolver: (v: servicio.ResultadoCorreccion) => void = () => {};
    vi.mocked(servicio.corregirMovimiento).mockReturnValue(
      new Promise((res) => { resolver = res; }),
    );
    const user = montarGasto();

    await user.type(screen.getByLabelText('Motivo *'), 'Monto equivocado');
    await user.click(screen.getByRole('button', { name: 'Registrar corrección' }));

    await waitFor(() =>
      expect(
        (screen.getByRole('button', { name: 'Registrar corrección' }) as HTMLButtonElement).disabled,
      ).toBe(true),
    );
    await user.click(screen.getByRole('button', { name: 'Registrar corrección' }));
    expect(servicio.corregirMovimiento).toHaveBeenCalledTimes(1);

    resolver({ reverso: { id: 'r1', tipo: 'reverso' }, correccion: null });
  });
});

describe('DialogoCorreccion — cierre de caja (arqueo por tipo)', () => {
  function montarVenta(onCorregido = vi.fn()) {
    render(
      <DialogoCorreccion
        entidad="venta"
        movimientoId="v1"
        descripcion="01/06/2026 · Mañana · E001 - María"
        montoOriginal={300}
        arqueoOriginal={[
          { tipoArqueo: 'efectivo', monto: 200 },
          { tipoArqueo: 'tarjeta', monto: 100 },
        ]}
        onCerrar={vi.fn()}
        onCorregido={onCorregido}
      />,
    );
    return userEvent.setup();
  }

  it('precarga el arqueo vigente y envía el arqueo corregido completo (no un monto suelto)', async () => {
    vi.mocked(servicio.corregirMovimiento).mockResolvedValue({
      reverso: { id: 'r1', tipo: 'reverso' },
      correccion: { id: 'c1', tipo: 'correccion' },
    });
    const user = montarVenta();

    // Los campos vienen con el arqueo vigente: efectivo 200, tarjeta 100.
    const efectivo = screen.getByLabelText('Efectivo');
    expect((efectivo as HTMLInputElement).value).toBe('200');
    expect((screen.getByLabelText('Tarjeta') as HTMLInputElement).value).toBe('100');

    await user.clear(efectivo);
    await user.type(efectivo, '180');
    await user.type(screen.getByLabelText('Motivo *'), 'Faltaban 20 en efectivo');
    await user.click(screen.getByRole('button', { name: 'Registrar corrección' }));

    await waitFor(() =>
      expect(servicio.corregirMovimiento).toHaveBeenCalledWith({
        entidad: 'venta',
        movimientoId: 'v1',
        motivo: 'Faltaban 20 en efectivo',
        detallesCorregidos: [
          { tipoArqueo: 'efectivo', monto: 180 },
          { tipoArqueo: 'tarjeta', monto: 100 },
        ],
      }),
    );
  });
});
