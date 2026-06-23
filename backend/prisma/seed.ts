// Cargar el entorno antes de importar el cliente Prisma (que lee DATABASE_URL).
import '../src/core/entorno.js';
import { randomBytes } from 'node:crypto';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { hashearContrasena } from '../src/core/auth/contrasena.js';
import { Rol } from '../src/generated/prisma/enums.js';
import { demoHabilitado, resolverPasswordAdmin } from './seed-opciones.js';

// El seed corre como el rol PRIVILEGIADO (migrador, BYPASSRLS), igual que en
// producción (deploy.sh) y dev: ignora RLS y rellena empresa_id explícito en cada
// tabla directa. NUNCA como gestorpro_app (sujeto a RLS, no podría sembrar). En dev,
// MIGRATOR_DATABASE_URL (.env); en prod, deploy.sh fija DATABASE_URL=migrador en el
// paso de seed (por eso el fallback).
const prisma = new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.MIGRATOR_DATABASE_URL ?? process.env.DATABASE_URL,
  }),
});

/**
 * Semilla de la base de datos de GestorPro.
 *
 * Siembra SIEMPRE lo base (prod-safe): sede inicial, admin, catálogos y
 * configuración. Los datos de DEMOSTRACIÓN (proveedores/compras/cierres y
 * empleados/kiosco de prueba) solo se siembran en desarrollo o con `SEED_DEMO`
 * explícito — ver `seed-opciones.ts`. Idempotente: se puede correr varias veces
 * sin duplicar.
 */

/**
 * Token de dispositivo del kiosco DEMO (SOLO desarrollo). En producción el token
 * se genera al dar de alta el kiosco y no se hardcodea. En dev, configúralo en la
 * pantalla del kiosco (/kiosco) con este valor para poder fichar.
 */
const TOKEN_KIOSCO_DEMO = 'demo-kiosco-token';

async function main(): Promise<void> {
  const demoOn = demoHabilitado(process.env);

  // Empresa por defecto PRIMERO: sede y catálogos llevan empresa_id NOT NULL, así
  // que la empresa debe existir antes. Idempotente por slug (también la crea el
  // backfill Ola 2).
  const empresaDefault = await prisma.empresa.upsert({
    where: { slug: 'default' },
    update: {},
    create: { nombre: 'Empresa Default', slug: 'default' },
  });

  // Sede base (idempotente por nombre), ligada a la empresa default.
  let sede = await prisma.sede.findFirst({ where: { nombre: 'Sede Central' } });
  if (!sede) {
    sede = await prisma.sede.create({
      data: { nombre: 'Sede Central', empresaId: empresaDefault.id },
    });
  }

  // Usuario administrador inicial. La contraseña viene de ADMIN_PASSWORD; en
  // producción es obligatoria (sin default débil) — ver resolverPasswordAdmin.
  // `usuario` está EXCLUIDA de RLS: no lleva empresa_id.
  const email = process.env.ADMIN_EMAIL ?? 'admin@gestorpro.local';
  const passwordHash = await hashearContrasena(resolverPasswordAdmin(process.env, demoOn));
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

  // Membresía del admin en la empresa default: el login EXIGE membresía, así que
  // sin ella el admin no podría entrar tras un seed fresco.
  await prisma.membresia.upsert({
    where: {
      usuarioId_empresaId: { usuarioId: admin.id, empresaId: empresaDefault.id },
    },
    update: {},
    create: {
      usuarioId: admin.id,
      empresaId: empresaDefault.id,
      rol: Rol.administrador,
      predeterminada: true,
    },
  });

  // Base (prod-safe): catálogos y configuración.
  await sembrarRolesOperativos(empresaDefault.id);
  await sembrarCategoriasGasto(empresaDefault.id);
  await sembrarConfiguracionCobro(empresaDefault.id);

  // Datos de demostración: solo en desarrollo (o con SEED_DEMO=true).
  if (demoOn) {
    // Los empleados (con sus roles operativos) antes de los cierres, para que la
    // cajera/verificador de los cierres demo correspondan a empleados reales.
    await sembrarDemoAsistencia(empresaDefault.id, sede.id);
    await sembrarDemoFinanzas(empresaDefault.id, admin.id, sede.id);
  }

  console.log('Semilla aplicada:');
  console.log(`  Sede:    ${sede.nombre} (${sede.id})`);
  console.log(`  Admin:   ${email}${process.env.ADMIN_PASSWORD ? '' : '  (contraseña por defecto de desarrollo)'}`);
  console.log(`  Datos demo: ${demoOn ? 'sí' : 'no (modo producción)'}`);
}

/**
 * Roles operativos base (cajera, verificador). Catálogo extensible: añadir un
 * rol nuevo (vendedor, técnico, …) es agregar una entrada aquí. Idempotente
 * (upsert por `clave`).
 */
async function sembrarRolesOperativos(empresaId: string): Promise<void> {
  const roles = [
    { clave: 'cajera', nombre: 'Cajera' },
    { clave: 'verificador', nombre: 'Verificador' },
  ];
  for (const rol of roles) {
    await prisma.rolOperativo.upsert({
      // clave única POR empresa (compuesta): el upsert ya no colisiona entre tenants.
      where: { empresaId_clave: { empresaId, clave: rol.clave } },
      update: {},
      create: { ...rol, empresaId },
    });
  }
}

/** Configuración de cobro por defecto (80% cobrable, umbral B/. 100). Idempotente. */
async function sembrarConfiguracionCobro(empresaId: string): Promise<void> {
  const existe = await prisma.configuracionCobro.findFirst({ where: { empresaId } });
  if (!existe) {
    await prisma.configuracionCobro.create({ data: { empresaId } });
  }
}

/**
 * Categorías de gasto base. Idempotente (upsert por nombre único). Incluye una
 * categoría de pago a empleado para ejercitar la regla de coherencia.
 */
async function sembrarCategoriasGasto(empresaId: string): Promise<void> {
  const categorias = [
    { nombre: 'Servicios públicos', esPagoEmpleado: false },
    { nombre: 'Alquiler', esPagoEmpleado: false },
    { nombre: 'Mantenimiento', esPagoEmpleado: false },
    { nombre: 'Pago a empleado', esPagoEmpleado: true },
  ];
  for (const categoria of categorias) {
    await prisma.categoriaGasto.upsert({
      // Fase 3: nombre UNICO POR EMPRESA → upsert por la clave compuesta.
      where: { empresaId_nombre: { empresaId, nombre: categoria.nombre } },
      update: {},
      create: { ...categoria, empresaId },
    });
  }
}

/**
 * Datos de demostración de cuentas por pagar: proveedores y facturas que cubren
 * los cuatro estados (pagada, parcial, vencida, por vencer). Idempotente: si ya
 * existe el primer proveedor de demo, no hace nada.
 */
async function sembrarDemoFinanzas(
  empresaId: string,
  adminId: string,
  sedeId: string,
): Promise<void> {
  const yaSembrado = await prisma.proveedor.findFirst({
    where: { nombre: 'Distribuidora Istmo S.A.' },
  });
  if (yaSembrado) return;

  const hoy = Date.now();
  const dias = (n: number): Date => new Date(hoy + n * 86_400_000);

  // proveedor es tabla DIRECTA (empresa_id); compra/pago/gasto/venta "heredan" por FK.
  const istmo = await prisma.proveedor.create({
    data: { nombre: 'Distribuidora Istmo S.A.', identificacionFiscal: 'RUC-8-123-456', empresaId },
  });
  const tropical = await prisma.proveedor.create({
    data: { nombre: 'Importadora Tropical', identificacionFiscal: 'RUC-2-987-654', empresaId },
  });
  const global = await prisma.proveedor.create({
    data: { nombre: 'Suministros Global', empresaId },
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

  // Gastos de demo (categorías sembradas antes). Fase 3: nombre es UNICO POR EMPRESA
  // → findFirst con empresaId (findUnique ya no aplica a un campo no-unico).
  const catServicios = await prisma.categoriaGasto.findFirst({
    where: { empresaId, nombre: 'Servicios públicos' },
  });
  const catAlquiler = await prisma.categoriaGasto.findFirst({
    where: { empresaId, nombre: 'Alquiler' },
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

  // Cierres de caja de demo: varios con sede/fecha/turno/cajera distintos (sin
  // violar uq_venta_normal), cada uno con su arqueo (efectivo + tarjeta + Yappy
  // + lotería). El total cuadra con la suma del arqueo. `cajera` es snapshot
  // limpio de un empleado con rol CAJERA; `cerradoPor`, de uno con rol
  // VERIFICADOR. Cajeras: E001, E002, E004. Verificadores (cierran): E001, E003.
  // E002 y E004 solo son cajeras y nunca aparecen en `cerradoPor`.
  await prisma.ventaDiaria.create({
    data: {
      sedeId, fechaOperacion: dias(-1), turno: 'manana', cajera: 'E001 - María Pérez', cerradoPor: 'E003 - Luis Gómez',
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
      sedeId, fechaOperacion: dias(-1), turno: 'tarde', cajera: 'E002 - Ana Ruiz', cerradoPor: 'E001 - María Pérez',
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
      sedeId, fechaOperacion: dias(-1), turno: 'noche', cajera: 'E004 - Carlos Méndez', cerradoPor: 'E003 - Luis Gómez',
      horaApertura: '22:00', horaCierre: '06:00', monto: 880, tipo: 'normal', usuarioId: adminId,
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
      sedeId, fechaOperacion: dias(-2), turno: 'manana', cajera: 'E002 - Ana Ruiz', cerradoPor: 'E001 - María Pérez',
      horaApertura: '06:00', horaCierre: '14:00', monto: 740, tipo: 'normal', usuarioId: adminId,
      detalles: {
        create: [
          { tipoArqueo: 'efectivo', monto: 540 },
          { tipoArqueo: 'yappy', monto: 200 },
        ],
      },
    },
  });
  await prisma.ventaDiaria.create({
    data: {
      sedeId, fechaOperacion: dias(-2), turno: 'tarde', cajera: 'E001 - María Pérez', cerradoPor: 'E003 - Luis Gómez',
      horaApertura: '14:00', horaCierre: '22:00', monto: 990, tipo: 'normal', usuarioId: adminId,
      detalles: {
        create: [
          { tipoArqueo: 'efectivo', monto: 700 },
          { tipoArqueo: 'tarjeta', monto: 290 },
        ],
      },
    },
  });
}

/**
 * Datos de demostración de asistencia: un kiosco y los empleados demo con PIN
 * hasheado y roles operativos asignados (cajera / verificador), suficientes para
 * ejercitar los selects de cajera y verificador del cierre. El PIN de demo es
 * 1234.
 *
 * IDEMPOTENTE POR ENTIDAD (no aborta todo si un empleado ya existe): cada pieza
 * se crea solo si falta y los roles se (re)asignan siempre, de modo que correrlo
 * dos veces no duplica ni deja empleados sin sus roles.
 */
async function sembrarDemoAsistencia(empresaId: string, sedeId: string): Promise<void> {
  // Kiosco con token de dispositivo (idempotente por nombre + sede). Si ya existe
  // sin token (datos previos a esta versión), se le asigna el token demo.
  const tokenHashDemo = await hashearContrasena(TOKEN_KIOSCO_DEMO);
  const kiosco = await prisma.kiosco.findFirst({ where: { nombre: 'Kiosco Entrada', sedeId } });
  if (!kiosco) {
    await prisma.kiosco.create({
      data: { nombre: 'Kiosco Entrada', sedeId, tokenHash: tokenHashDemo },
    });
  } else if (!kiosco.tokenHash) {
    await prisma.kiosco.update({ where: { id: kiosco.id }, data: { tokenHash: tokenHashDemo } });
  }

  // Turno (idempotente por nombre).
  let turno = await prisma.turno.findFirst({ where: { nombre: 'Turno General' } });
  if (!turno) {
    turno = await prisma.turno.create({
      data: {
        nombre: 'Turno General',
        sedeId,
        empresaId,
        horaInicio: '08:00',
        horaFin: '17:00',
        toleranciaMin: 10,
        pausaPorDefectoMin: 60,
        diaDescanso: 0, // domingo
      },
    });
  }

  const cajera = await prisma.rolOperativo.findUniqueOrThrow({
    where: { empresaId_clave: { empresaId, clave: 'cajera' } },
  });
  const verificador = await prisma.rolOperativo.findUniqueOrThrow({
    where: { empresaId_clave: { empresaId, clave: 'verificador' } },
  });

  const pinHash = await hashearContrasena('1234');
  const qr = () => randomBytes(24).toString('base64url');

  // Empleados demo con sus roles operativos:
  //   E001 María Pérez   → cajera + verificador (cubre ambos puestos)
  //   E002 Ana Ruiz      → cajera
  //   E003 Luis Gómez    → verificador
  //   E004 Carlos Méndez → cajera
  const empleados = [
    { numero: 'E001', nombre: 'María Pérez', salario: 1200, roles: [cajera.id, verificador.id] },
    { numero: 'E002', nombre: 'Ana Ruiz', salario: 1000, roles: [cajera.id] },
    { numero: 'E003', nombre: 'Luis Gómez', salario: 1100, roles: [verificador.id] },
    { numero: 'E004', nombre: 'Carlos Méndez', salario: 1000, roles: [cajera.id] },
  ];
  for (const e of empleados) {
    // El empleado se crea si falta; si ya existe, se reafirman sus datos demo
    // (sin regenerar qr/pin para no invalidar accesos en cada corrida).
    const empleado = await prisma.empleado.upsert({
      // Fase 3: numero UNICO POR EMPRESA → upsert por la clave compuesta. El seed
      // corre como migrador (BYPASSRLS, sin GUC) → empresa_id explicito en create.
      where: { empresaId_numero: { empresaId, numero: e.numero } },
      update: { nombre: e.nombre, salarioFijo: e.salario, sedeId, turnoId: turno.id, activo: true },
      create: {
        empresaId,
        numero: e.numero,
        nombre: e.nombre,
        sedeId,
        turnoId: turno.id,
        qrToken: qr(),
        pinHash,
        salarioFijo: e.salario,
      },
    });
    // Roles operativos: idempotente por la clave compuesta (empleado, rol). Se
    // asignan siempre, aunque el empleado ya existiera sin ellos.
    for (const rolOperativoId of e.roles) {
      await prisma.empleadoRolOperativo.upsert({
        where: { empleadoId_rolOperativoId: { empleadoId: empleado.id, rolOperativoId } },
        update: {},
        create: { empleadoId: empleado.id, rolOperativoId },
      });
    }
  }

  // Días festivos (idempotente: (empresa, fecha) es única, se omiten duplicados).
  await prisma.diaFestivo.createMany({
    data: [
      { fecha: new Date('2026-05-01'), nombre: 'Día del Trabajador', empresaId },
      { fecha: new Date('2026-11-03'), nombre: 'Separación de Panamá de Colombia', empresaId },
    ],
    skipDuplicates: true,
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
