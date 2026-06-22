import { describe, it, expect, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { construirApp } from '../../src/app.js';
import { txEmpresa } from '../../src/core/tenant/contexto.js';
import { semilla, comoEmpresa, crearEmpresa, cerrarSemilla } from '../helpers/db.js';
import {
  recalcularJornadaPorSalida,
  barrerHuerfanos,
  corregirJornada,
  crearJornadaManual,
} from '../../src/asistencia/jornada/jornada.service.js';
import { crearServicioFichaje } from '../../src/asistencia/fichaje/fichaje.service.js';
import { obtenerSaldo } from '../../src/asistencia/cobro/saldo.service.js';
import { ErrorNoEncontrado, ErrorValidacion } from '../../src/core/errors.js';

afterAll(cerrarSemilla);

let n = 0;
async function crearEmpleadoConTurno(empresaId: string) {
  n += 1;
  const s = `${n}-${Date.now()}`;
  // sede y turno son tablas DIRECTAS (empresa_id NOT NULL) → empresaId explícito.
  const sede = await semilla().sede.create({ data: { nombre: `Sede ${s}`, empresaId } });
  const turno = await semilla().turno.create({
    data: { nombre: `Turno ${s}`, sedeId: sede.id, empresaId, horaInicio: '08:00', horaFin: '17:00', pausaPorDefectoMin: 60 },
  });
  // kiosco/empleado "heredan" empresa por su FK (sin empresa_id propio).
  const kiosco = await semilla().kiosco.create({ data: { nombre: `K ${s}`, sedeId: sede.id } });
  const empleado = await semilla().empleado.create({
    data: { numero: `E${s}`, nombre: 'E', sedeId: sede.id, turnoId: turno.id, qrToken: `qr${s}`, pinHash: 'x', salarioFijo: 1200 },
  });
  return { sede, turno, kiosco, empleado };
}

describe('motor de jornada (persistencia)', () => {
  it('recalcula y guarda la jornada al cerrar la salida', async () => {
    const empresaId = await crearEmpresa();
    const { empleado, kiosco } = await crearEmpleadoConTurno(empresaId);
    // Hora local: el motor clasifica diurna/nocturna por la hora local del servidor.
    const dia = (h: number, m = 0) => new Date(2026, 3, 15, h, m);
    for (const [tipo, hora] of [
      ['entrada', 8],
      ['salida_comida', 12],
      ['entrada_comida', 13],
      ['salida', 17],
    ] as const) {
      await semilla().fichaje.create({
        data: { empleadoId: empleado.id, kioscoId: kiosco.id, tipo, momento: dia(hora) },
      });
    }

    const jornada = await comoEmpresa(empresaId, () => recalcularJornadaPorSalida(empleado.id, dia(17)));
    expect(jornada).not.toBeNull();
    expect(jornada?.minutosTrabajados).toBe(480); // 9h − 1h pausa
    expect(jornada?.clasificacion).toBe('diurna');
    expect(jornada?.anomalia).toBe(false);
  });

  it('el job marca como anomalía una entrada sin salida pasada la ventana de 16h', async () => {
    const empresaId = await crearEmpresa();
    const { empleado, kiosco } = await crearEmpleadoConTurno(empresaId);
    const hace17h = new Date(Date.now() - 17 * 60 * 60 * 1000);
    await semilla().fichaje.create({
      data: { empleadoId: empleado.id, kioscoId: kiosco.id, tipo: 'entrada', momento: hace17h },
    });

    // barrerHuerfanos es un job de PLATAFORMA: itera empresas y fija su propio
    // contexto por empresa internamente → no se envuelve en comoEmpresa.
    const marcadas = await barrerHuerfanos(new Date());
    expect(marcadas).toBeGreaterThanOrEqual(1);

    // POSITIVA bajo RLS: el job (per-tenant) creó la jornada de ESTA empresa; el
    // tenant la ve bajo su contexto. Prueba que el job escribió en el tenant correcto.
    const jornada = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) =>
        tx.jornada.findFirst({ where: { empleadoId: empleado.id, anomalia: true } }),
      ),
    );
    expect(jornada).not.toBeNull();
    expect(jornada?.detalleAnomalia).toMatch(/sin salida/i);
  });

  it('fichar la salida dispara el cálculo de la jornada automáticamente', async () => {
    const empresaId = await crearEmpresa();
    const { empleado, kiosco } = await crearEmpleadoConTurno(empresaId);
    const servicio = crearServicioFichaje();
    await comoEmpresa(empresaId, () =>
      servicio.fichar({ kioscoId: kiosco.id, tipo: 'entrada', numero: empleado.numero, fotoCaptura: 'sim:match' }),
    );
    await comoEmpresa(empresaId, () =>
      servicio.fichar({ kioscoId: kiosco.id, tipo: 'salida', numero: empleado.numero, fotoCaptura: 'sim:match' }),
    );

    // POSITIVA bajo RLS: el tenant ve la jornada que el fichaje le calculó.
    const jornada = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) => tx.jornada.findFirst({ where: { empleadoId: empleado.id } })),
    );
    expect(jornada).not.toBeNull();
  });

  it('el jefe corrige una jornada: registra la Correccion y la sobreescribe', async () => {
    const empresaId = await crearEmpresa();
    const { empleado } = await crearEmpleadoConTurno(empresaId);
    const jornada = await semilla().jornada.create({
      data: {
        empleadoId: empleado.id, fecha: new Date(Date.UTC(2026, 3, 16)),
        minutosTrabajados: 0, anomalia: true, detalleAnomalia: 'Fichaje incompleto', estado: 'anomalia',
      },
    });
    // usuario está EXCLUIDA de RLS (sin empresa_id) → se siembra sin empresaId.
    const jefe = await semilla().usuario.create({
      data: { nombre: 'Jefe', email: `jefe-j${n}-${Date.now()}@gestorpro.local`, rol: 'administrador', passwordHash: 'x' },
    });

    const corregida = await comoEmpresa(empresaId, () =>
      corregirJornada({
        jornadaId: jornada.id, jefeId: jefe.id, motivo: 'Ajuste manual: olvidó fichar la salida',
        minutosTrabajados: 480, resolverAnomalia: true,
      }),
    );

    expect(corregida.estado).toBe('corregida');
    expect(corregida.minutosTrabajados).toBe(480);
    expect(corregida.anomalia).toBe(false);

    // Aserción POSITIVA sin método de lectura de servicio → semilla (god-view).
    const correcciones = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) => tx.correccion.findMany({ where: { jornadaId: jornada.id } })),
    );
    expect(correcciones).toHaveLength(1);
    expect(correcciones[0]?.motivo).toMatch(/salida/i);
  });
});

describe('alta manual de jornada (día sin fichajes)', () => {
  async function nuevoJefe() {
    n += 1;
    // usuario excluida de RLS → semilla sin empresaId.
    return semilla().usuario.create({
      data: { nombre: 'Jefe', email: `jefe-man-${n}-${Date.now()}@gestorpro.local`, rol: 'administrador', passwordHash: 'x' },
    });
  }

  it('crea la jornada, registra la Correccion inmutable y acredita el saldo', async () => {
    const empresaId = await crearEmpresa();
    const { empleado } = await crearEmpleadoConTurno(empresaId);
    const jefe = await nuevoJefe();

    const jornada = await comoEmpresa(empresaId, () =>
      crearJornadaManual({
        empleadoId: empleado.id,
        fecha: '2026-04-20',
        jefeId: jefe.id,
        motivo: 'Sede sin internet todo el día; jornada registrada a mano',
        minutosTrabajados: 480,
        minutosExtra: 60,
        montoExtra: 50,
      }),
    );

    expect(jornada.estado).toBe('corregida');
    expect(jornada.minutosTrabajados).toBe(480);
    expect(jornada.minutosExtra).toBe(60);
    expect(Number(jornada.montoExtra)).toBe(50);

    // Correccion inmutable: valorAnterior marca que NO había jornada previa.
    // Aserción POSITIVA sin método de lectura de servicio → semilla (god-view).
    const correcciones = await comoEmpresa(empresaId, () =>
      txEmpresa((tx) => tx.correccion.findMany({ where: { jornadaId: jornada.id } })),
    );
    expect(correcciones).toHaveLength(1);
    expect(correcciones[0]?.valorAnterior).toEqual({ existia: false });

    // El monto extra completo se acreditó al saldo (no había jornada previa).
    // obtenerSaldo es método de servicio (txEmpresa) → se lee bajo comoEmpresa.
    expect(await comoEmpresa(empresaId, () => obtenerSaldo(empleado.id))).toBe(50);
  });

  it('rechaza el alta manual si ya existe jornada para ese empleado y fecha', async () => {
    const empresaId = await crearEmpresa();
    const { empleado } = await crearEmpleadoConTurno(empresaId);
    const jefe = await nuevoJefe();
    await comoEmpresa(empresaId, () =>
      crearJornadaManual({
        empleadoId: empleado.id, fecha: '2026-04-21', jefeId: jefe.id, motivo: 'primera', minutosTrabajados: 480,
      }),
    );
    await expect(
      comoEmpresa(empresaId, () =>
        crearJornadaManual({
          empleadoId: empleado.id, fecha: '2026-04-21', jefeId: jefe.id, motivo: 'segunda', minutosTrabajados: 100,
        }),
      ),
    ).rejects.toBeInstanceOf(ErrorValidacion);
  });

  it('rechaza el alta manual de un empleado inexistente', async () => {
    const empresaId = await crearEmpresa();
    const jefe = await nuevoJefe();
    await expect(
      comoEmpresa(empresaId, () =>
        crearJornadaManual({
          empleadoId: '00000000-0000-0000-0000-000000000000', fecha: '2026-04-22', jefeId: jefe.id,
          motivo: 'x', minutosTrabajados: 60,
        }),
      ),
    ).rejects.toBeInstanceOf(ErrorNoEncontrado);
  });

  it('rechaza una fecha futura', async () => {
    const empresaId = await crearEmpresa();
    const { empleado } = await crearEmpleadoConTurno(empresaId);
    const jefe = await nuevoJefe();
    const futuro = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    await expect(
      comoEmpresa(empresaId, () =>
        crearJornadaManual({
          empleadoId: empleado.id, fecha: futuro, jefeId: jefe.id, motivo: 'x', minutosTrabajados: 60,
        }),
      ),
    ).rejects.toBeInstanceOf(ErrorValidacion);
  });
});

describe('GET /jornadas (HTTP) bajo RLS: el tenant ve SUS jornadas, no vacío', () => {
  it('devuelve las jornadas del tenant del token (regresión: no 0 filas por GUC sin fijar)', async () => {
    process.env.JWT_ACCESS_SECRET ??= 'test-secret-jornadas';
    const empresaId = await crearEmpresa('Empresa jornadas HTTP');
    const { empleado } = await crearEmpleadoConTurno(empresaId);
    await semilla().jornada.create({
      data: {
        empleadoId: empleado.id, fecha: new Date(Date.UTC(2026, 4, 10)),
        minutosTrabajados: 480, estado: 'calculada',
      },
    });

    const app = construirApp();
    await app.ready();
    try {
      const token = app.jwt.sign({ sub: randomUUID(), rol: 'administrador', empresaId, esSuperAdmin: false });
      const res = await app.inject({
        method: 'GET',
        url: `/jornadas?empleadoId=${empleado.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(res.statusCode).toBe(200);
      const jornadas = res.json() as Array<{ empleadoId: string }>;
      // Antes del fix (lectura suelta sin txEmpresa) esto era [] bajo RLS. Ahora el
      // tenant ve su jornada porque la ruta corre listarJornadas → txEmpresa → GUC.
      expect(jornadas.length).toBeGreaterThanOrEqual(1);
      expect(jornadas.every((j) => j.empleadoId === empleado.id)).toBe(true);
    } finally {
      await app.close();
    }
  });
});

describe('tope semanal de horas extra (acumulación entre días)', () => {
  it('recorta la extra pagable del día por el tope semanal de 9h', async () => {
    const empresaId = await crearEmpresa();
    const { empleado, kiosco } = await crearEmpleadoConTurno(empresaId);

    // Día objetivo (no lunes, para que el día previo sea de la MISMA semana).
    let base = new Date(Date.UTC(2026, 5, 17, 10, 0));
    if (base.getUTCDay() === 1) base = new Date(base.getTime() + 86_400_000);
    const fecha = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
    const diaPrevio = new Date(fecha.getTime() - 86_400_000);

    // Jornada previa de la misma semana con 500 min de extra PAGABLE.
    await semilla().jornada.create({
      data: {
        empleadoId: empleado.id, fecha: diaPrevio, minutosTrabajados: 480, minutosExtra: 500,
        estado: 'calculada',
        recargosDetalle: {
          recargo: 0.25, minutosExtraPagables: 500, topeDiaExcedido: true, topeSemanaExcedido: false,
        },
      },
    });

    // Día objetivo con jornada larga (≫ tope diario) vía fichajes reales.
    const at = (h: number) =>
      new Date(Date.UTC(fecha.getUTCFullYear(), fecha.getUTCMonth(), fecha.getUTCDate(), h, 0));
    for (const [tipo, hora] of [['entrada', 10], ['salida', 22]] as const) {
      await semilla().fichaje.create({
        data: { empleadoId: empleado.id, kioscoId: kiosco.id, tipo, momento: at(hora) },
      });
    }

    const jornada = await comoEmpresa(empresaId, () => recalcularJornadaPorSalida(empleado.id, at(22)));
    expect(jornada).not.toBeNull();
    const detalle = jornada?.recargosDetalle as {
      minutosExtraPagables?: number;
      topeSemanaExcedido?: boolean;
    };
    // Quedaban 540 − 500 = 40 min del tope semanal: solo eso es pagable hoy.
    expect(detalle.topeSemanaExcedido).toBe(true);
    expect(detalle.minutosExtraPagables).toBe(40);
  });
});
