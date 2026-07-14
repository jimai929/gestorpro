import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { PantallaAuditoria } from './PantallaAuditoria';
import { construirCsvAuditoria } from './csvAuditoria';
import * as servicio from './servicioAuditoria';
import type { RegistroAuditoria, RespuestaAuditoria } from './tipos';

vi.mock('./servicioAuditoria');
vi.mock('../../core/ui/LayoutPrincipal', () => ({
  LayoutPrincipal: (props: { children: ReactNode }) => props.children,
}));

const gasto: RegistroAuditoria = {
  id: 'rev-g', entidad: 'gasto', accion: 'correccion',
  registroOriginalId: 'g1', reversoId: 'rev-g', correccionId: 'cor-g',
  fechaOriginal: '2026-04-10', fechaCorreccion: '2026-04-15T10:00:00.000Z',
  montoOriginal: 150, montoVigente: 15, diferencia: 135,
  motivo: 'se tecleó 150 en vez de 15', registradoPor: { id: 'u1', nombre: 'Ana Admin' },
  descripcion: 'Alquiler · Local centro', documento: 'Local centro',
  detalleEntidad: { entidad: 'gasto', categoria: 'Alquiler', descripcion: 'Local centro', fecha: '2026-04-10', tipoPago: null },
};
const venta: RegistroAuditoria = {
  id: 'rev-v', entidad: 'venta', accion: 'anulacion',
  registroOriginalId: 'v1', reversoId: 'rev-v', correccionId: null,
  fechaOriginal: '2026-04-11', fechaCorreccion: '2026-04-16T09:00:00.000Z',
  montoOriginal: 1000, montoVigente: 0, diferencia: 1000,
  motivo: 'cierre mal tecleado', registradoPor: { id: 'u2', nombre: 'Luis Sup' },
  descripcion: 'Sede A · E001 - Cajero', documento: '2026-04-11 manana',
  detalleEntidad: {
    entidad: 'venta', sede: 'Sede A', cajera: 'E001 - Cajero', turno: 'manana', fecha: '2026-04-11',
    arqueoOriginal: [{ tipoArqueo: 'efectivo', monto: 600 }, { tipoArqueo: 'tarjeta', monto: 400 }],
    arqueoVigente: [],
  },
};
const pago: RegistroAuditoria = {
  id: 'rev-p', entidad: 'pago', accion: 'correccion',
  registroOriginalId: 'p1', reversoId: 'rev-p', correccionId: 'cor-p',
  fechaOriginal: '2026-04-12', fechaCorreccion: '2026-04-17T08:00:00.000Z',
  montoOriginal: 500, montoVigente: 300, diferencia: 200,
  motivo: 'se pagó de más', registradoPor: { id: 'u1', nombre: 'Ana Admin' },
  descripcion: 'Distribuidora A · F-001', documento: 'F-001',
  detalleEntidad: { entidad: 'pago', proveedor: 'Distribuidora A', numeroFactura: 'F-001', montoFactura: 5000, fechaPago: '2026-04-12' },
};

const respuesta: RespuestaAuditoria = {
  registros: [pago, venta, gasto],
  usuariosDisponibles: [{ id: 'u1', nombre: 'Ana Admin' }, { id: 'u2', nombre: 'Luis Sup' }],
  paginacion: { pagina: 1, tamano: 20, total: 3, paginas: 1 },
  resumen: {
    total: 3, correcciones: 2, anulaciones: 1, gastos: 1, ventas: 1, pagos: 1,
    usuarios: 2, totalOriginal: 1650, totalVigente: 315, diferenciaNeta: 1335,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(servicio.obtenerAuditoriaCorrecciones).mockResolvedValue(respuesta);
});

function montar(ruta = '/auditoria-financiera') {
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <PantallaAuditoria />
    </MemoryRouter>,
  );
  return userEvent.setup();
}

describe('PantallaAuditoria — lista unificada de las tres entidades', () => {
  it('muestra gasto, cierre y pago con su acción, montos y diferencia', async () => {
    montar();
    await screen.findByRole('table');
    const tabla = within(screen.getByRole('table'));

    // Los tres módulos aparecen.
    expect(tabla.getByText('Alquiler · Local centro')).toBeTruthy();
    expect(tabla.getByText('Sede A · E001 - Cajero')).toBeTruthy();
    expect(tabla.getByText('Distribuidora A · F-001')).toBeTruthy();

    // Corrección vs anulación.
    expect(tabla.getAllByText('Corrección').length).toBe(2);
    expect(tabla.getByText('Anulación')).toBeTruthy();

    // Montos original / vigente / diferencia (con signo explícito).
    expect(tabla.getByText('B/. 150.00')).toBeTruthy();
    expect(tabla.getByText('B/. 15.00')).toBeTruthy();
    expect(tabla.getByText('−B/. 135.00')).toBeTruthy();
    expect(tabla.getByText('−B/. 1000.00')).toBeTruthy();
  });

  it('el resumen refleja el conjunto completo (no la página)', async () => {
    montar();
    await screen.findByRole('table');
    expect(screen.getByText('B/. 1650.00')).toBeTruthy(); // total original
    expect(screen.getByText('B/. 315.00')).toBeTruthy(); // total vigente
    expect(screen.getByText('B/. 1335.00')).toBeTruthy(); // diferencia neta
  });

  it('carga con filtros de la URL (deep-link ?entidad=pago&registroId=p1)', async () => {
    montar('/auditoria-financiera?entidad=pago&registroId=p1');
    await waitFor(() =>
      expect(servicio.obtenerAuditoriaCorrecciones).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: 'pago', texto: 'p1' }),
      ),
    );
  });

  it('los filtros de módulo, acción, usuario y texto consultan al backend; limpiar los quita', async () => {
    const user = montar();
    await screen.findByRole('table');

    await user.selectOptions(screen.getByLabelText('Módulo'), 'gasto');
    await waitFor(() =>
      expect(servicio.obtenerAuditoriaCorrecciones).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: 'gasto', pagina: 1 }),
      ),
    );

    await user.selectOptions(screen.getByLabelText('Acción'), 'anulacion');
    await user.selectOptions(screen.getByLabelText('Usuario'), 'u2');
    await waitFor(() =>
      expect(servicio.obtenerAuditoriaCorrecciones).toHaveBeenCalledWith(
        expect.objectContaining({ entidad: 'gasto', accion: 'anulacion', usuarioId: 'u2' }),
      ),
    );

    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => {
      const ultima = vi.mocked(servicio.obtenerAuditoriaCorrecciones).mock.calls.at(-1)?.[0];
      expect(ultima).toEqual({ entidad: 'todas', accion: 'todas', pagina: 1, tamano: 20 });
    });
  });

  it('si falla, muestra el error y permite reintentar', async () => {
    vi.mocked(servicio.obtenerAuditoriaCorrecciones).mockRejectedValueOnce(new Error('Backend caído'));
    const user = montar();
    expect(await screen.findByText('Backend caído')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeTruthy();
  });
});

describe('PantallaAuditoria — detalle', () => {
  it('"Ver detalle" abre la línea de tiempo del dinero', async () => {
    const user = montar();
    await screen.findByRole('table');
    // El gasto corregido: original 150 → reverso → corrección 15.
    const filaGasto = screen.getByText('Alquiler · Local centro').closest('tr')!;
    await user.click(within(filaGasto).getByRole('button', { name: 'Ver detalle' }));

    const dialogo = within(screen.getByRole('dialog'));
    expect(dialogo.getByText('Detalle de la corrección')).toBeTruthy();
    expect(dialogo.getByText('Registro original')).toBeTruthy();
    expect(dialogo.getByText('−B/. 150.00')).toBeTruthy(); // reverso
    // 15.00 aparece dos veces: paso "corrección" y paso "monto vigente".
    expect(dialogo.getAllByText('B/. 15.00').length).toBe(2);
    // Ids del rastro.
    expect(dialogo.getByText('g1')).toBeTruthy();
    expect(dialogo.getByText('rev-g')).toBeTruthy();
  });

  it('el detalle de una ANULACIÓN de cierre muestra el arqueo original y "queda en cero"', async () => {
    const user = montar();
    await screen.findByRole('table');
    const filaVenta = screen.getByText('Sede A · E001 - Cajero').closest('tr')!;
    await user.click(within(filaVenta).getByRole('button', { name: 'Ver detalle' }));

    const dialogo = within(screen.getByRole('dialog'));
    expect(dialogo.getByText('Sin nuevo monto (anulación)')).toBeTruthy();
    expect(dialogo.getByText('Anulado (queda en cero)')).toBeTruthy();
    // Arqueo original visible.
    expect(dialogo.getByText('B/. 600.00')).toBeTruthy();
    expect(dialogo.getByText('B/. 400.00')).toBeTruthy();
  });
});

describe('PantallaAuditoria — imprimir y CSV', () => {
  it('"Imprimir / Guardar PDF" llama al print del navegador', async () => {
    const imprimir = vi.fn();
    vi.stubGlobal('print', imprimir);
    const user = montar();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: /imprimir \/ guardar pdf/i }));
    expect(imprimir).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it('"Exportar CSV" pide el conjunto completo (tamaño grande) y descarga', async () => {
    const crearUrl = vi.fn(() => 'blob:fake');
    vi.stubGlobal('URL', { ...URL, createObjectURL: crearUrl, revokeObjectURL: vi.fn() });
    const clicks: HTMLAnchorElement[] = [];
    const clickOriginal = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this as HTMLAnchorElement); };

    const user = montar();
    await screen.findByRole('table');
    await user.click(screen.getByRole('button', { name: 'Exportar CSV' }));

    await waitFor(() => expect(clicks.length).toBe(1));
    // La exportación pide una página con un tamaño grande (todo el conjunto).
    const llamadaExport = vi.mocked(servicio.obtenerAuditoriaCorrecciones).mock.calls.at(-1)?.[0];
    expect(llamadaExport?.tamano).toBeGreaterThan(100);
    expect(clicks[0]!.download).toContain('auditoria-correcciones');

    HTMLAnchorElement.prototype.click = clickOriginal;
    vi.unstubAllGlobals();
  });
});

describe('CSV de auditoría', () => {
  const t = (clave: string) => clave;

  it('incluye todos los registros con montos, diferencia, usuario y los ids del rastro', () => {
    const csv = construirCsvAuditoria([gasto, venta, pago], t);
    // Las tres filas.
    expect(csv).toContain('Alquiler · Local centro');
    expect(csv).toContain('Sede A · E001 - Cajero');
    expect(csv).toContain('Distribuidora A · F-001');
    // Montos y diferencia (formato estable).
    expect(csv).toContain('150.00');
    expect(csv).toContain('15.00');
    expect(csv).toContain('135.00');
    // Usuario e ids de rastro.
    expect(csv).toContain('Ana Admin');
    expect(csv).toContain('g1');
    expect(csv).toContain('rev-g');
    expect(csv).toContain('cor-g');
    // Separador ; y comillas de texto.
    expect(csv.split('\r\n')[0]).toContain(';');
    expect(csv.split('\r\n')[0]).toContain('"');
  });
});
