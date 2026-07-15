import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PantallaPlanPagos } from './PantallaPlanPagos';
import { construirCsvPlanPagos } from './csvPlanPagos';
import * as servicio from './servicioCuentas';
import type { RespuestaPlan } from './plan-pagos-tipos';

vi.mock('./servicioCuentas');
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));
const usuarioMock = vi.hoisted(() => ({
  actual: { rol: 'administrador', empresaId: 'e1' } as { rol: string; empresaId: string | null },
}));
vi.mock('../../core/auth/ContextoAuth', () => ({
  useAuth: () => ({ usuario: usuarioMock.actual }),
}));

const plan: RespuestaPlan = {
  cabecera: {
    presupuestoDisponible: 500, montoPlanificado: 500, presupuestoNoUsado: 0,
    deudaTotal: 900, deudaProyectada: 400, estrategia: 'mas_antiguas_primero',
    cantidadProveedores: 1, cantidadFacturas: 2, facturasCompletas: 1, facturasParciales: 1,
  },
  asignaciones: [
    {
      compraId: 'c1', numeroFactura: 'F-001', proveedorId: 'p1', proveedorNombre: 'Distribuidora A',
      identificacionFiscal: 'RUC-1', fechaCompra: '2026-01-01', diasAntiguedad: 120, tramo: 'dias_90_mas',
      montoOriginal: 400, saldoPendiente: 400, montoPlanificado: 400, saldoProyectado: 0,
      tipoResultado: 'completa', orden: 1,
    },
    {
      compraId: 'c2', numeroFactura: 'F-002', proveedorId: 'p1', proveedorNombre: 'Distribuidora A',
      identificacionFiscal: 'RUC-1', fechaCompra: '2026-03-01', diasAntiguedad: 61, tramo: 'dias_61_90',
      montoOriginal: 500, saldoPendiente: 500, montoPlanificado: 100, saldoProyectado: 400,
      tipoResultado: 'parcial', orden: 2,
    },
  ],
  resumenPorProveedor: [
    {
      proveedorId: 'p1', nombre: 'Distribuidora A', identificacionFiscal: 'RUC-1',
      deudaActual: 900, montoPlanificado: 500, deudaProyectada: 400,
      cantidadFacturasIncluidas: 2, cantidadFacturasCompletadas: 1,
    },
  ],
  resumenPorTramo: [
    { tramo: 'dias_0_30', deudaAntes: 0, pagoPlanificado: 0, deudaDespues: 0 },
    { tramo: 'dias_31_60', deudaAntes: 0, pagoPlanificado: 0, deudaDespues: 0 },
    { tramo: 'dias_61_90', deudaAntes: 500, pagoPlanificado: 100, deudaDespues: 400 },
    { tramo: 'dias_90_mas', deudaAntes: 400, pagoPlanificado: 400, deudaDespues: 0 },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.actual = { rol: 'administrador', empresaId: 'e1' };
  vi.mocked(servicio.obtenerProveedores).mockResolvedValue([]);
  vi.mocked(servicio.simularPlanPagos).mockResolvedValue(plan);
});

function montar(ruta = '/cuentas-por-pagar/plan-pagos') {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <PantallaPlanPagos />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('PantallaPlanPagos — configuración y generación', () => {
  it('avisa siempre de que no registra pagos', async () => {
    montar();
    await screen.findByText(/no registra ningún pago/i);
  });

  it('sin presupuesto válido, el botón Generar está deshabilitado y no llama al backend', async () => {
    montar();
    await screen.findByText('1. Configurar el plan');
    expect((screen.getByRole('button', { name: 'Generar plan' }) as HTMLButtonElement).disabled).toBe(true);
    expect(servicio.simularPlanPagos).not.toHaveBeenCalled();
  });

  it('con presupuesto y estrategia, genera y muestra el plan automático', async () => {
    const user = montar();
    await user.type(screen.getByLabelText('Presupuesto disponible (B/.)'), '500');
    await user.click(screen.getByRole('button', { name: 'Generar plan' }));

    await waitFor(() =>
      expect(servicio.simularPlanPagos).toHaveBeenCalledWith(
        expect.objectContaining({ presupuestoDisponible: 500, estrategia: 'mas_antiguas_primero' }),
      ),
    );
    // Muestra las asignaciones y los resultados.
    expect(await screen.findByText('F-001')).toBeTruthy();
    expect(screen.getByText('F-002')).toBeTruthy();
    expect(screen.getByText('Completa')).toBeTruthy();
    expect(screen.getByText('Parcial')).toBeTruthy();
  });

  it('cambiar la estrategia tras generar marca el plan como obsoleto', async () => {
    const user = montar();
    await user.type(screen.getByLabelText('Presupuesto disponible (B/.)'), '500');
    await user.click(screen.getByRole('button', { name: 'Generar plan' }));
    await screen.findByText('F-001');

    await user.selectOptions(screen.getByLabelText('Estrategia'), 'saldos_menores_primero');
    expect(await screen.findByText(/el plan de abajo es el ANTERIOR/i)).toBeTruthy();
  });

  it('si la simulación falla, muestra el error y NO borra el presupuesto', async () => {
    vi.mocked(servicio.simularPlanPagos).mockRejectedValueOnce(new Error('Backend caído'));
    const user = montar();
    const input = screen.getByLabelText('Presupuesto disponible (B/.)') as HTMLInputElement;
    await user.type(input, '500');
    await user.click(screen.getByRole('button', { name: 'Generar plan' }));

    expect(await screen.findByText('Backend caído')).toBeTruthy();
    expect(input.value).toBe('500'); // el input se conserva
  });
});

describe('PantallaPlanPagos — ajuste manual', () => {
  async function generar(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByLabelText('Presupuesto disponible (B/.)'), '500');
    await user.click(screen.getByRole('button', { name: 'Generar plan' }));
    await screen.findByText('F-001');
  }

  it('editar un monto actualiza el presupuesto restante en vivo', async () => {
    const user = montar();
    await generar(user);
    // Con la propuesta (400 + 100 = 500), el restante es 0.
    expect(screen.getByText(/Presupuesto restante: B\/\. 0\.00/)).toBeTruthy();

    // Reducir el primer pago a 300 → restante 100.
    const inputC1 = screen.getByLabelText('Pago de la factura F-001') as HTMLInputElement;
    await user.clear(inputC1);
    await user.type(inputC1, '300');
    expect(await screen.findByText(/Presupuesto restante: B\/\. 100\.00/)).toBeTruthy();
  });

  it('un pago mayor que el saldo es visible y bloquea el reporte de confirmación', async () => {
    const user = montar();
    await generar(user);

    // Bajar el otro pago a 0 para aislar el exceso de SALDO (no de presupuesto).
    const inputC2 = screen.getByLabelText('Pago de la factura F-002') as HTMLInputElement;
    await user.clear(inputC2);
    await user.type(inputC2, '0');
    const inputC1 = screen.getByLabelText('Pago de la factura F-001') as HTMLInputElement;
    await user.clear(inputC1);
    await user.type(inputC1, '450'); // saldo es 400; total 450 < presupuesto 500

    // Marca de exceso de saldo visible y su aviso.
    expect(await screen.findByText('Supera el saldo')).toBeTruthy();
    expect(screen.getByText(/supera el saldo de su factura/i)).toBeTruthy();
    // El reporte pide corregir antes de mostrarse.
    expect(screen.getByText(/Corrige los montos marcados/i)).toBeTruthy();
  });

  it('sobrepasar el presupuesto es visible y bloquea el reporte', async () => {
    const user = montar();
    await generar(user);

    // Subir el segundo pago a su saldo (500): total 400+500 = 900 > 500.
    const inputC2 = screen.getByLabelText('Pago de la factura F-002') as HTMLInputElement;
    await user.clear(inputC2);
    await user.type(inputC2, '500');

    expect(await screen.findByText(/supera el presupuesto disponible/i)).toBeTruthy();
    expect(screen.getByText(/Presupuesto restante: -B\/\. 400\.00|Presupuesto restante: B\/\. -400\.00/)).toBeTruthy();
  });

  it('"Aplicar montos" re-simula en modo manual (el backend revalida)', async () => {
    const user = montar();
    await generar(user);
    await user.click(screen.getByRole('button', { name: 'Aplicar montos' }));
    await waitFor(() =>
      expect(servicio.simularPlanPagos).toHaveBeenLastCalledWith(
        expect.objectContaining({ estrategia: 'manual', asignacionesManuales: expect.any(Array) }),
      ),
    );
  });
});

describe('PantallaPlanPagos — permisos, imprimir y CSV', () => {
  it('un empleado no ve la herramienta', async () => {
    usuarioMock.actual = { rol: 'empleado', empresaId: 'e1' };
    montar();
    expect(await screen.findByText(/no tienes acceso al planificador/i)).toBeTruthy();
    expect(screen.queryByLabelText('Presupuesto disponible (B/.)')).toBeNull();
  });

  it('"Imprimir / Guardar PDF" llama al print del navegador', async () => {
    const imprimir = vi.fn();
    vi.stubGlobal('print', imprimir);
    const user = montar();
    await user.type(screen.getByLabelText('Presupuesto disponible (B/.)'), '500');
    await user.click(screen.getByRole('button', { name: 'Generar plan' }));
    await screen.findByText('F-001');
    await user.click(screen.getByRole('button', { name: /imprimir \/ guardar pdf/i }));
    expect(imprimir).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

describe('CSV del plan de pagos', () => {
  const t = (clave: string) => clave;

  it('incluye la cabecera, el resumen por proveedor y todas las asignaciones', () => {
    const csv = construirCsvPlanPagos(plan, t);
    expect(csv).toContain('Distribuidora A');
    expect(csv).toContain('500.00'); // planificado
    // Todas las asignaciones con su saldo, pago y saldo proyectado.
    expect(csv).toContain('F-001');
    expect(csv).toContain('F-002');
    expect(csv).toContain('400.00');
    expect(csv).toContain('100.00');
    // Separador ; presente.
    expect(csv.split('\r\n').some((l) => l.includes(';'))).toBe(true);
  });
});
