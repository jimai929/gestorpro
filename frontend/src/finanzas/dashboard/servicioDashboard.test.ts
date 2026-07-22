/**
 * registrarVenta va por el cliente HTTP central (refresh-on-401 incluido) y
 * mapea el 409 del backend a ErrorCierreDuplicado. Estos tests fijan ese
 * contrato: 409 → ErrorCierreDuplicado con el mensaje del backend; cualquier
 * otro error se propaga tal cual.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registrarVenta, ErrorCierreDuplicado } from './servicioDashboard';
import * as apiModulo from '../../core/api';
import type { CuerpoRegistrarVenta } from './tipos';

vi.mock('../../core/api', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../core/api')>();
  return {
    ErrorHttp: real.ErrorHttp,
    api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
  };
});

const CUERPO = { sedeId: 's1' } as unknown as CuerpoRegistrarVenta;

describe('servicioDashboard.registrarVenta — contrato de errores', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('usa el cliente central (api.post /ventas) y devuelve la venta creada', async () => {
    const venta = { id: 'v1' };
    vi.mocked(apiModulo.api.post).mockResolvedValue(venta);
    await expect(registrarVenta(CUERPO)).resolves.toBe(venta);
    expect(vi.mocked(apiModulo.api.post)).toHaveBeenCalledWith('/ventas', CUERPO);
  });

  it('409 → ErrorCierreDuplicado con el mensaje del backend', async () => {
    vi.mocked(apiModulo.api.post).mockRejectedValue(
      new apiModulo.ErrorHttp(409, 'Ya existe el cierre normal de esa cajera.'),
    );
    await expect(registrarVenta(CUERPO)).rejects.toMatchObject({
      name: 'ErrorCierreDuplicado',
      message: 'Ya existe el cierre normal de esa cajera.',
    });
  });

  it('409 sin mensaje útil → ErrorCierreDuplicado con el texto por defecto', async () => {
    vi.mocked(apiModulo.api.post).mockRejectedValue(new apiModulo.ErrorHttp(409, 'Error 409'));
    await expect(registrarVenta(CUERPO)).rejects.toMatchObject({
      name: 'ErrorCierreDuplicado',
      message: 'Ya existe el cierre de esa cajera y turno; use una corrección para ajustarlo.',
    });
  });

  it('cualquier otro error se propaga sin convertir', async () => {
    const err500 = new apiModulo.ErrorHttp(500, 'Error interno.');
    vi.mocked(apiModulo.api.post).mockRejectedValue(err500);
    await expect(registrarVenta(CUERPO)).rejects.toBe(err500);
    await expect(registrarVenta(CUERPO)).rejects.not.toBeInstanceOf(ErrorCierreDuplicado);
  });
});
