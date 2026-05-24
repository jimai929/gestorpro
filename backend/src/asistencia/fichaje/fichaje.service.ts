import { prisma } from '../../core/prisma.js';
import {
  ErrorAutenticacion,
  ErrorNoEncontrado,
  ErrorValidacion,
} from '../../core/errors.js';
import { verificarContrasena } from '../../core/auth/contrasena.js';
import { identificarEmpleado } from './identificacion.service.js';
import { recalcularJornadaPorSalida } from '../jornada/jornada.service.js';
import {
  verificadorFacialSimulado,
  facialExitosa,
  type VerificadorFacial,
} from './verificador-facial.js';

/** Excepciones recientes (7 días) que disparan la alerta a RRHH. */
const UMBRAL_ALERTA_RRHH = 3;

type TipoFichaje = 'entrada' | 'salida_comida' | 'entrada_comida' | 'salida';

export interface SolicitudFichaje {
  kioscoId: string;
  tipo: TipoFichaje;
  numero?: string;
  qrToken?: string;
  fotoCaptura: string;
  pin?: string;
  supervisorEmail?: string;
  supervisorPassword?: string;
}

/**
 * Servicio de fichaje. Orquesta identificación → verificación facial → (si el
 * facial falla) fichaje de excepción por PIN o supervisor según el
 * `modoExcepcion` de la sede. Todo fichaje de excepción queda marcado para
 * revisión del jefe. El verificador facial es enchufable (simulado por defecto).
 */
export function crearServicioFichaje(
  verificador: VerificadorFacial = verificadorFacialSimulado,
) {
  return {
    async fichar(solicitud: SolicitudFichaje) {
      const empleado = await identificarEmpleado({
        numero: solicitud.numero,
        qrToken: solicitud.qrToken,
      });

      const kiosco = await prisma.kiosco.findUnique({
        where: { id: solicitud.kioscoId },
      });
      if (!kiosco || !kiosco.activo) {
        throw new ErrorNoEncontrado('Kiosco no encontrado o inactivo.');
      }

      const facial = await verificador.verificar({
        fotoReferencia: empleado.fotoReferencia,
        fotoCaptura: solicitud.fotoCaptura,
      });

      // Camino feliz: el facial coincide y hay vida → fichaje normal.
      if (facialExitosa(facial)) {
        const fichaje = await prisma.fichaje.create({
          data: {
            empleadoId: empleado.id,
            kioscoId: kiosco.id,
            tipo: solicitud.tipo,
            esExcepcion: false,
            fotoCaptura: solicitud.fotoCaptura,
          },
        });
        // Al cerrar la salida, la jornada se calcula sola.
        if (solicitud.tipo === 'salida') {
          await recalcularJornadaPorSalida(empleado.id, fichaje.momento);
        }
        return { estado: 'registrado' as const, mecanismo: 'facial' as const, fichaje };
      }

      // El facial falló → fichaje de excepción según el modo de la sede.
      const sede = await prisma.sede.findUnique({ where: { id: empleado.sedeId } });
      const modo = sede?.modoExcepcion ?? 'pin';
      const permitePin = modo === 'pin' || modo === 'ambos';
      const permiteSupervisor = modo === 'supervisor' || modo === 'ambos';

      let mecanismo: 'pin' | 'supervisor' | null = null;

      if (solicitud.pin !== undefined) {
        if (!permitePin) {
          throw new ErrorValidacion('Esta sede no permite excepción por PIN.');
        }
        const ok = await verificarContrasena(empleado.pinHash, solicitud.pin);
        if (!ok) {
          throw new ErrorAutenticacion('PIN incorrecto.');
        }
        mecanismo = 'pin';
      } else if (solicitud.supervisorEmail !== undefined) {
        if (!permiteSupervisor) {
          throw new ErrorValidacion('Esta sede no permite excepción por supervisor.');
        }
        const supervisor = await prisma.usuario.findUnique({
          where: { email: solicitud.supervisorEmail },
        });
        const autorizado =
          supervisor !== null &&
          supervisor.activo &&
          (supervisor.rol === 'supervisor' || supervisor.rol === 'administrador') &&
          solicitud.supervisorPassword !== undefined &&
          (await verificarContrasena(supervisor.passwordHash, solicitud.supervisorPassword));
        if (!autorizado) {
          throw new ErrorAutenticacion('Autorización de supervisor inválida.');
        }
        mecanismo = 'supervisor';
      }

      // Sin mecanismo de excepción: el kiosco debe pedirlo según el modo.
      if (mecanismo === null) {
        return { estado: 'requiere_excepcion' as const, modoExcepcion: modo };
      }

      const fichaje = await prisma.fichaje.create({
        data: {
          empleadoId: empleado.id,
          kioscoId: kiosco.id,
          tipo: solicitud.tipo,
          esExcepcion: true,
          mecanismoExcepcion: mecanismo,
          requiereRevision: true,
          fotoCaptura: solicitud.fotoCaptura,
        },
      });

      if (solicitud.tipo === 'salida') {
        await recalcularJornadaPorSalida(empleado.id, fichaje.momento);
      }

      // Alerta a RRHH si el empleado acumula muchas excepciones recientes
      // (la foto de referencia podría necesitar reemplazo).
      const desde = new Date(Date.now() - 7 * 86_400_000);
      const excepcionesRecientes = await prisma.fichaje.count({
        where: { empleadoId: empleado.id, esExcepcion: true, momento: { gte: desde } },
      });

      return {
        estado: 'registrado' as const,
        mecanismo,
        fichaje,
        alertaRRHH: excepcionesRecientes >= UMBRAL_ALERTA_RRHH,
      };
    },
  };
}

// ─── Cola de revisión y decisión del jefe ───────────────────────────────────

/** Fichajes de excepción aún sin revisar (cola del jefe). */
export function colaRevision(filtros: { sedeId?: string }) {
  return prisma.fichaje.findMany({
    where: {
      esExcepcion: true,
      revision: null,
      ...(filtros.sedeId ? { empleado: { sedeId: filtros.sedeId } } : {}),
    },
    orderBy: { momento: 'desc' },
    include: { empleado: { select: { numero: true, nombre: true } }, kiosco: { select: { nombre: true } } },
  });
}

/** Registra la decisión del jefe sobre un fichaje de excepción (no muta el fichaje). */
export async function revisarFichaje(datos: {
  fichajeId: string;
  jefeId: string;
  valido: boolean;
  motivo?: string;
}) {
  const fichaje = await prisma.fichaje.findUnique({
    where: { id: datos.fichajeId },
    include: { revision: true },
  });
  if (!fichaje || !fichaje.esExcepcion) {
    throw new ErrorNoEncontrado('Fichaje de excepción no encontrado.');
  }
  if (fichaje.revision) {
    throw new ErrorValidacion('Este fichaje ya fue revisado.');
  }
  return prisma.revisionFichaje.create({
    data: {
      fichajeId: datos.fichajeId,
      jefeId: datos.jefeId,
      valido: datos.valido,
      motivo: datos.motivo ?? null,
    },
  });
}
