import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PantallaFlujoCaja } from './PantallaFlujoCaja';
import { construirCsvFlujoCaja } from './csvFlujoCaja';
import * as servicio from './servicioDashboard';
import type { RespuestaFlujoCaja } from './flujo-caja-tipos';

vi.mock('./servicioDashboard');
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));
const usuarioMock = vi.hoisted(() => ({
  actual: { rol: 'administrador', empresaId: 'e1' } as { rol: string; empresaId: string | null },
}));
vi.mock('../../core/auth/ContextoAuth', () => ({
  useAuth: () => ({ usuario: usuarioMock.actual }),
}));

const datos: RespuestaFlujoCaja = {
  movimientos: [
    {
      id: 'v1', tipo: 'ingreso', entidad: 'venta', fecha: '2026-04-10', fechaCreacion: '2026-04-10T00:00:00.000Z',
      montoOriginal: 1000, montoVigente: 1000, direccion: 'entrada', impactoNeto: 1000, estado: 'vigente',
      motivoCorreccion: null, descripcion: 'Sede A · E001', documento: '2026-04-10 manana', registradoPor: 'Ana',
      detalle: { entidad: 'venta', sede: 'Sede A', cajera: 'E001', turno: 'manana', arqueoOriginal: [], arqueoVigente: [{ tipoArqueo: 'efectivo', monto: 600 }, { tipoArqueo: 'tarjeta', monto: 400 }] },
    },
    {
      id: 'g1', tipo: 'gasto', entidad: 'gasto', fecha: '2026-04-11', fechaCreacion: '2026-04-11T00:00:00.000Z',
      montoOriginal: 200, montoVigente: 50, direccion: 'salida', impactoNeto: -50, estado: 'corregido',
      motivoCorreccion: 'se tecleó de más', descripcion: 'Alquiler', documento: 'Alquiler', registradoPor: 'Ana',
      detalle: { entidad: 'gasto', categoria: 'Alquiler', descripcion: null, tipoPago: null, fecha: '2026-04-11' },
    },
    {
      id: 'p1', tipo: 'pago_proveedor', entidad: 'pago', fecha: '2026-04-12', fechaCreacion: '2026-04-12T00:00:00.000Z',
      montoOriginal: 300, montoVigente: 0, direccion: 'salida', impactoNeto: 0, estado: 'anulado',
      motivoCorreccion: 'duplicado', descripcion: 'Distribuidora A · F-001', documento: 'F-001', registradoPor: 'Luis',
      detalle: { entidad: 'pago', proveedor: 'Distribuidora A', numeroFactura: 'F-001', fechaPago: '2026-04-12' },
    },
  ],
  paginacion: { pagina: 1, tamano: 25, total: 3, paginas: 1 },
  resumen: {
    totalIngresos: 1000, totalGastos: 50, totalPagosProveedores: 0, totalSalidas: 50, flujoNeto: 950,
    cantidadMovimientos: 3, cantidadIngresos: 1, cantidadSalidas: 2, diasConFlujoPositivo: 1, diasConFlujoNegativo: 1,
    mayorEntrada: 1000, mayorSalida: 50, diaMayorSalida: '2026-04-11', movimientosCorregidos: 1, movimientosAnulados: 1,
  },
  porMetodoIngreso: [
    { metodo: 'efectivo', monto: 600, porcentaje: 60, registros: 1 },
    { metodo: 'tarjeta', monto: 400, porcentaje: 40, registros: 1 },
    { metodo: 'yappy', monto: 0, porcentaje: 0, registros: 0 },
    { metodo: 'loteria', monto: 0, porcentaje: 0, registros: 0 },
  ],
  porDia: [
    { fecha: '2026-04-10', ingresos: 1000, gastos: 0, pagosProveedores: 0, salidas: 0, flujoNeto: 1000, acumuladoDesdeInicioPeriodo: 1000 },
    { fecha: '2026-04-11', ingresos: 0, gastos: 50, pagosProveedores: 0, salidas: 50, flujoNeto: -50, acumuladoDesdeInicioPeriodo: 950 },
  ],
  filtrosDisponibles: { sedes: [{ id: 's1', nombre: 'Sede A' }], proveedores: [{ id: 'p1', nombre: 'Distribuidora A' }], categorias: [{ id: 'c1', nombre: 'Alquiler' }], usuarios: [] },
};

beforeEach(() => {
  vi.clearAllMocks();
  usuarioMock.actual = { rol: 'administrador', empresaId: 'e1' };
  vi.mocked(servicio.obtenerFlujoCaja).mockResolvedValue(datos);
});

function montar(ruta = '/finanzas/flujo-caja') {
  render(<MemoryRouter initialEntries={[ruta]}><PantallaFlujoCaja /></MemoryRouter>);
  return userEvent.setup();
}

describe('PantallaFlujoCaja — criterio y resumen', () => {
  it('avisa de que no es ganancia ni saldo bancario', async () => {
    montar();
    // El aviso aparece en pantalla y en el título de impresión: getAllByText.
    expect((await screen.findAllByText(/no es la ganancia/i)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/no es el saldo real de banco/i).length).toBeGreaterThan(0);
  });

  it('el resumen muestra ingresos, salidas y neto correctos', async () => {
    montar();
    await screen.findByRole('table');
    expect(screen.getAllByText('B/. 1000.00').length).toBeGreaterThan(0); // ingresos
    expect(screen.getByText('+B/. 950.00')).toBeTruthy(); // neto positivo con signo
  });

  it('los métodos de ingreso muestran también los de valor 0', async () => {
    montar();
    await screen.findByRole('table');
    // yappy y lotería en 0 siguen presentes.
    expect(screen.getAllByText('B/. 0.00').length).toBeGreaterThan(0);
    expect(screen.getByText('Yappy')).toBeTruthy();
    expect(screen.getByText('Lotería')).toBeTruthy();
  });
});

describe('PantallaFlujoCaja — movimientos', () => {
  it('el ingreso va en la columna de entrada; el corregido muestra original tachado', async () => {
    montar();
    await screen.findByRole('table');
    const tabla = within(screen.getByRole('table'));
    expect(tabla.getByText('Sede A · E001')).toBeTruthy();
    // El gasto corregido: 200 tachado + 50 vigente.
    expect(tabla.getByText('B/. 200.00')).toBeTruthy();
    expect(tabla.getByText('B/. 50.00')).toBeTruthy();
    // El pago anulado (vigente 0) con badge Anulado y enlace a auditoría.
    expect(tabla.getByText('Anulado')).toBeTruthy();
  });

  it('un movimiento corregido enlaza a la auditoría', async () => {
    montar();
    await screen.findByRole('table');
    // "Alquiler" aparece en la tabla y en el filtro de categorías: tomar el de la tabla.
    const filaGasto = within(screen.getByRole('table')).getByText('Alquiler').closest('tr')!;
    const enlace = within(filaGasto).getByRole('link', { name: 'Ver auditoría' });
    expect(enlace.getAttribute('href')).toContain('/auditoria-financiera');
    expect(enlace.getAttribute('href')).toContain('entidad=gasto');
  });
});

describe('PantallaFlujoCaja — saldo inicial manual', () => {
  it('es solo simulación local: muestra saldo final proyectado marcado como manual', async () => {
    const user = montar();
    await screen.findByRole('table');
    await user.type(screen.getByLabelText('Saldo inicial manual'), '5000');
    // 5000 + 950 = 5950.
    expect(await screen.findByText(/B\/\. 5950\.00/)).toBeTruthy();
    expect(screen.getAllByText(/Valor manual, no verificado/i).length).toBeGreaterThan(0);
  });
});

describe('PantallaFlujoCaja — filtros y permisos', () => {
  it('un ?tipo= de la URL se envía al backend', async () => {
    montar('/finanzas/flujo-caja?tipo=gasto');
    await waitFor(() =>
      expect(servicio.obtenerFlujoCaja).toHaveBeenCalledWith(expect.objectContaining({ tipo: 'gasto' })),
    );
  });

  it('un empleado no ve la herramienta', async () => {
    usuarioMock.actual = { rol: 'empleado', empresaId: 'e1' };
    montar();
    expect(await screen.findByText(/no tienes acceso al flujo de caja/i)).toBeTruthy();
  });

  it('si falla, muestra error y reintenta', async () => {
    vi.mocked(servicio.obtenerFlujoCaja).mockRejectedValueOnce(new Error('Backend caído'));
    const user = montar();
    expect(await screen.findByText('Backend caído')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeTruthy();
  });
});

describe('PantallaFlujoCaja — imprimir y CSV', () => {
  it('"Imprimir" llama al print del navegador', async () => {
    const imprimir = vi.fn();
    vi.stubGlobal('print', imprimir);
    const user = montar();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: /imprimir \/ guardar pdf/i }));
    expect(imprimir).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('"Exportar CSV" pide el conjunto completo (tamaño grande)', async () => {
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
    const clickOriginal = HTMLAnchorElement.prototype.click;
    let clicks = 0;
    HTMLAnchorElement.prototype.click = function () { clicks += 1; };
    const user = montar();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));
    await waitFor(() => expect(clicks).toBe(1));
    const exportCall = vi.mocked(servicio.obtenerFlujoCaja).mock.calls.at(-1)?.[0];
    expect(exportCall?.tamano).toBeGreaterThan(100);
    HTMLAnchorElement.prototype.click = clickOriginal;
    vi.unstubAllGlobals();
  });
});

describe('CSV de flujo de caja', () => {
  const t = (clave: string) => clave;

  it('incluye movimientos, y el saldo manual va marcado como no verificado', () => {
    const csv = construirCsvFlujoCaja(datos, { desde: '2026-04-01', hasta: '2026-04-30' }, 5000, t);
    // Movimientos.
    expect(csv).toContain('Sede A · E001');
    expect(csv).toContain('Alquiler');
    expect(csv).toContain('1000.00');
    expect(csv).toContain('50.00');
    // Saldo manual con su marca.
    expect(csv).toContain('5000.00');
    expect(csv).toContain('fin.flujo.marcaManual');
    // Separador.
    expect(csv.split('\r\n').some((l) => l.includes(';'))).toBe(true);
  });

  it('sin saldo manual, no aparece la fila de saldo', () => {
    const csv = construirCsvFlujoCaja(datos, { desde: '2026-04-01', hasta: '2026-04-30' }, null, t);
    expect(csv).not.toContain('fin.flujo.saldoFinalProyectado');
  });
});
