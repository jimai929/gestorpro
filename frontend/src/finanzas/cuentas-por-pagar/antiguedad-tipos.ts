/**
 * Tipos de la antigüedad de cuentas por pagar.
 * Coinciden con el contrato de GET /cuentas-por-pagar/antiguedad.
 */

export type TramoAntiguedad = 'dias_0_30' | 'dias_31_60' | 'dias_61_90' | 'dias_90_mas';
export type OrdenAntiguedad = 'deuda_desc' | 'antiguedad_desc' | 'proveedor_asc' | 'fecha_asc';

export interface FacturaAntiguedad {
  compraId: string;
  numeroFactura: string;
  proveedorId: string;
  proveedorNombre: string;
  fechaCompra: string;
  diasAntiguedad: number;
  tramo: TramoAntiguedad;
  montoOriginal: number;
  pagosVigentes: number;
  saldoPendiente: number;
  ultimoPago: string | null;
}

export interface ProveedorAntiguedad {
  proveedorId: string;
  nombre: string;
  identificacionFiscal: string | null;
  deudaTotal: number;
  cantidadFacturas: number;
  deuda0a30: number;
  deuda31a60: number;
  deuda61a90: number;
  deuda90Mas: number;
  facturaMasAntiguaFecha: string;
  facturaMasAntiguaDias: number;
}

export interface ResumenAntiguedad {
  deudaTotal: number;
  cantidadFacturasPendientes: number;
  cantidadProveedores: number;
  deuda0a30: number;
  deuda31a60: number;
  deuda61a90: number;
  deuda90Mas: number;
  pct0a30: number;
  pct31a60: number;
  pct61a90: number;
  pct90Mas: number;
  cant0a30: number;
  cant31a60: number;
  cant61a90: number;
  cant90Mas: number;
  deudaMasAntiguaDias: number;
  proveedorMayorDeuda: { id: string; nombre: string; deuda: number } | null;
}

export interface RespuestaAntiguedad {
  proveedores: ProveedorAntiguedad[];
  facturas: FacturaAntiguedad[];
  paginacion: { pagina: number; tamano: number; total: number; paginas: number };
  resumen: ResumenAntiguedad;
}

export interface FiltrosAntiguedad {
  proveedorId?: string;
  tramo?: TramoAntiguedad | 'todos';
  texto?: string;
  orden?: OrdenAntiguedad;
  pagina?: number;
  tamano?: number;
}
