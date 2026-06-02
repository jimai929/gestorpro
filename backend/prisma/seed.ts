// Cargar el entorno antes de importar el cliente Prisma (que lee DATABASE_URL).
import '../src/core/entorno.js';
import { randomBytes } from 'node:crypto';
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

  await sembrarRolesOperativos();
  await sembrarCategoriasGasto();
  // Los empleados (con sus roles operativos) antes de los cierres, para que la
  // cajera/verificador de los cierres demo correspondan a empleados reales.
  await sembrarDemoAsistencia(sede.id);
  await sembrarDemoFinanzas(admin.id, sede.id);
  await sembrarConfiguracionCobro();

  console.log('Semilla aplicada:');
  console.log(`  Sede:    ${sede.nombre} (${sede.id})`);
  console.log(`  Usuario: ${email}  /  Admin1234*  (rol administrador)`);
}

/**
 * Roles operativos base (cajera, verificador). Catálogo extensible: añadir un
 * rol nuevo (vendedor, técnico, …) es agregar una entrada aquí. Idempotente
 * (upsert por `clave`).
 */
async function sembrarRolesOperativos(): Promise<void> {
  const roles = [
    { clave: 'cajera', nombre: 'Cajera' },
    { clave: 'verificador', nombre: 'Verificador' },
  ];
  for (const rol of roles) {
    await prisma.rolOperativo.upsert({
      where: { clave: rol.clave },
      update: {},
      create: rol,
    });
  }
}

/** Configuración de cobro por defecto (80% cobrable, umbral B/. 100). Idempotente. */
async function sembrarConfiguracionCobro(): Promise<void> {
  const existe = await prisma.configuracionCobro.findFirst();
  if (!existe) {
    await prisma.configuracionCobro.create({ data: {} });
  }
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

  // Gastos de demo (categorías sembradas antes).
  const catServicios = await prisma.categoriaGasto.findUnique({
    where: { nombre: 'Servicios públicos' },
  });
  const catAlquiler = await prisma.categoriaGasto.findUnique({
    where: { nombre: 'Alquiler' },
  });
  if (catServicios) {
    await prisma.gasto.create({
      data: {
        categoriaId: catServicios.id, sedeId, monto: 185.4,
        fechaOperacion: dias(-15), descripcion: 'Electricidad', tipo: 'normal',
        usuarioId: adminId,
      },
    });
  }
  if (catAlquiler) {
    await prisma.gasto.create({
      data: {
        categoriaId: catAlquiler.id, sedeId, monto: 1500,
        fechaOperacion: dias(-10), descripcion: 'Alquiler del local (mayo)',
        tipo: 'normal', usuarioId: adminId,
      },
    });
  }

  // Cierres de caja de demo: varios el mismo día con caja/turno distintos, cada
  // uno con su arqueo (efectivo + tarjeta + Yappy + lotería). El total cuadra
  // con la suma del arqueo.
  await prisma.ventaDiaria.create({
    data: {
      sedeId, fechaOperacion: dias(-1), turno: 'manana', cajera: 'E001 - María Pérez', cerradoPor: 'E004 - Carlos Méndez',
      horaApertura: '06:00', horaCierre: '14:00', monto: 1200, tipo: 'normal', usuarioId: adminId,
      detalles: {
        create: [
          { tipoArqueo: 'efectivo', monto: 700 },
          { tipoArqueo: 'tarjeta', monto: 350 },
          { tipoArqueo: 'yappy', monto: 120 },
          { tipoArqueo: 'loteria', monto: 30 },
        ],
      },
    },
  });
  await prisma.ventaDiaria.create({
    data: {
      sedeId, fechaOperacion: dias(-1), turno: 'tarde', cajera: 'E002 - Luis Gómez', cerradoPor: 'E001 - María Pérez',
      horaApertura: '14:00', horaCierre: '22:00', monto: 1530.5, tipo: 'normal', usuarioId: adminId,
      detalles: {
        create: [
          { tipoArqueo: 'efectivo', monto: 980.5 },
          { tipoArqueo: 'tarjeta', monto: 450 },
          { tipoArqueo: 'yappy', monto: 100 },
        ],
      },
    },
  });
  await prisma.ventaDiaria.create({
    data: {
      sedeId, fechaOperacion: dias(-1), turno: 'manana', cajera: 'E003 - Ana Ruiz', cerradoPor: 'E004 - Carlos Méndez',
      horaApertura: '06:00', horaCierre: '14:00', monto: 880, tipo: 'normal', usuarioId: adminId,
      detalles: {
        create: [
          { tipoArqueo: 'efectivo', monto: 600 },
          { tipoArqueo: 'tarjeta', monto: 230 },
          { tipoArqueo: 'loteria', monto: 50 },
        ],
      },
    },
  });
  await prisma.ventaDiaria.create({
    data: {
      sedeId, fechaOperacion: dias(-2), turno: 'noche', cajera: 'E002 - Luis Gómez', cerradoPor: 'E001 - María Pérez',
      horaApertura: '22:00', horaCierre: '06:00', monto: 740, tipo: 'normal', usuarioId: adminId,
      detalles: {
        create: [
          { tipoArqueo: 'efectivo', monto: 540 },
          { tipoArqueo: 'yappy', monto: 200 },
        ],
      },
    },
  });
}

/**
 * Datos de demostración de asistencia: un kiosco y varios empleados con PIN
 * hasheado y roles operativos asignados (cajera / verificador), suficientes para
 * ejercitar los selects de cajera y verificador del cierre. Idempotente (guarda
 * por el número del primer empleado). El PIN de demo es 1234.
 */
async function sembrarDemoAsistencia(sedeId: string): Promise<void> {
  const yaSembrado = await prisma.empleado.findUnique({ where: { numero: 'E001' } });
  if (yaSembrado) return;

  await prisma.kiosco.create({ data: { nombre: 'Kiosco Entrada', sedeId } });

  const turno = await prisma.turno.create({
    data: {
      nombre: 'Turno General',
      sedeId,
      horaInicio: '08:00',
      horaFin: '17:00',
      toleranciaMin: 10,
      pausaPorDefectoMin: 60,
      diaDescanso: 0, // domingo
    },
  });

  const cajera = await prisma.rolOperativo.findUniqueOrThrow({ where: { clave: 'cajera' } });
  const verificador = await prisma.rolOperativo.findUniqueOrThrow({
    where: { clave: 'verificador' },
  });

  const pinHash = await hashearContrasena('1234');
  const qr = () => randomBytes(24).toString('base64url');

  // Empleados demo con sus roles operativos. María y Luis son cajera+verificador
  // (cubren varios puestos); Ana solo cajera; Carlos solo verificador.
  const empleados = [
    { numero: 'E001', nombre: 'María Pérez', salario: 1200, roles: [cajera.id, verificador.id] },
    { numero: 'E002', nombre: 'Luis Gómez', salario: 1100, roles: [cajera.id, verificador.id] },
    { numero: 'E003', nombre: 'Ana Ruiz', salario: 1000, roles: [cajera.id] },
    { numero: 'E004', nombre: 'Carlos Méndez', salario: 1000, roles: [verificador.id] },
  ];
  for (const e of empleados) {
    await prisma.empleado.create({
      data: {
        numero: e.numero,
        nombre: e.nombre,
        sedeId,
        turnoId: turno.id,
        qrToken: qr(),
        pinHash,
        salarioFijo: e.salario,
        rolesOperativos: { create: e.roles.map((rolOperativoId) => ({ rolOperativoId })) },
      },
    });
  }

  await prisma.diaFestivo.createMany({
    data: [
      { fecha: new Date('2026-05-01'), nombre: 'Día del Trabajador' },
      { fecha: new Date('2026-11-03'), nombre: 'Separación de Panamá de Colombia' },
    ],
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
