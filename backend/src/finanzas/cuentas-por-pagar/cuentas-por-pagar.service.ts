import { prisma } from '../../core/prisma.js';
import {
  ErrorConflicto,
  ErrorNoEncontrado,
  ErrorValidacion,
} from '../../core/errors.js';

/** True si `error` es un error conocido de Prisma con el código dado (P2002, etc.). */
function esErrorPrisma(error: unknown, codigo: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === codigo
  );
}

// ─── Proveedores ────────────────────────────────────────────────────────────

export interface DatosProveedor {
  nombre: string;
  identificacionFiscal?: string;
}

export function crearProveedor(datos: DatosProveedor) {
  return prisma.proveedor.create({
    data: {
      nombre: datos.nombre,
      identificacionFiscal: datos.identificacionFiscal ?? null,
    },
  });
}

export function listarProveedores() {
  return prisma.proveedor.findMany({ orderBy: { nombre: 'asc' } });
}

// ─── Compras ──────────────────────────────────────────────────────────────--

export interface DatosCompra {
  proveedorId: string;
  sedeId: string;
  numeroFactura: string;
  montoTotal: number;
  fechaEmision: string;
  fechaVencimiento: string;
}

/**
 * Serializa una compra de Prisma al contrato de la API: `montoTotal` se expone
 * como `number` (Prisma lo entrega como `Decimal`, que serializaría a string en
 * JSON). Mantiene la misma convención que `aCuentaDto`: dinero siempre `number`
 * hacia el frontend.
 */
function aCompraDto<T extends { montoTotal: { toString(): string } }>(compra: T) {
  return { ...compra, montoTotal: Number(compra.montoTotal) };
}

export async function registrarCompra(datos: DatosCompra) {
  if (datos.montoTotal <= 0) {
    throw new ErrorValidacion('El monto total de la factura debe ser mayor que cero.');
  }
  try {
    const compra = await prisma.compra.create({
      data: {
        proveedorId: datos.proveedorId,
        sedeId: datos.sedeId,
        numeroFactura: datos.numeroFactura,
        montoTotal: datos.montoTotal,
        fechaEmision: new Date(datos.fechaEmision),
        fechaVencimiento: new Date(datos.fechaVencimiento),
      },
    });
    return aCompraDto(compra);
  } catch (error) {
    if (esErrorPrisma(error, 'P2002')) {
      throw new ErrorConflicto(
        `Ya existe la factura "${datos.numeroFactura}" para ese proveedor; use una corrección para ajustarla.`,
      );
    }
    if (esErrorPrisma(error, 'P2003')) {
      throw new ErrorValidacion('El proveedor o la sede indicados no existen.');
    }
    throw error;
  }
}

export async function listarCompras(filtros: { sedeId?: string }) {
  const compras = await prisma.compra.findMany({
    where: filtros.sedeId ? { sedeId: filtros.sedeId } : {},
    orderBy: { fechaEmision: 'desc' },
    include: { proveedor: true },
  });
  return compras.map(aCompraDto);
}

// ─── Pagos ──────────────────────────────────────────────────────────────────

export interface DatosPago {
  compraId: string;
  monto: number;
  fechaPago?: string;
  usuarioId: string;
}

/**
 * Registra un abono a una factura. En una transacción: bloquea la compra,
 * calcula el saldo vigente y rechaza el pago si excede el saldo (el bloqueo
 * evita sobrepagos por concurrencia). El pago es un movimiento `normal`.
 */
export async function registrarPago(datos: DatosPago) {
  if (datos.monto <= 0) {
    throw new ErrorValidacion('El monto del pago debe ser mayor que cero.');
  }

  return prisma.$transaction(async (tx) => {
    const compras = await tx.$queryRaw<Array<{ monto_total: string }>>`
      SELECT monto_total FROM compra WHERE id = ${datos.compraId}::uuid FOR UPDATE`;
    if (compras.length === 0) {
      throw new ErrorNoEncontrado('La compra no existe.');
    }
    const montoTotal = Number(compras[0]?.monto_total);

    const filasPagado = await tx.$queryRaw<Array<{ pagado: string }>>`
      SELECT COALESCE(SUM(CASE WHEN tipo = 'reverso' THEN -monto ELSE monto END), 0) AS pagado
      FROM pago_proveedor WHERE compra_id = ${datos.compraId}::uuid`;
    const pagado = Number(filasPagado[0]?.pagado);
    const saldo = montoTotal - pagado;

    if (datos.monto > saldo) {
      throw new ErrorValidacion(
        `El pago (${datos.monto.toFixed(2)}) excede el saldo pendiente (${saldo.toFixed(2)}).`,
      );
    }

    return tx.pagoProveedor.create({
      data: {
        compraId: datos.compraId,
        monto: datos.monto,
        fechaPago: datos.fechaPago ? new Date(datos.fechaPago) : new Date(),
        tipo: 'normal',
        usuarioId: datos.usuarioId,
      },
    });
  });
}

// ─── Cuentas por pagar (vista derivada) ───────────────────────────────────--

interface FilaCuenta {
  compra_id: string;
  proveedor_id: string;
  proveedor_nombre: string;
  sede_id: string;
  numero_factura: string;
  monto_total: string;
  fecha_emision: Date;
  fecha_vencimiento: Date;
  total_pagado: string;
  saldo: string;
  estado: string;
}

function aCuentaDto(f: FilaCuenta) {
  return {
    compraId: f.compra_id,
    proveedorId: f.proveedor_id,
    proveedorNombre: f.proveedor_nombre,
    sedeId: f.sede_id,
    numeroFactura: f.numero_factura,
    montoTotal: Number(f.monto_total),
    fechaEmision: f.fecha_emision,
    fechaVencimiento: f.fecha_vencimiento,
    totalPagado: Number(f.total_pagado),
    saldo: Number(f.saldo),
    estado: f.estado,
  };
}

export async function listarCuentasPorPagar(filtros: {
  sedeId?: string;
  estado?: string;
}) {
  const filas = await prisma.$queryRaw<FilaCuenta[]>`
    SELECT cpp.compra_id, cpp.proveedor_id, p.nombre AS proveedor_nombre, cpp.sede_id,
           cpp.numero_factura, cpp.monto_total, cpp.fecha_emision, cpp.fecha_vencimiento,
           cpp.total_pagado, cpp.saldo, cpp.estado
    FROM cuenta_por_pagar cpp
    JOIN proveedor p ON p.id = cpp.proveedor_id
    ORDER BY cpp.fecha_vencimiento ASC`;

  let resultado = filas;
  if (filtros.sedeId) {
    resultado = resultado.filter((f) => f.sede_id === filtros.sedeId);
  }
  if (filtros.estado) {
    resultado = resultado.filter((f) => f.estado === filtros.estado);
  }
  return resultado.map(aCuentaDto);
}
