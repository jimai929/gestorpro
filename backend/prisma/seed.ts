// Cargar el entorno antes de importar el cliente Prisma (que lee DATABASE_URL).
import '../src/core/entorno.js';
import { prisma } from '../src/core/prisma.js';
import { hashearContrasena } from '../src/core/auth/contrasena.js';
import { Rol } from '../src/generated/prisma/enums.js';

/**
 * Semilla de la base de datos de GestorPro.
 *
 * Crea una sede base y el usuario administrador inicial (los usuarios los crea
 * un administrador; no hay registro abierto). Idempotente: se puede correr
 * varias veces sin duplicar.
 */
async function main(): Promise<void> {
  // Sede base (idempotente por nombre).
  let sede = await prisma.sede.findFirst({ where: { nombre: 'Sede Central' } });
  if (!sede) {
    sede = await prisma.sede.create({ data: { nombre: 'Sede Central' } });
  }

  // Usuario administrador inicial.
  const email = 'admin@gestorpro.local';
  const passwordHash = await hashearContrasena('Admin1234*');
  const admin = await prisma.usuario.upsert({
    where: { email },
    update: {},
    create: {
      nombre: 'Administrador',
      email,
      rol: Rol.administrador,
      passwordHash,
    },
  });

  await sembrarCategoriasGasto();
  await sembrarDemoFinanzas(admin.id, sede.id);

  console.log('Semilla aplicada:');
  console.log(`  Sede:    ${sede.nombre} (${sede.id})`);
  console.log(`  Usuario: ${email}  /  Admin1234*  (rol administrador)`);
}

/**
 * Categorías de gasto base. Idempotente (upsert por nombre único). Incluye una
 * categoría de pago a empleado para ejercitar la regla de coherencia.
 */
async function sembrarCategoriasGasto(): Promise<void> {
  const categorias = [
    { nombre: 'Servicios públicos', esPagoEmpleado: false },
    { nombre: 'Alquiler', esPagoEmpleado: false },
    { nombre: 'Mantenimiento', esPagoEmpleado: false },
    { nombre: 'Pago a empleado', esPagoEmpleado: true },
  ];
  for (const categoria of categorias) {
    await prisma.categoriaGasto.upsert({
      where: { nombre: categoria.nombre },
      update: {},
      create: categoria,
    });
  }
}

/**
 * Datos de demostración de cuentas por pagar: proveedores y facturas que cubren
 * los cuatro estados (pagada, parcial, vencida, por vencer). Idempotente: si ya
 * existe el primer proveedor de demo, no hace nada.
 */
async function sembrarDemoFinanzas(adminId: string, sedeId: string): Promise<void> {
  const yaSembrado = await prisma.proveedor.findFirst({
    where: { nombre: 'Distribuidora Istmo S.A.' },
  });
  if (yaSembrado) return;

  const hoy = Date.now();
  const dias = (n: number): Date => new Date(hoy + n * 86_400_000);

  const istmo = await prisma.proveedor.create({
    data: { nombre: 'Distribuidora Istmo S.A.', identificacionFiscal: 'RUC-8-123-456' },
  });
  const tropical = await prisma.proveedor.create({
    data: { nombre: 'Importadora Tropical', identificacionFiscal: 'RUC-2-987-654' },
  });
  const global = await prisma.proveedor.create({
    data: { nombre: 'Suministros Global' },
  });

  // Factura pagada por completo.
  const pagada = await prisma.compra.create({
    data: {
      proveedorId: istmo.id, sedeId, numeroFactura: 'FAC-1001',
      montoTotal: 1200, fechaEmision: dias(-40), fechaVencimiento: dias(-10),
    },
  });
  await prisma.pagoProveedor.create({
    data: { compraId: pagada.id, monto: 1200, fechaPago: dias(-12), tipo: 'normal', usuarioId: adminId },
  });

  // Factura con abono parcial.
  const parcial = await prisma.compra.create({
    data: {
      proveedorId: tropical.id, sedeId, numeroFactura: 'FAC-2002',
      montoTotal: 800, fechaEmision: dias(-20), fechaVencimiento: dias(10),
    },
  });
  await prisma.pagoProveedor.create({
    data: { compraId: parcial.id, monto: 300, fechaPago: dias(-5), tipo: 'normal', usuarioId: adminId },
  });

  // Factura vencida sin pagos.
  await prisma.compra.create({
    data: {
      proveedorId: global.id, sedeId, numeroFactura: 'FAC-3003',
      montoTotal: 450, fechaEmision: dias(-50), fechaVencimiento: dias(-5),
    },
  });

  // Factura por vencer (debida), sin pagos.
  await prisma.compra.create({
    data: {
      proveedorId: istmo.id, sedeId, numeroFactura: 'FAC-1002',
      montoTotal: 2000, fechaEmision: dias(-3), fechaVencimiento: dias(25),
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error: unknown) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
