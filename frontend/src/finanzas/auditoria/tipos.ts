/**
 * Tipos del centro de auditoría de correcciones financieras.
 * Coinciden con el contrato de GET /finanzas/auditoria-correcciones.
 */

export type EntidadAuditoria = 'gasto' | 'venta' | 'pago';
export type AccionAuditoria = 'correccion' | 'anulacion';

export interface LineaArqueoDetalle {
  tipoArqueo: string;
  monto: number;
}

export type DetalleEntidad =
  | {
      entidad: 'gasto';
      categoria: string;
      descripcion: string | null;
      fecha: string;
      tipoPago: string | null;
    }
  | {
      entidad: 'venta';
      sede: string;
      cajera: string;
      turno: string;
      fecha: string;
      arqueoOriginal: LineaArqueoDetalle[];
      arqueoVigente: LineaArqueoDetalle[];
    }
  | {
      entidad: 'pago';
      proveedor: string;
      numeroFactura: string;
      montoFactura: number;
      fechaPago: string;
    };

export interface RegistroAuditoria {
  id: string;
  entidad: EntidadAuditoria;
  accion: AccionAuditoria;
  registroOriginalId: string;
  reversoId: string;
  correccionId: string | null;
  fechaOriginal: string;
  fechaCorreccion: string;
  montoOriginal: number;
  montoVigente: number;
  diferencia: number;
  motivo: string | null;
  registradoPor: { id: string; nombre: string | null };
  descripcion: string;
  documento: string;
  detalleEntidad: DetalleEntidad;
}

export interface PaginacionAuditoria {
  pagina: number;
  tamano: number;
  total: number;
  paginas: number;
}

export interface ResumenAuditoria {
  total: number;
  correcciones: number;
  anulaciones: number;
  gastos: number;
  ventas: number;
  pagos: number;
  usuarios: number;
  totalOriginal: number;
  totalVigente: number;
  /** original − vigente (lo que las correcciones quitaron); NO es "pérdida". */
  diferenciaNeta: number;
}

export interface UsuarioAuditoria {
  id: string;
  nombre: string | null;
}

export interface RespuestaAuditoria {
  registros: RegistroAuditoria[];
  /** Usuarios que corrigieron en el rango (opciones del selector de usuario). */
  usuariosDisponibles: UsuarioAuditoria[];
  paginacion: PaginacionAuditoria;
  resumen: ResumenAuditoria;
}

export interface FiltrosAuditoria {
  desde?: string;
  hasta?: string;
  entidad?: EntidadAuditoria | 'todas';
  accion?: AccionAuditoria | 'todas';
  usuarioId?: string;
  texto?: string;
  pagina?: number;
  tamano?: number;
}
