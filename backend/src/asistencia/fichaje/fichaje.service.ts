import { contextoTenantActual, txEmpresa } from '../../core/tenant/contexto.js';
import {
  ErrorAutenticacion,
  ErrorNoEncontrado,
  ErrorValidacion,
} from '../../core/errors.js';
import { verificarContrasena } from '../../core/auth/contrasena.js';
import { identificarEmpleado } from './identificacion.service.js';
import { recalcularJornadaPorSalida } from '../jornada/jornada.service.js';
import {
  crearVerificadorFacial,
  facialExitosa,
  type VerificadorFacial,
} from './verificador-facial.js';

/** Excepciones recientes (7 días) que disparan la alerta a RRHH. */
const UMBRAL_ALERTA_RRHH = 3;

/**
 * ¿Se marca para revisión TODO fichaje (incluido el facial exitoso)? Riesgo
 * aceptado mientras el verificador facial sea el simulado: sin biometría real,
 * el jefe debe poder revisar cualquier fichaje. Se activa con
 * `FICHAJE_REVISION_TOTAL=true` (ver DESPLIEGUE.md §4.2).
 */
function revisionTotalPorDefecto(): boolean {
  return (process.env.FICHAJE_REVISION_TOTAL ?? '').toLowerCase() === 'true';
}

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
  verificador: VerificadorFacial = crearVerificadorFacial(),
  opciones: { revisionTotal?: boolean } = {},
) {
  const revisionTotal = opciones.revisionTotal ?? revisionTotalPorDefecto();
  return {
    async fichar(solicitud: SolicitudFichaje) {
      const empleado = await identificarEmpleado({
        numero: solicitud.numero,
        qrToken: solicitud.qrToken,
      });

      const kiosco = await txEmpresa((tx) =>
        tx.kiosco.findUnique({ where: { id: solicitud.kioscoId } }),
      );
      if (!kiosco || !kiosco.activo) {
        throw new ErrorNoEncontrado('Kiosco no encontrado o inactivo.');
      }

      const facial = await verificador.verificar({
        fotoReferencia: empleado.fotoReferencia,
        fotoCaptura: solicitud.fotoCaptura,
      });

      // Camino feliz: el facial coincide y hay vida → fichaje normal. Con
      // `revisionTotal` se marca igualmente para revisión (verificador simulado).
      if (facialExitosa(facial)) {
        const fichaje = await txEmpresa((tx) =>
          tx.fichaje.create({
            data: {
              empleadoId: empleado.id,
              kioscoId: kiosco.id,
              tipo: solicitud.tipo,
              esExcepcion: false,
              requiereRevision: revisionTotal,
              fotoCaptura: solicitud.fotoCaptura,
            },
          }),
        );
        // Al cerrar la salida, la jornada se calcula sola.
        if (solicitud.tipo === 'salida') {
          await recalcularJornadaPorSalida(empleado.id, fichaje.momento);
        }
        return {
          estado: 'registrado' as const,
          mecanismo: 'facial' as const,
          fichaje,
          requiereRevision: revisionTotal,
        };
      }

      // El facial falló → fichaje de excepción según el modo de la sede.
      const sede = await txEmpresa((tx) =>
        tx.sede.findUnique({ where: { id: empleado.sedeId } }),
      );
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
        // usuario está EXCLUIDA de RLS (login sin contexto); la lectura es global.
        const supervisor = await txEmpresa((tx) =>
          tx.usuario.findUnique({ where: { email: solicitud.supervisorEmail } }),
        );
        // Frontera de TENANT: la autorización decide por la MEMBRESÍA del
        // supervisor en la empresa del kiosco (el contexto lo fijó la ruta desde
        // el token de dispositivo, nunca del body), NO por el Usuario.rol global
        // (dato legado, retirado de autorización — ARQUITECTURA_MULTITENANT §4.2).
        // Sin esto, credenciales de un supervisor de la empresa B autorizaban
        // fichajes en el kiosco de la empresa A. `membresia` está FUERA de RLS:
        // la consulta va explícita por (usuarioId, empresaId), jamás abierta.
        // empresaId null → membresia null → rechazo (fail-closed). Una cuenta de
        // plataforma nunca tiene membresía (§4.2), así que queda excluida sola.
        const { empresaId } = contextoTenantActual();
        const membresia =
          supervisor !== null && empresaId !== null
            ? await txEmpresa((tx) =>
                tx.membresia.findUnique({
                  where: { usuarioId_empresaId: { usuarioId: supervisor.id, empresaId } },
                }),
              )
            : null;
        // Un solo error para TODOS los fallos (no existe / sin membresía / rol
        // insuficiente / temporal sin rotar / contraseña mala): sin enumeración.
        // debeCambiarContrasena: una credencial TEMPORAL fijada por un tercero no
        // autoriza excepciones — este camino usa credenciales crudas y el guard de
        // cambio forzado (solo rutas JWT) no lo cubre; se exige aquí (política).
        const autorizado =
          supervisor !== null &&
          supervisor.activo &&
          !supervisor.debeCambiarContrasena &&
          membresia !== null &&
          (membresia.rol === 'supervisor' || membresia.rol === 'administrador') &&
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

      const fichaje = await txEmpresa((tx) =>
        tx.fichaje.create({
          data: {
            empleadoId: empleado.id,
            kioscoId: kiosco.id,
            tipo: solicitud.tipo,
            esExcepcion: true,
            mecanismoExcepcion: mecanismo,
            requiereRevision: true,
            fotoCaptura: solicitud.fotoCaptura,
          },
        }),
      );

      if (solicitud.tipo === 'salida') {
        await recalcularJornadaPorSalida(empleado.id, fichaje.momento);
      }

      // Alerta a RRHH si el empleado acumula muchas excepciones recientes
      // (la foto de referencia podría necesitar reemplazo).
      const desde = new Date(Date.now() - 7 * 86_400_000);
      const excepcionesRecientes = await txEmpresa((tx) =>
        tx.fichaje.count({
          where: { empleadoId: empleado.id, esExcepcion: true, momento: { gte: desde } },
        }),
      );

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

/**
 * Fichajes pendientes de revisión del jefe, sin revisar aún. Incluye los de
 * excepción (facial fallido + PIN/supervisor) y, si `FICHAJE_REVISION_TOTAL`
 * está activo, también los faciales marcados para revisión: ambos llevan
 * `requiereRevision = true`.
 */
export function colaRevision(filtros: { sedeId?: string }) {
  return txEmpresa((tx) =>
    tx.fichaje.findMany({
      where: {
        requiereRevision: true,
        revision: null,
        ...(filtros.sedeId ? { empleado: { sedeId: filtros.sedeId } } : {}),
      },
      orderBy: { momento: 'desc' },
      include: { empleado: { select: { numero: true, nombre: true } }, kiosco: { select: { nombre: true } } },
    }),
  );
}

/** Registra la decisión del jefe sobre un fichaje de excepción (no muta el fichaje). */
export async function revisarFichaje(datos: {
  fichajeId: string;
  jefeId: string;
  valido: boolean;
  motivo?: string;
}) {
  return txEmpresa(async (tx) => {
    const fichaje = await tx.fichaje.findUnique({
      where: { id: datos.fichajeId },
      include: { revision: true },
    });
    if (!fichaje || (!fichaje.esExcepcion && !fichaje.requiereRevision)) {
      throw new ErrorNoEncontrado('Fichaje pendiente de revisión no encontrado.');
    }
    if (fichaje.revision) {
      throw new ErrorValidacion('Este fichaje ya fue revisado.');
    }
    return tx.revisionFichaje.create({
      data: {
        fichajeId: datos.fichajeId,
        jefeId: datos.jefeId,
        valido: datos.valido,
        motivo: datos.motivo ?? null,
      },
    });
  });
}
