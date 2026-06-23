import { randomUUID, randomInt } from 'node:crypto';
import { semilla } from '../helpers/db.js';
import { hashearContrasena } from '../../src/core/auth/contrasena.js';

/**
 * Fixture base de la suite de aislamiento (Fase 8): siembra DOS empresas completas
 * (A y B) vía `semilla()` (BYPASSRLS, rol owner del contenedor), igual que el
 * migrador/seed en producción. Cada empresa queda poblada con una fila de CADA
 * entidad tenant-scoped (directa y hereda) para poder afirmar, desde un actor
 * autenticado en A, que NO observa ni toca NADA de B.
 *
 * Por qué `semilla()` y no los servicios: la siembra debe ser determinista y
 * cubrir tablas sin servicio de create (auditoria, jornada, saldo). Las tablas
 * DIRECTAS llevan `empresa_id` con DEFAULT desde el GUC; como `semilla` NO fija
 * GUC, hay que pasar `empresaId` EXPLÍCITO en cada create directo (si no, caería a
 * NULL). Las "hereda" lo derivan por su FK (sede/empleado), no lo llevan.
 *
 * Campos `@unique` GLOBALES aún vigentes (Fase 3 de unicidad compuesta diferida):
 * `empleado.numero`, `empleado.qrToken`, `categoria_gasto.nombre`,
 * `dia_festivo.fecha`. Se generan con sufijo/offset único por empresa para no
 * colisionar entre A y B (ni entre corridas del fixture).
 */

export interface EmpresaSembrada {
  empresaId: string;
  sedeId: string;
  categoriaId: string;
  proveedorId: string;
  rolOperativoId: string;
  turnoId: string;
  diaFestivoId: string;
  configCobroId: string;
  empleadoId: string;
  empleadoNumero: string;
  empleadoQr: string;
  empleadoPin: string;
  kioscoId: string;
  kioscoToken: string; // token de dispositivo EN CLARO (para los tests HTTP de kiosco)
  compraId: string;
  pagoId: string;
  gastoId: string;
  ventaId: string;
  jornadaId: string;
  solicitudId: string;
  auditoriaId: string;
}

export interface DosEmpresas {
  A: EmpresaSembrada;
  B: EmpresaSembrada;
}

let contador = 0;

/** Siembra UNA empresa completa (todas las entidades tenant-scoped). */
async function sembrarEmpresaCompleta(etiqueta: string): Promise<EmpresaSembrada> {
  const db = semilla();
  const i = (contador += 1);
  const u = `${etiqueta}-${i}-${randomUUID().slice(0, 8)}`; // unicidad de uniques globales

  const empresa = await db.empresa.create({
    data: { nombre: `Empresa ${etiqueta}`, slug: `f8-${u}` },
  });
  const empresaId = empresa.id;

  // ── Directas (empresa_id EXPLÍCITO) ───────────────────────────────────────
  const sede = await db.sede.create({ data: { nombre: `Sede ${u}`, empresaId } });
  const categoria = await db.categoriaGasto.create({
    data: { nombre: `Cat ${u}`, empresaId },
  });
  const proveedor = await db.proveedor.create({ data: { nombre: `Prov ${u}`, empresaId } });
  const rolOperativo = await db.rolOperativo.create({
    data: { clave: `cajera`, nombre: 'Cajera', empresaId },
  });
  const turno = await db.turno.create({
    data: { nombre: `Turno ${u}`, horaInicio: '08:00', horaFin: '17:00', empresaId },
  });
  // dia_festivo.fecha es @unique GLOBAL (granularidad de día) y la base efímera se
  // ACUMULA entre archivos de test (sin truncate). Una fecha aleatoria en ~5500 años
  // hace la colisión ínfima, pero una sola colisión rompería TODO el fixture (P2002)
  // → flaky. Se reintenta con otra fecha aleatoria para que NO sea fuente de
  // flakiness: el reintento es determinista en el resultado (siempre crea una fila).
  const fechaAleatoria = () =>
    new Date(Date.UTC(1970, 0, 1) + randomInt(0, 2_000_000) * 86_400_000);
  let diaFestivo;
  for (let intento = 0; ; intento++) {
    try {
      diaFestivo = await db.diaFestivo.create({
        data: { fecha: fechaAleatoria(), nombre: `Festivo ${u}`, empresaId },
      });
      break;
    } catch (e) {
      const colision = typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
      if (colision && intento < 8) continue; // fecha repetida: reintenta con otra
      throw e;
    }
  }
  const configCobro = await db.configuracionCobro.create({ data: { empresaId } });

  // ── Empleado + kiosco (kiosco con token conocido para los tests HTTP) ──────
  const empleadoPin = '5293';
  const empleadoNumero = `E-${u}`;
  const empleadoQr = `qr-${u}`;
  const empleado = await db.empleado.create({
    data: {
      numero: empleadoNumero,
      nombre: `Empleado ${etiqueta}`,
      sedeId: sede.id,
      qrToken: empleadoQr,
      pinHash: await hashearContrasena(empleadoPin),
      salarioFijo: 1200,
    },
  });
  const kioscoToken = randomUUID() + randomUUID(); // secreto largo en claro
  const kiosco = await db.kiosco.create({
    data: { nombre: `K ${u}`, sedeId: sede.id, tokenHash: await hashearContrasena(kioscoToken) },
  });

  // ── Dinero (hereda) ───────────────────────────────────────────────────────
  const compra = await db.compra.create({
    data: {
      proveedorId: proveedor.id,
      sedeId: sede.id,
      numeroFactura: `F-${u}`,
      montoTotal: 500,
      tipo: 'credito',
      fechaEmision: new Date('2026-01-05'),
      fechaVencimiento: new Date('2026-02-05'),
    },
  });
  const pago = await db.pagoProveedor.create({
    data: { compraId: compra.id, monto: 200, fechaPago: new Date('2026-01-08'), usuarioId: randomUUID() },
  });
  const gasto = await db.gasto.create({
    data: {
      categoriaId: categoria.id,
      sedeId: sede.id,
      monto: 100,
      fechaOperacion: new Date('2026-01-10'),
      usuarioId: randomUUID(),
    },
  });
  const venta = await db.ventaDiaria.create({
    data: {
      sedeId: sede.id,
      fechaOperacion: new Date('2026-01-12'),
      turno: 'manana',
      cajera: `C-${u}`,
      cerradoPor: `J-${u}`,
      monto: 300,
      usuarioId: randomUUID(),
      detalles: { create: [{ tipoArqueo: 'efectivo', monto: 300 }] },
    },
  });

  // ── Asistencia (hereda) ───────────────────────────────────────────────────
  const jornada = await db.jornada.create({
    data: { empleadoId: empleado.id, fecha: new Date('2026-01-14') },
  });
  await db.saldoHorasExtra.create({ data: { empleadoId: empleado.id, saldo: 50 } });
  const solicitud = await db.solicitudCobro.create({
    data: { empleadoId: empleado.id, monto: 40, estado: 'pendiente' },
  });

  // ── Auditoría (directa, append-only; la siembra el owner) ─────────────────
  const auditoria = await db.auditoria.create({
    data: {
      empresaId,
      entidad: 'sede',
      entidadId: sede.id,
      accion: 'crear',
      usuarioId: randomUUID(),
    },
  });

  return {
    empresaId,
    sedeId: sede.id,
    categoriaId: categoria.id,
    proveedorId: proveedor.id,
    rolOperativoId: rolOperativo.id,
    turnoId: turno.id,
    diaFestivoId: diaFestivo.id,
    configCobroId: configCobro.id,
    empleadoId: empleado.id,
    empleadoNumero,
    empleadoQr,
    empleadoPin,
    kioscoId: kiosco.id,
    kioscoToken,
    compraId: compra.id,
    pagoId: pago.id,
    gastoId: gasto.id,
    ventaId: venta.id,
    jornadaId: jornada.id,
    solicitudId: solicitud.id,
    auditoriaId: auditoria.id,
  };
}

/** Siembra dos empresas A y B aisladas, cada una con una fila de cada entidad. */
export async function sembrarDosEmpresas(): Promise<DosEmpresas> {
  const A = await sembrarEmpresaCompleta('A');
  const B = await sembrarEmpresaCompleta('B');
  return { A, B };
}
