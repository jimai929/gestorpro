import { txEmpresa } from '../tenant/contexto.js';
import { ErrorConflicto } from '../errors.js';
import { hashearContrasena } from '../auth/contrasena.js';
import { auditoriaRepo } from '../../shared/repositories/auditoria.repository.js';
import type { Rol } from '../../generated/prisma/enums.js';

function esErrorPrisma(error: unknown, codigo: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === codigo
  );
}

/** Roles que un admin de tenant PUEDE asignar (lista blanca; nunca de plataforma). */
export type RolAsignable = 'administrador' | 'empleado';

export interface DatosNuevoUsuario {
  nombre: string;
  email: string;
  password: string;
  rol: RolAsignable;
}

export interface UsuarioCreado {
  id: string;
  nombre: string;
  email: string;
  rol: RolAsignable;
}

/**
 * Crea un USUARIO dentro del tenant del admin que ejecuta la acción, con su membresía
 * (rol per-tenant) y un asiento de auditoría, TODO en una transacción. Misma forma que
 * `crearEmpresa` PERO sin `bypassPlataforma`: corre bajo RLS normal (contexto de tenant
 * del token).
 *
 * Reglas de seguridad (ver rutas):
 * - `empresaId` SIEMPRE del token (request.user.empresaId), NUNCA del body.
 * - `esSuperAdmin` no se toca: el nuevo usuario queda con el default `false`.
 * - `rol` viene ya restringido por el schema de la ruta a administrador|empleado.
 * - La contraseña se hashea con argon2 (reusado); NUNCA se guarda ni audita en claro.
 */
export async function crearUsuarioEnTenant(
  datos: DatosNuevoUsuario,
  empresaId: string,
  adminId: string,
): Promise<UsuarioCreado> {
  const rol: Rol = datos.rol;
  try {
    // FUENTE ÚNICA del tenant: se pasa `empresaId` (del token) como override a txEmpresa,
    // así el GUC de RLS, el empresa_id por DEFAULT de la auditoría y el de la membresía
    // derivan TODOS del mismo valor (la función no depende de que la ALS esté poblada).
    return await txEmpresa(
      async (tx) => {
        const passwordHash = await hashearContrasena(datos.password);
        const usuario = await tx.usuario.create({
          data: {
            nombre: datos.nombre,
            email: datos.email,
            rol,
            passwordHash,
            // esSuperAdmin NO se toca: queda en su default `false`.
          },
        });
        await tx.membresia.create({
          data: {
            usuarioId: usuario.id,
            empresaId, // ← del token, NUNCA del body
            rol,
            predeterminada: true,
          },
        });
        await auditoriaRepo.registrar(
          {
            entidad: 'usuario',
            entidadId: usuario.id,
            accion: 'crear_usuario',
            usuarioId: adminId,
            // empresa_id OMITIDO → lo rellena el DEFAULT desde el GUC, que aquí es el
            // `empresaId` del override. `detalle` SIN contraseña: jamás en claro.
            detalle: { email: usuario.email, rol },
          },
          tx,
        );
        return { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: datos.rol };
      },
      { empresaId },
    );
  } catch (error) {
    // El email es UNIQUE GLOBAL: si ya existe (en CUALQUIER tenant) → P2002. Conflicto
    // genérico que NO revela a qué tenant pertenece (anti-enumeración).
    if (esErrorPrisma(error, 'P2002')) {
      throw new ErrorConflicto('El email ya está en uso.');
    }
    throw error;
  }
}
