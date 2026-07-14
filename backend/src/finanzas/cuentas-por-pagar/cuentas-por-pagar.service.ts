import { txEmpresa } from '../../core/tenant/contexto.js';
import {
  ErrorConflicto,
  ErrorNoEncontrado,
  ErrorValidacion,
} from '../../core/errors.js';
import { resumirCorreccion } from '../../shared/services/correccion.estado.js';

/** Redondea a 2 decimales (los montos ya vienen de Decimal; esto solo evita 0.1+0.2). */
function redondearDinero(n: number): number {
  return Math.round(n * 100) / 100;
}

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
  telefono?: string;
  personaContacto?: string;
}

export function crearProveedor(datos: DatosProveedor) {
  return txEmpresa((tx) =>
    tx.proveedor.create({
      data: {
        nombre: datos.nombre,
        identificacionFiscal: datos.identificacionFiscal ?? null,
        telefono: datos.telefono ?? null,
        personaContacto: datos.personaContacto ?? null,
      },
    }),
  );
}

/**
 * Edita un proveedor. Actualización parcial: solo se tocan los campos presentes
 * en `datos` (un campo de texto en `null` lo borra; ausente lo deja igual). El
 * proveedor nunca se borra; la baja es lógica vía `activo`.
 */
export interface DatosEditarProveedor {
  nombre?: string;
  identificacionFiscal?: string | null;
  telefono?: string | null;
  personaContacto?: string | null;
  activo?: boolean;
}

export async function editarProveedor(id: string, datos: DatosEditarProveedor) {
  const data = {
    ...(datos.nombre !== undefined ? { nombre: datos.nombre } : {}),
    ...(datos.identificacionFiscal !== undefined
      ? { identificacionFiscal: datos.identificacionFiscal }
      : {}),
    ...(datos.telefono !== undefined ? { telefono: datos.telefono } : {}),
    ...(datos.personaContacto !== undefined
      ? { personaContacto: datos.personaContacto }
      : {}),
    ...(datos.activo !== undefined ? { activo: datos.activo } : {}),
  };
  try {
    return await txEmpresa((tx) => tx.proveedor.update({ where: { id }, data }));
  } catch (error) {
    if (esErrorPrisma(error, 'P2025')) {
      throw new ErrorNoEncontrado('El proveedor indicado no existe.');
    }
    throw error;
  }
}

/**
 * Lista proveedores con su DEUDA TOTAL viva. Con `soloActivos` filtra los dados de
 * baja (para selectores).
 *
 * `deudaTotal` = Σ del `saldo` pendiente de sus facturas en la vista `cuenta_por_pagar`
 * (solo crédito, neto de reversos; el contado no genera saldo). La suma se hace en SQL
 * (`numeric` Decimal) y solo se convierte a `number` en la frontera JSON — nunca se acumula
 * en float. La vista es `security_invoker`, así que la agregación corre bajo el contexto RLS
 * de `txEmpresa`: solo cuenta las facturas del tenant actual (fail-closed).
 */
export function listarProveedores(filtros?: { soloActivos?: boolean }) {
  return txEmpresa(async (tx) => {
    const proveedores = await tx.proveedor.findMany({
      where: filtros?.soloActivos ? { activo: true } : {},
      orderBy: { nombre: 'asc' },
    });
    const deudas = await tx.$queryRaw<Array<{ proveedor_id: string; deuda_total: string }>>`
      SELECT proveedor_id, SUM(saldo) AS deuda_total
      FROM cuenta_por_pagar
      GROUP BY proveedor_id`;
    const porProveedor = new Map(deudas.map((d) => [d.proveedor_id, Number(d.deuda_total)]));
    return proveedores.map((p) => ({ ...p, deudaTotal: porProveedor.get(p.id) ?? 0 }));
  });
}

// ─── Compras ──────────────────────────────────────────────────────────────--

export interface DatosCompra {
  proveedorId: string;
  sedeId: string;
  numeroFactura: string;
  montoTotal: number;
  tipo: 'contado' | 'credito';
  fechaEmision: string;
  /** Obligatoria para crédito; ignorada (sin vencimiento) para contado. */
  fechaVencimiento?: string;
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
  // El crédito necesita vencimiento (define cuándo se debe); el contado no lo
  // tiene porque se paga en el acto y no genera cuenta por pagar.
  if (datos.tipo === 'credito' && !datos.fechaVencimiento) {
    throw new ErrorValidacion('Una compra a crédito requiere fecha de vencimiento.');
  }
  try {
    const compra = await txEmpresa(async (tx) => {
      // Validar que proveedor y sede son VISIBLES para el tenant. Bajo RLS, uno de
      // OTRA empresa (o inexistente) no se ve → "no existen" (422), en vez de un
      // 500 por violación de WITH CHECK. Cubre además la FK-injection cross-tenant
      // vía body (§6c): el padre se valida contra el empresaId del token.
      const proveedor = await tx.proveedor.findUnique({
        where: { id: datos.proveedorId },
        select: { id: true },
      });
      const sede = await tx.sede.findUnique({
        where: { id: datos.sedeId },
        select: { id: true },
      });
      if (!proveedor || !sede) {
        throw new ErrorValidacion('El proveedor o la sede indicados no existen.');
      }
      return tx.compra.create({
        data: {
          proveedorId: datos.proveedorId,
          sedeId: datos.sedeId,
          numeroFactura: datos.numeroFactura,
          montoTotal: datos.montoTotal,
          tipo: datos.tipo,
          fechaEmision: new Date(datos.fechaEmision),
          fechaVencimiento:
            datos.tipo === 'credito' && datos.fechaVencimiento
              ? new Date(datos.fechaVencimiento)
              : null,
        },
      });
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
  const compras = await txEmpresa((tx) =>
    tx.compra.findMany({
      where: filtros.sedeId ? { sedeId: filtros.sedeId } : {},
      orderBy: { fechaEmision: 'desc' },
      include: { proveedor: true },
    }),
  );
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
 *
 * El aislamiento va EXPLÍCITO porque el guard depende de la semántica de
 * READ COMMITTED: tras esperar el `FOR UPDATE`, el SUM debe ver el pago ya
 * commiteado por la tx ganadora; bajo REPEATABLE READ (un
 * `default_transaction_isolation` bastaría para activarlo) el snapshot stale
 * dejaría entrar AMBOS pagos. El timeout holgado cubre la espera del lock
 * bajo contención (el default de Prisma es 5 s e incluye esa espera).
 */
export async function registrarPago(datos: DatosPago) {
  if (datos.monto <= 0) {
    throw new ErrorValidacion('El monto del pago debe ser mayor que cero.');
  }

  return txEmpresa(async (tx) => {
    const compras = await tx.$queryRaw<Array<{ monto_total: string; tipo: string }>>`
      SELECT monto_total, tipo FROM compra WHERE id = ${datos.compraId}::uuid FOR UPDATE`;
    if (compras.length === 0) {
      throw new ErrorNoEncontrado('La compra no existe.');
    }
    // Una compra de contado ya está pagada en el acto y no genera cuenta por
    // pagar; abonarle crearía un pago invisible en la vista cuenta_por_pagar.
    if (compras[0]?.tipo === 'contado') {
      throw new ErrorValidacion('Una compra de contado se paga en el acto y no admite abonos.');
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
  }, { tx: { isolationLevel: 'ReadCommitted', timeout: 15000 } });
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
  const filas = await txEmpresa((tx) =>
    tx.$queryRaw<FilaCuenta[]>`
      SELECT cpp.compra_id, cpp.proveedor_id, p.nombre AS proveedor_nombre, cpp.sede_id,
             cpp.numero_factura, cpp.monto_total, cpp.fecha_emision, cpp.fecha_vencimiento,
             cpp.total_pagado, cpp.saldo, cpp.estado
      FROM cuenta_por_pagar cpp
      JOIN proveedor p ON p.id = cpp.proveedor_id
      WHERE (${filtros.sedeId ?? null}::uuid IS NULL OR cpp.sede_id = ${filtros.sedeId ?? null}::uuid)
        AND (${filtros.estado ?? null}::text IS NULL OR cpp.estado = ${filtros.estado ?? null}::text)
      ORDER BY cpp.fecha_vencimiento ASC`,
  );

  return filas.map(aCuentaDto);
}

// ─── Historial de pagos (lectura) ───────────────────────────────────────────

/** Estados de corrección por los que se puede filtrar el historial. */
export type EstadoPago = 'vigente' | 'corregido' | 'anulado';

export interface FiltrosPagos {
  proveedorId?: string;
  desde?: string;
  hasta?: string;
  estado?: EstadoPago;
  pagina?: number;
  tamano?: number;
}

/** Tamaño de página por defecto y máximo (evita respuestas ilimitadas). */
const TAMANO_PAGINA_DEFECTO = 20;
const TAMANO_PAGINA_MAXIMO = 100;

/**
 * `where` de Prisma para el historial. Se comparte entre la página, el conteo y
 * el resumen: los tres tienen que hablar exactamente del MISMO conjunto.
 *
 * Solo movimientos `normal` (los asientos de reverso/corrección cuelgan de ellos,
 * no son filas del historial). El estado se traduce a la existencia de asientos,
 * que es la MISMA definición que usa `resumirCorreccion`:
 *   vigente   → sin reverso
 *   anulado   → con reverso y sin corrección
 *   corregido → con corrección
 */
function whereHistorial(filtros: FiltrosPagos) {
  const rango =
    filtros.desde || filtros.hasta
      ? {
          fechaPago: {
            ...(filtros.desde ? { gte: new Date(filtros.desde) } : {}),
            ...(filtros.hasta ? { lte: new Date(filtros.hasta) } : {}),
          },
        }
      : {};

  const porEstado =
    filtros.estado === 'vigente'
      ? { correcciones: { none: { tipo: 'reverso' as const } } }
      : filtros.estado === 'anulado'
        ? {
            AND: [
              { correcciones: { some: { tipo: 'reverso' as const } } },
              { correcciones: { none: { tipo: 'correccion' as const } } },
            ],
          }
        : filtros.estado === 'corregido'
          ? { correcciones: { some: { tipo: 'correccion' as const } } }
          : {};

  return {
    tipo: 'normal' as const,
    ...(filtros.proveedorId ? { compra: { proveedorId: filtros.proveedorId } } : {}),
    ...rango,
    ...porEstado,
  };
}

/**
 * Historial de pagos a proveedor de la empresa actual (RLS vía `txEmpresa`:
 * `pago_proveedor` hereda el tenant por su compra → sede → empresa).
 *
 * Devuelve la página pedida MÁS un resumen calculado sobre TODO el conjunto
 * filtrado (no solo la página): el usuario ve el total real de lo que filtró.
 * El estado y el monto vigente salen de `resumirCorreccion` — el mismo algoritmo
 * que usan los listados de gastos y cierres; aquí no hay una segunda versión.
 *
 * Nota de modelo: `PagoProveedor` NO tiene método de pago, referencia ni notas.
 * No se inventan: se expone lo que existe (compra/factura, monto, fecha, quién lo
 * registró y cuándo).
 */
export async function listarPagos(filtros: FiltrosPagos) {
  const pagina = Math.max(1, Math.trunc(filtros.pagina ?? 1));
  const tamano = Math.min(
    TAMANO_PAGINA_MAXIMO,
    Math.max(1, Math.trunc(filtros.tamano ?? TAMANO_PAGINA_DEFECTO)),
  );
  const where = whereHistorial(filtros);

  const { filas, total, todos } = await txEmpresa(async (tx) => {
    // Página + conteo + material del resumen. El resumen se lee aparte porque debe
    // cubrir TODO el filtro, no la página: se piden solo monto y asientos (proyección
    // mínima), no las relaciones de presentación.
    const [filas, total, todos] = await Promise.all([
      tx.pagoProveedor.findMany({
        where,
        orderBy: [{ fechaPago: 'desc' }, { creadoEn: 'desc' }],
        skip: (pagina - 1) * tamano,
        take: tamano,
        select: {
          id: true,
          monto: true,
          fechaPago: true,
          creadoEn: true,
          usuarioId: true,
          compra: {
            select: {
              id: true,
              numeroFactura: true,
              montoTotal: true,
              proveedor: { select: { id: true, nombre: true } },
            },
          },
          // Asientos colgados (reverso y, si la hubo, corrección): de aquí sale el estado.
          correcciones: { select: { tipo: true, monto: true, motivo: true } },
        },
      }),
      tx.pagoProveedor.count({ where }),
      tx.pagoProveedor.findMany({
        where,
        select: { monto: true, correcciones: { select: { tipo: true, monto: true, motivo: true } } },
      }),
    ]);
    return { filas, total, todos };
  });

  // Nombres de quien registró cada pago: UNA consulta para todos los ids de la
  // página (nada de N+1). `usuario` está fuera de RLS (allowlist) y solo se
  // resuelven los ids que ya vinieron en los pagos de esta empresa.
  const idsUsuario = [...new Set(filas.map((p) => p.usuarioId))];
  const usuarios = idsUsuario.length
    ? await txEmpresa((tx) =>
        tx.usuario.findMany({
          where: { id: { in: idsUsuario } },
          select: { id: true, nombre: true },
        }),
      )
    : [];
  const nombrePorUsuario = new Map(usuarios.map((u) => [u.id, u.nombre]));

  const pagos = filas.map((p) => {
    const monto = Number(p.monto);
    const resumen = resumirCorreccion(monto, p.correcciones);
    return {
      id: p.id,
      fechaPago: p.fechaPago,
      monto, // monto ORIGINAL (inmutable)
      ...resumen, // estado · montoVigente · motivoCorreccion
      compraId: p.compra.id,
      numeroFactura: p.compra.numeroFactura,
      montoFactura: Number(p.compra.montoTotal),
      proveedorId: p.compra.proveedor.id,
      proveedorNombre: p.compra.proveedor.nombre,
      registradoPor: nombrePorUsuario.get(p.usuarioId) ?? null,
      creadoEn: p.creadoEn,
    };
  });

  // Resumen del CONJUNTO filtrado completo (mismo `where`, mismo algoritmo de estado).
  const resumen = todos.reduce(
    (acc, p) => {
      const monto = Number(p.monto);
      const { montoVigente } = resumirCorreccion(monto, p.correcciones);
      acc.totalOriginal += monto;
      acc.totalVigente += montoVigente;
      return acc;
    },
    { cantidad: total, totalOriginal: 0, totalVigente: 0 },
  );

  return {
    pagos,
    paginacion: {
      pagina,
      tamano,
      total,
      paginas: Math.max(1, Math.ceil(total / tamano)),
    },
    resumen: {
      cantidad: resumen.cantidad,
      totalOriginal: redondearDinero(resumen.totalOriginal),
      totalVigente: redondearDinero(resumen.totalVigente),
      // Lo que las correcciones quitaron (o añadieron, si el importe correcto era mayor).
      diferencia: redondearDinero(resumen.totalOriginal - resumen.totalVigente),
    },
  };
}
