/**
 * Tipos del planificador de pagos a proveedores.
 * Coinciden con POST /cuentas-por-pagar/plan-pagos/simular.
 */

import type { TramoAntiguedad } from './antiguedad-tipos';

export type EstrategiaPlan =
  | 'mas_antiguas_primero'
  | 'saldos_menores_primero'
  | 'proporcional_por_proveedor'
  | 'manual';

export type TipoResultadoPago = 'completa' | 'parcial';

export interface EntradaPlan {
  presupuestoDisponible: number;
  estrategia: EstrategiaPlan;
  proveedorIds?: string[];
  tramos?: TramoAntiguedad[];
  fechaCorte?: string;
  montoMinimoPago?: number;
  limitePorProveedor?: number;
  compraIdsPrioritarias?: string[];
  asignacionesManuales?: Array<{ compraId: string; monto: number }>;
}

export interface AsignacionPlan {
  compraId: string;
  numeroFactura: string;
  proveedorId: string;
  proveedorNombre: string;
  identificacionFiscal: string | null;
  fechaCompra: string;
  diasAntiguedad: number;
  tramo: TramoAntiguedad;
  montoOriginal: number;
  saldoPendiente: number;
  montoPlanificado: number;
  saldoProyectado: number;
  tipoResultado: TipoResultadoPago;
  orden: number;
}

export interface ResumenProveedorPlan {
  proveedorId: string;
  nombre: string;
  identificacionFiscal: string | null;
  deudaActual: number;
  montoPlanificado: number;
  deudaProyectada: number;
  cantidadFacturasIncluidas: number;
  cantidadFacturasCompletadas: number;
}

export interface ResumenTramoPlan {
  tramo: TramoAntiguedad;
  deudaAntes: number;
  pagoPlanificado: number;
  deudaDespues: number;
}

export interface CabeceraPlan {
  presupuestoDisponible: number;
  montoPlanificado: number;
  presupuestoNoUsado: number;
  deudaTotal: number;
  deudaProyectada: number;
  estrategia: EstrategiaPlan;
  cantidadProveedores: number;
  cantidadFacturas: number;
  facturasCompletas: number;
  facturasParciales: number;
}

export interface RespuestaPlan {
  cabecera: CabeceraPlan;
  asignaciones: AsignacionPlan[];
  resumenPorProveedor: ResumenProveedorPlan[];
  resumenPorTramo: ResumenTramoPlan[];
}
