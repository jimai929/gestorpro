/**
 * Tipos del flujo de caja operativo.
 * Coinciden con GET /finanzas/flujo-caja.
 */

export type TipoFlujo = 'ingreso' | 'gasto' | 'pago_proveedor';
export type EntidadFlujo = 'venta' | 'gasto' | 'pago';
export type DireccionFlujo = 'entrada' | 'salida';
export type EstadoFlujo = 'vigente' | 'corregido' | 'anulado';
export type OrdenFlujo = 'fecha_desc' | 'fecha_asc' | 'monto_desc' | 'monto_asc';

export interface LineaArqueoFlujo {
  tipoArqueo: string;
  monto: number;
}

export type DetalleFlujo =
  | {
      entidad: 'venta';
      sede: string;
      cajera: string;
      turno: string;
      arqueoOriginal: LineaArqueoFlujo[];
      arqueoVigente: LineaArqueoFlujo[];
    }
  | { entidad: 'gasto'; categoria: string; descripcion: string | null; tipoPago: string | null; fecha: string }
  | { entidad: 'pago'; proveedor: string; numeroFactura: string; fechaPago: string };

export interface MovimientoFlujo {
  id: string;
  tipo: TipoFlujo;
  entidad: EntidadFlujo;
  fecha: string;
  fechaCreacion: string;
  montoOriginal: number;
  montoVigente: number;
  direccion: DireccionFlujo;
  impactoNeto: number;
  estado: EstadoFlujo;
  motivoCorreccion: string | null;
  descripcion: string;
  documento: string;
  registradoPor: string | null;
  detalle: DetalleFlujo;
}

export interface ResumenFlujo {
  totalIngresos: number;
  totalGastos: number;
  totalPagosProveedores: number;
  totalSalidas: number;
  flujoNeto: number;
  cantidadMovimientos: number;
  cantidadIngresos: number;
  cantidadSalidas: number;
  diasConFlujoPositivo: number;
  diasConFlujoNegativo: number;
  mayorEntrada: number;
  mayorSalida: number;
  diaMayorSalida: string | null;
  movimientosCorregidos: number;
  movimientosAnulados: number;
}

export interface MetodoIngreso {
  metodo: string;
  monto: number;
  porcentaje: number;
  registros: number;
}

export interface DiaFlujo {
  fecha: string;
  ingresos: number;
  gastos: number;
  pagosProveedores: number;
  salidas: number;
  flujoNeto: number;
  acumuladoDesdeInicioPeriodo: number;
}

export interface OpcionCatalogo {
  id: string;
  nombre: string | null;
}

export interface RespuestaFlujoCaja {
  movimientos: MovimientoFlujo[];
  paginacion: { pagina: number; tamano: number; total: number; paginas: number };
  resumen: ResumenFlujo;
  porMetodoIngreso: MetodoIngreso[];
  porDia: DiaFlujo[];
  filtrosDisponibles: {
    sedes: OpcionCatalogo[];
    proveedores: OpcionCatalogo[];
    categorias: OpcionCatalogo[];
    usuarios: OpcionCatalogo[];
  };
}

export interface FiltrosFlujo {
  desde: string;
  hasta: string;
  tipo?: TipoFlujo | 'todos';
  sedeId?: string;
  proveedorId?: string;
  categoriaId?: string;
  estado?: EstadoFlujo | 'todos';
  texto?: string;
  orden?: OrdenFlujo;
  pagina?: number;
  tamano?: number;
}
